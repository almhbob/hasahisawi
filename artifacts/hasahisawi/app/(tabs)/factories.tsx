import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert, ActivityIndicator,
  RefreshControl, Modal, Pressable, Dimensions, TextInput,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";


const { width: W } = Dimensions.get("window");

const FAC   = "#F97316";
const FAC2  = "#EA580C";
const FAC3  = "#FED7AA";
const GOLD  = "#F59E0B";
const GREEN = "#22C55E";

const PLAN_COLORS: Record<string, string> = {
  premium: GOLD, standard: "#0EA5E9", basic: GREEN, free: "#6B7280",
};
const PLAN_LABELS: Record<string, string> = {
  premium: "★ بريميوم", standard: "⬡ ستاندرد", basic: "◉ أساسي", free: "● مجاني",
};

const FAC_CATS = [
  { key: "all",       label: "الكل",          icon: "apps-outline"          },
  { key: "food",      label: "غذاء",          icon: "nutrition-outline"     },
  { key: "textile",   label: "نسيج وملابس",   icon: "shirt-outline"         },
  { key: "building",  label: "مواد بناء",     icon: "business-outline"      },
  { key: "chemicals", label: "كيماويات",      icon: "flask-outline"         },
  { key: "metals",    label: "معادن",         icon: "construct-outline"     },
  { key: "agri",      label: "زراعي",         icon: "leaf-outline"          },
  { key: "consumer",  label: "استهلاكي",      icon: "basket-outline"        },
  { key: "general",   label: "عام",           icon: "cube-outline"          },
];
const CAT_LABELS: Record<string, string> = {
  food:"غذاء",textile:"نسيج وملابس",building:"مواد بناء",chemicals:"كيماويات",
  metals:"معادن",agri:"زراعي",consumer:"استهلاكي",general:"عام",
};

const STOCK_COLORS: Record<string, string> = {
  available: GREEN, limited: GOLD, out_of_stock: "#EF4444",
};
const STOCK_LABELS: Record<string, string> = {
  available: "متوفر", limited: "كمية محدودة", out_of_stock: "نفذ المخزون",
};

type Sponsor = {
  id: number; display_name: string; tagline?: string; brand_color: string;
  logo_url?: string; website?: string; package_name?: string;
};
type Factory = {
  id: number; name: string; short_name?: string; logo_initial?: string;
  brand_color: string; brand_color2?: string; description?: string;
  category: string; location?: string; phone?: string; whatsapp?: string;
  website?: string; founded?: string; employees?: string;
  promo_tagline?: string; promo_badge?: string; promo_banner_url?: string;
  package_type: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  has_priority?: boolean; has_banner?: boolean; has_promo?: boolean; has_sponsor_badge?: boolean;
  products_count?: number; is_featured?: boolean;
  contract_end?: string; [k: string]: any;
};
type Product = {
  id: number; factory_id: number; name: string; description?: string;
  category: string; price?: number; price_unit?: string; price_note?: string;
  min_order?: string; image_url?: string; stock_status: string;
  is_featured?: boolean;
  factory_name?: string; factory_color?: string; factory_logo?: string;
  factory_phone?: string; factory_whatsapp?: string; plan_icon?: string;
};

const PLAN_PACKAGES = [
  { name: "free",     label: "مجاني",    price: "0 SDG",        color: "#6B7280", icon: "●", features: ["3 منتجات فقط", "بيانات أساسية"] },
  { name: "basic",    label: "أساسي",   price: "50,000 SDG/شهر", color: GREEN,    icon: "◉", features: ["10 منتجات", "معلومات اتصال", "ظهور في القائمة"] },
  { name: "standard", label: "ستاندرد", price: "150,000 SDG/شهر",color:"#0EA5E9", icon: "⬡", features: ["30 منتجاً", "بطاقة ترويجية", "شارة مميزة", "أولوية عرض"] },
  { name: "premium",  label: "بريميوم", price: "300,000 SDG/شهر",color: GOLD,     icon: "★", features: ["منتجات غير محدودة", "بانر إعلاني", "شارة الراعي", "أعلى ترتيب", "صفحة مصنع كاملة"] },
];

// ── SponsorBanner ─────────────────────────────────────────────────────────────
function SponsorBanner({ sponsor }: { sponsor: Sponsor }) {
  const co = sponsor.brand_color || FAC;
  return (
    <Animated.View entering={FadeIn.delay(100).duration(700)} style={[styles.sponsorBanner, { borderColor: co + "50" }]}>
      <LinearGradient colors={[co + "20", co + "08", "#020C1B"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={[styles.sponsorIcon, { backgroundColor: co + "25", borderColor: co + "60" }]}>
        <Text style={{ fontSize: 22 }}>🏆</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sponsorLabel}>الراعي الرسمي للتطبيق</Text>
        <Text style={[styles.sponsorName, { color: co }]}>{sponsor.display_name}</Text>
        {sponsor.tagline && <Text style={styles.sponsorTagline}>{sponsor.tagline}</Text>}
      </View>
      {sponsor.website && (
        <TouchableOpacity style={[styles.sponsorBtn, { borderColor: co + "60", backgroundColor: co + "15" }]}
          onPress={() => Linking.openURL(sponsor.website!)}>
          <Ionicons name="open-outline" size={13} color={co} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ── FactoryCard ───────────────────────────────────────────────────────────────
function FactoryCard({ factory, onPress, index }: { factory: Factory; onPress: () => void; index: number }) {
  const co       = factory.brand_color;
  const planColor = factory.plan_color || PLAN_COLORS[factory.package_type] || "#6B7280";
  const planIcon  = factory.plan_icon  || "●";
  const contractExpired = factory.contract_end ? new Date(factory.contract_end) < new Date() : false;
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 70).springify().damping(15)}>
      <TouchableOpacity style={[styles.factoryCard, factory.is_featured && styles.factoryCardFeatured]} onPress={onPress} activeOpacity={0.85}>
        <LinearGradient colors={[co + "22", co + "06"]} style={styles.factoryCardGrad} />
        <View style={[styles.factoryStripe, { backgroundColor: co }]} />
        {factory.package_type !== "free" && (
          <View style={[styles.planRibbon, { backgroundColor: planColor + "DD" }]}>
            <Text style={styles.planRibbonText}>{planIcon} {factory.plan_name_ar || PLAN_LABELS[factory.package_type]}</Text>
          </View>
        )}
        {factory.has_sponsor_badge && (
          <View style={styles.sponsorBadge}>
            <Text style={styles.sponsorBadgeText}>🏆 راعي</Text>
          </View>
        )}
        <View style={styles.factoryCardContent}>
          <View style={[styles.factoryLogo, { backgroundColor: co }]}>
            <Text style={styles.factoryLogoText}>{factory.logo_initial || factory.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.factoryName}>{factory.name}</Text>
            {factory.promo_tagline ? (
              <Text style={[styles.promoTagline, { color: co }]} numberOfLines={1}>{factory.promo_tagline}</Text>
            ) : (
              <Text style={styles.factorySub} numberOfLines={2}>{factory.description || CAT_LABELS[factory.category] || "مصنع محلي"}</Text>
            )}
            {factory.promo_badge && (
              <View style={[styles.promoBadgePill, { backgroundColor: co + "25", borderColor: co + "60" }]}>
                <Text style={[styles.promoBadgeText, { color: co }]}>{factory.promo_badge}</Text>
              </View>
            )}
            <View style={styles.factoryMeta}>
              {factory.location && (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.metaText}>{factory.location}</Text>
                </View>
              )}
              {(factory.products_count ?? 0) > 0 && (
                <View style={styles.metaChip}>
                  <Ionicons name="cube-outline" size={10} color={co} />
                  <Text style={[styles.metaText, { color: co }]}>{factory.products_count} منتج</Text>
                </View>
              )}
              {contractExpired && (
                <View style={[styles.metaChip, { backgroundColor: "#EF444420" }]}>
                  <Text style={{ fontSize: 9, color: "#EF4444" }}>⚠️ انتهى العقد</Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={co + "80"} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── ProductCard ───────────────────────────────────────────────────────────────
function ProductCard({ product, index }: { product: Product; index: number }) {
  const co = product.factory_color || FAC;
  const stockColor = STOCK_COLORS[product.stock_status] || GREEN;
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 55).springify().damping(15)}>
      <View style={[styles.productCard, { borderColor: co + "35" }]}>
        <LinearGradient colors={[co + "14", Colors.surface2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.productHeader}>
          <View style={[styles.productCat, { backgroundColor: co + "22", borderColor: co + "44" }]}>
            <Ionicons name="cube-outline" size={10} color={co} />
            <Text style={[styles.productCatText, { color: co }]}>{CAT_LABELS[product.category] || product.category}</Text>
          </View>
          {product.factory_name && (
            <View style={[styles.productFactory, { backgroundColor: co + "18" }]}>
              <Text style={[styles.productFactoryText, { color: co }]}>{product.plan_icon} {product.factory_name}</Text>
            </View>
          )}
        </View>
        <Text style={styles.productName}>{product.name}</Text>
        {product.description && <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>}
        <View style={styles.productFooter}>
          <View>
            {product.price != null && (
              <Text style={[styles.productPrice, { color: co }]}>
                {Number(product.price).toLocaleString("ar")} {product.price_unit || "SDG"}
              </Text>
            )}
            {product.price_note && <Text style={styles.productPriceNote}>{product.price_note}</Text>}
            {product.min_order && (
              <Text style={styles.minOrder}>الحد الأدنى: {product.min_order}</Text>
            )}
            <View style={[styles.stockBadge, { backgroundColor: stockColor + "20", borderColor: stockColor + "50" }]}>
              <Text style={[styles.stockText, { color: stockColor }]}>{STOCK_LABELS[product.stock_status] || product.stock_status}</Text>
            </View>
          </View>
          <View style={styles.productActions}>
            {(product.factory_whatsapp || product.factory_phone) && (
              <TouchableOpacity
                style={[styles.contactBtn, { borderColor: GREEN + "70", backgroundColor: GREEN + "15" }]}
                onPress={() => {
                  const wa = product.factory_whatsapp;
                  const ph = product.factory_phone;
                  if (wa) Linking.openURL(`https://wa.me/${wa.replace(/\D/g, "")}`);
                  else if (ph) Linking.openURL(`tel:${ph}`);
                }}>
                <Ionicons name={product.factory_whatsapp ? "logo-whatsapp" : "call-outline"} size={16} color={GREEN} />
                <Text style={[styles.contactBtnText, { color: GREEN }]}>تواصل</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── FactoryModal ──────────────────────────────────────────────────────────────
function FactoryModal({ factory, visible, onClose, products }: {
  factory: Factory | null; visible: boolean; onClose: () => void; products: Product[];
}) {
  if (!factory) return null;
  const co = factory.brand_color;
  const planColor = factory.plan_color || PLAN_COLORS[factory.package_type] || "#6B7280";
  const myProds = products.filter(p => p.factory_id === factory.id);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.modalSheet}>
        <LinearGradient colors={[co + "30", Colors.surface3, Colors.bg]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <View style={[styles.dragBar, { backgroundColor: co + "60" }]} />
        <View style={styles.modalHeader}>
          <View style={[styles.modalLogo, { backgroundColor: co }]}>
            <Text style={styles.modalLogoText}>{factory.logo_initial || factory.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{factory.name}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <View style={[styles.planPill, { backgroundColor: planColor + "25", borderColor: planColor + "60" }]}>
                <Text style={[styles.planPillText, { color: planColor }]}>
                  {factory.plan_icon} {factory.plan_name_ar || PLAN_LABELS[factory.package_type]}
                </Text>
              </View>
              {factory.has_sponsor_badge && (
                <View style={[styles.planPill, { backgroundColor: GOLD + "25", borderColor: GOLD + "60" }]}>
                  <Text style={[styles.planPillText, { color: GOLD }]}>🏆 راعي التطبيق</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {factory.promo_tagline && (
            <View style={[styles.promoTaglineBox, { borderColor: co + "40", backgroundColor: co + "12" }]}>
              <Text style={[styles.promoTaglineBig, { color: co }]}>{factory.promo_tagline}</Text>
            </View>
          )}

          {/* معلومات الاتصال */}
          <View style={styles.modalSection}>
            <Text style={[styles.modalSectionTitle, { color: co }]}>📞 التواصل</Text>
            <View style={styles.contactGrid}>
              {factory.phone && (
                <TouchableOpacity style={[styles.contactCard, { borderColor: co + "40" }]} onPress={() => Linking.openURL(`tel:${factory.phone}`)}>
                  <Ionicons name="call" size={20} color={co} />
                  <Text style={styles.contactLabel}>الهاتف</Text>
                  <Text style={[styles.contactVal, { color: co }]}>{factory.phone}</Text>
                </TouchableOpacity>
              )}
              {factory.whatsapp && (
                <TouchableOpacity style={[styles.contactCard, { borderColor: "#25D36640" }]} onPress={() => Linking.openURL(`https://wa.me/${factory.whatsapp!.replace(/\D/g, "")}`)}>
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  <Text style={styles.contactLabel}>واتساب</Text>
                  <Text style={[styles.contactVal, { color: "#25D366" }]}>تواصل</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* تفاصيل */}
          <View style={styles.modalSection}>
            <Text style={[styles.modalSectionTitle, { color: co }]}>🏭 معلومات المصنع</Text>
            <View style={styles.statsRow}>
              {[
                { icon: "location-outline", label: "الموقع",    val: factory.location || "—" },
                { icon: "people-outline",   label: "العمالة",   val: factory.employees || "—" },
                { icon: "calendar-outline", label: "التأسيس",   val: factory.founded   || "—" },
              ].map((s, i) => (
                <View key={i} style={[styles.statBlock, { borderColor: co + "30" }]}>
                  <Ionicons name={s.icon as any} size={16} color={co} />
                  <Text style={[styles.statBlockVal, { color: co }]}>{s.val}</Text>
                  <Text style={styles.statBlockLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            {factory.description && <Text style={styles.factoryDesc}>{factory.description}</Text>}
          </View>

          {/* المنتجات */}
          {myProds.length > 0 && (
            <View style={styles.modalSection}>
              <Text style={[styles.modalSectionTitle, { color: co }]}>📦 المنتجات ({myProds.length})</Text>
              {myProds.map((p, i) => <ProductCard key={p.id} product={{ ...p, factory_color: co }} index={i} />)}
            </View>
          )}

          {factory.website && (
            <TouchableOpacity style={[styles.websiteBtn, { borderColor: co, backgroundColor: co + "18" }]}
              onPress={() => Linking.openURL(factory.website!)}>
              <Ionicons name="globe-outline" size={18} color={co} />
              <Text style={[styles.websiteBtnText, { color: co }]}>زيارة الموقع الرسمي</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 50 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── PackagesModal ──────────────────────────────────────────────────────────────
function PackagesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.modalSheet, { maxHeight: "90%" }]}>
        <LinearGradient colors={[FAC + "20", Colors.surface3, Colors.bg]} style={StyleSheet.absoluteFill} />
        <View style={[styles.dragBar, { backgroundColor: FAC + "60" }]} />
        <View style={{ padding: 20 }}>
          <Text style={[styles.modalTitle, { marginBottom: 4 }]}>📋 باقات انضمام المصانع</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: 20 }}>اختر الباقة المناسبة لتسويق منتجاتك مباشرة للمواطنين</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
          {PLAN_PACKAGES.map((pkg, i) => (
            <Animated.View key={pkg.name} entering={FadeInDown.delay(i * 100).springify()}>
              <View style={[styles.pkgCard, { borderColor: pkg.color + "50" }]}>
                <LinearGradient colors={[pkg.color + "18", Colors.surface2]} style={StyleSheet.absoluteFill} />
                <View style={styles.pkgHeader}>
                  <View style={[styles.pkgBadge, { backgroundColor: pkg.color + "25", borderColor: pkg.color + "60" }]}>
                    <Text style={[styles.pkgBadgeText, { color: pkg.color }]}>{pkg.icon} {pkg.label}</Text>
                  </View>
                  <Text style={[styles.pkgPrice, { color: pkg.color }]}>{pkg.price}</Text>
                </View>
                <View style={{ marginTop: 10, gap: 5 }}>
                  {pkg.features.map((f, j) => (
                    <View key={j} style={styles.pkgFeature}>
                      <Ionicons name="checkmark-circle" size={14} color={pkg.color} />
                      <Text style={styles.pkgFeatureText}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          ))}

          <View style={[styles.ctaBox, { borderColor: FAC + "50", backgroundColor: FAC + "12" }]}>
            <Text style={[styles.ctaTitle, { color: FAC }]}>🚀 سجّل مصنعك الآن</Text>
            <Text style={styles.ctaDesc}>للتسجيل والحصول على بيانات دخول بوابة المصنع، تواصل مع إدارة حصاحيصاوي</Text>
            <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: "#25D366" }]}
              onPress={() => { onClose(); Linking.openURL("https://wa.me/966597083352?text=أرغب%20في%20تسجيل%20مصنعي%20في%20تطبيق%20حصاحيصاوي"); }}>
              <Ionicons name="logo-whatsapp" size={16} color="#fff" />
              <Text style={styles.ctaBtnText}>تواصل عبر واتساب</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════════
export default function FactoriesScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;

  const [tab, setTab]                   = useState<"factories" | "products">("factories");
  const [sponsor, setSponsor]           = useState<Sponsor | null>(null);
  const [factories, setFactories]       = useState<Factory[]>([]);
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [facCat, setFacCat]             = useState("all");
  const [prodCat, setProdCat]           = useState("all");
  const [search, setSearch]             = useState("");
  const [selectedFactory, setSelectedFactory] = useState<Factory | null>(null);
  const [modalVisible, setModalVisible]       = useState(false);
  const [pkgModal, setPkgModal]               = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const base = getApiUrl();
      const [sponsorR, facR, prodR] = await Promise.allSettled([
        fetchWithTimeout(`${base}/app/sponsor`, {}, 8000),
        fetchWithTimeout(`${base}/factories`, {}, 12000),
        fetchWithTimeout(`${base}/factory-products`, {}, 12000),
      ]);
      if (sponsorR.status === "fulfilled" && sponsorR.value.ok) { const d = await sponsorR.value.json(); setSponsor(d); }
      if (facR.status  === "fulfilled" && facR.value.ok)  { const d = await facR.value.json();  if (Array.isArray(d)) setFactories(d); }
      if (prodR.status === "fulfilled" && prodR.value.ok) { const d = await prodR.value.json(); if (Array.isArray(d)) setProducts(d); }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredFactories = factories.filter(f => {
    const matchCat  = facCat === "all" || f.category === facCat;
    const matchSearch = !search || f.name.includes(search) || f.description?.includes(search);
    return matchCat && matchSearch;
  });
  const filteredProducts = products.filter(p => {
    const matchCat  = prodCat === "all" || p.category === prodCat;
    const matchSearch = !search || p.name.includes(search) || p.description?.includes(search);
    return matchCat && matchSearch;
  });

  const TABS = [
    { key: "factories", label: "المصانع",   icon: "business-outline"  as const },
    { key: "products",  label: "المنتجات",  icon: "cube-outline"      as const },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* HEADER */}
      <ModernHeader
        title="المصانع والإنتاج المحلي"
        subtitle="منتجات مباشرة من المصنع للمستهلك"
        icon="business-outline"
        rightSlot={
          <TouchableOpacity
            style={styles.pkgBtn}
            onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setPkgModal(true); }}>
            <Ionicons name="pricetags-outline" size={13} color="#fff" />
            <Text style={styles.pkgBtnText}>الباقات</Text>
          </TouchableOpacity>
        }
      >
        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.75)" />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن مصنع أو منتج…"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
          />
          {search !== "" && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setTab(t.key as any); }} activeOpacity={0.8}>
              {tab === t.key && <View style={[StyleSheet.absoluteFill, styles.tabBtnActiveBg]} />}
              <Ionicons name={t.icon} size={13} color={tab === t.key ? FAC : "#fff"} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ModernHeader>

      {/* CONTENT */}
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={FAC} size="large" /><Text style={styles.loadingText}>جارٍ التحميل…</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={FAC} colors={[FAC]} />}>

          {/* راعي التطبيق */}
          {sponsor && <SponsorBanner sponsor={sponsor} />}

          {/* ── تبويب المصانع ── */}
          {tab === "factories" && (
            <>
              {/* فلتر الفئات */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
                {FAC_CATS.map(c => (
                  <TouchableOpacity key={c.key}
                    style={[styles.catPill, facCat === c.key && { backgroundColor: FAC + "30", borderColor: FAC }]}
                    onPress={() => setFacCat(c.key)} activeOpacity={0.8}>
                    <Ionicons name={c.icon as any} size={11} color={facCat === c.key ? FAC : Colors.textMuted} />
                    <Text style={[styles.catLabel, facCat === c.key && { color: FAC }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filteredFactories.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="factory" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>لا توجد مصانع مسجّلة</Text>
                  <Text style={styles.emptyDesc}>سجّل مصنعك الآن وابدأ التسويق المباشر للمواطنين</Text>
                  <TouchableOpacity style={[styles.registerBtn, { backgroundColor: FAC }]} onPress={() => setPkgModal(true)}>
                    <Text style={styles.registerBtnText}>سجّل مصنعك</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {filteredFactories.map((f, i) => (
                    <FactoryCard key={f.id} factory={f} index={i}
                      onPress={() => { setSelectedFactory(f); setModalVisible(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
                  ))}
                  {/* دعوة للتسجيل */}
                  <TouchableOpacity style={[styles.joinCta, { borderColor: FAC + "40" }]} onPress={() => setPkgModal(true)} activeOpacity={0.85}>
                    <LinearGradient colors={[FAC + "14", Colors.surface2]} style={StyleSheet.absoluteFill} />
                    <MaterialCommunityIcons name="factory" size={28} color={FAC} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.joinCtaTitle, { color: FAC }]}>سجّل مصنعك في حصاحيصاوي</Text>
                      <Text style={styles.joinCtaDesc}>تسويق مباشر لمنتجاتك · باقات تنافسية · لوحة تحكم احترافية</Text>
                    </View>
                    <Ionicons name="arrow-back-outline" size={18} color={FAC} />
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── تبويب المنتجات ── */}
          {tab === "products" && (
            <>
              {/* فلتر فئات المنتجات */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}>
                {FAC_CATS.map(c => (
                  <TouchableOpacity key={c.key}
                    style={[styles.catPill, prodCat === c.key && { backgroundColor: FAC + "30", borderColor: FAC }]}
                    onPress={() => setProdCat(c.key)} activeOpacity={0.8}>
                    <Ionicons name={c.icon as any} size={11} color={prodCat === c.key ? FAC : Colors.textMuted} />
                    <Text style={[styles.catLabel, prodCat === c.key && { color: FAC }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filteredProducts.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>لا توجد منتجات</Text>
                  <Text style={styles.emptyDesc}>ستظهر منتجات المصانع هنا بمجرد تسجيلها</Text>
                </View>
              ) : (
                filteredProducts.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
              )}
            </>
          )}

          <View style={{ height: 30 }} />
                <OrgInviteCard />
</ScrollView>
      )}

      <FactoryModal
        factory={selectedFactory}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        products={products}
      />
      <PackagesModal visible={pkgModal} onClose={() => setPkgModal(false)} />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container:    { flex: 1 },
  pkgBtn:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.18)" },
  pkgBtnText:   { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: "#fff" },
  searchWrap:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: Colors.radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, color: "#fff", fontFamily: "Cairo_400Regular", fontSize: 13 },
  tabBar:       { flexDirection: "row", gap: 6, marginTop: 10 },
  tabBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: Colors.radius.sm, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.14)" },
  tabBtnActive: { overflow: "hidden" },
  tabBtnActiveBg:{ backgroundColor: "#fff" },
  tabLabel:     { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: "#fff" },
  tabLabelActive:{ color: FAC },
  catScroll:    { marginBottom: 12 },
  catPill:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Colors.radius.pill, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  catLabel:     { fontSize: 11, fontFamily: "Cairo_500Medium", color: Colors.textMuted },
  scrollContent:{ padding: 16, paddingTop: 12 },
  loadingWrap:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:  { color: Colors.textMuted, fontFamily: "Cairo_400Regular" },
  // sponsor banner
  sponsorBanner:{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: Colors.radius.md, borderWidth: 1, padding: 14, marginBottom: 16, overflow: "hidden", ...Colors.shadow.card },
  sponsorIcon:  { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  sponsorLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: "Cairo_400Regular" },
  sponsorName:  { fontSize: 15, fontFamily: "Cairo_700Bold" },
  sponsorTagline:{ fontSize: 11, color: Colors.textMuted },
  sponsorBtn:   { padding: 8, borderRadius: Colors.radius.sm, borderWidth: 1 },
  // factory card
  factoryCard:       { borderRadius: Colors.radius.lg, marginBottom: 12, overflow: "hidden", backgroundColor: Colors.surface2, ...Colors.shadow.card },
  factoryCardFeatured:{ borderWidth: 1, borderColor: GOLD + "60" },
  factoryCardGrad:   { ...StyleSheet.absoluteFillObject },
  factoryStripe:     { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  planRibbon:        { position: "absolute", top: 10, right: 0, paddingHorizontal: 10, paddingVertical: 3, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  planRibbonText:    { fontSize: 10, color: "#fff", fontFamily: "Cairo_700Bold" },
  sponsorBadge:      { position: "absolute", bottom: 10, right: 10, backgroundColor: GOLD + "CC", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sponsorBadgeText:  { fontSize: 9, color: "#000", fontFamily: "Cairo_700Bold" },
  factoryCardContent:{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  factoryLogo:       { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  factoryLogoText:   { fontSize: 20, color: "#fff", fontFamily: "Cairo_700Bold" },
  factoryName:       { fontSize: 15, fontFamily: "Cairo_700Bold", color: Colors.text },
  factorySub:        { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  promoTagline:      { fontSize: 11, fontFamily: "Cairo_600SemiBold", marginTop: 2 },
  promoBadgePill:    { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginTop: 4 },
  promoBadgeText:    { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  factoryMeta:       { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 },
  metaChip:          { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText:          { fontSize: 10, color: Colors.textMuted },
  // product card
  productCard:       { borderRadius: Colors.radius.md, marginBottom: 10, padding: 14, overflow: "hidden", borderWidth: 1, ...Colors.shadow.card },
  productHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  productCat:        { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  productCatText:    { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  productFactory:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  productFactoryText:{ fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  productName:       { fontSize: 15, fontFamily: "Cairo_700Bold", color: Colors.text, marginBottom: 4 },
  productDesc:       { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  productFooter:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  productPrice:      { fontSize: 16, fontFamily: "Cairo_700Bold" },
  productPriceNote:  { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  minOrder:          { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  stockBadge:        { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, marginTop: 6 },
  stockText:         { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  productActions:    { gap: 8 },
  contactBtn:        { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  contactBtnText:    { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  // join CTA
  joinCta:           { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: Colors.radius.lg, borderWidth: 1, padding: 16, marginTop: 8, overflow: "hidden", ...Colors.shadow.card },
  joinCtaTitle:      { fontSize: 14, fontFamily: "Cairo_700Bold" },
  joinCtaDesc:       { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  // empty state
  empty:             { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle:        { fontSize: 16, fontFamily: "Cairo_700Bold", color: Colors.textMuted },
  emptyDesc:         { fontSize: 12, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20 },
  registerBtn:       { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: Colors.radius.sm },
  registerBtnText:   { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14 },
  // modal
  modalOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet:    { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface2, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, maxHeight: "88%", overflow: "hidden" },
  dragBar:       { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  modalHeader:   { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingBottom: 12 },
  modalLogo:     { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  modalLogoText: { fontSize: 22, color: "#fff", fontFamily: "Cairo_700Bold" },
  modalTitle:    { fontSize: 17, fontFamily: "Cairo_700Bold", color: Colors.text },
  modalCloseBtn: { padding: 4 },
  planPill:      { borderRadius: Colors.radius.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  planPillText:  { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  promoTaglineBox:{ marginHorizontal: 16, marginBottom: 4, borderRadius: Colors.radius.sm, borderWidth: 1, padding: 12 },
  promoTaglineBig:{ fontSize: 15, fontFamily: "Cairo_600SemiBold", textAlign: "center" },
  modalSection:  { padding: 16, paddingTop: 8 },
  modalSectionTitle:{ fontSize: 14, fontFamily: "Cairo_700Bold", marginBottom: 10 },
  contactGrid:   { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  contactCard:   { flex: 1, minWidth: 120, alignItems: "center", gap: 6, borderWidth: 1, borderRadius: Colors.radius.md, padding: 12 },
  contactLabel:  { fontSize: 11, color: Colors.textMuted },
  contactVal:    { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  statsRow:      { flexDirection: "row", gap: 10 },
  statBlock:     { flex: 1, alignItems: "center", gap: 4, padding: 12, borderRadius: Colors.radius.md, borderWidth: 1 },
  statBlockVal:  { fontSize: 13, fontFamily: "Cairo_700Bold" },
  statBlockLabel:{ fontSize: 10, color: Colors.textMuted },
  factoryDesc:   { fontSize: 12, color: Colors.textMuted, marginTop: 10, lineHeight: 20 },
  websiteBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 16, borderRadius: Colors.radius.md, borderWidth: 1, paddingVertical: 12 },
  websiteBtnText:{ fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  // packages modal
  pkgCard:       { borderRadius: Colors.radius.lg, borderWidth: 1, padding: 16, marginBottom: 12, overflow: "hidden", ...Colors.shadow.card },
  pkgHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pkgBadge:      { borderRadius: Colors.radius.sm, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  pkgBadgeText:  { fontSize: 13, fontFamily: "Cairo_700Bold" },
  pkgPrice:      { fontSize: 14, fontFamily: "Cairo_700Bold" },
  pkgFeature:    { flexDirection: "row", alignItems: "center", gap: 6 },
  pkgFeatureText:{ fontSize: 12, color: Colors.textMuted },
  ctaBox:        { borderRadius: Colors.radius.lg, borderWidth: 1, padding: 18, alignItems: "center", marginTop: 8 },
  ctaTitle:      { fontSize: 17, fontFamily: "Cairo_700Bold", marginBottom: 8 },
  ctaDesc:       { fontSize: 12, color: Colors.textMuted, textAlign: "center", marginBottom: 16 },
  ctaBtn:        { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: Colors.radius.sm },
  ctaBtnText:    { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14 },
});
