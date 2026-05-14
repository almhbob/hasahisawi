import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert, ActivityIndicator,
  RefreshControl, Modal, Pressable, Dimensions,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const { width: W } = Dimensions.get("window");

const TC   = "#0EA5E9";
const TC2  = "#2563EB";
const TC3  = "#7DD3FC";
const GOLD = "#F59E0B";

const PKG_COLORS: Record<string, string> = {
  premium: GOLD, standard: TC, basic: "#6B7280",
};
const PKG_LABELS: Record<string, string> = {
  premium: "★ بريميوم", standard: "⬡ ستاندرد", basic: "● أساسي",
};

const OFFER_CATS = [
  { key: "all",     label: "الكل",        icon: "apps-outline"       },
  { key: "data",    label: "إنترنت",      icon: "wifi-outline"       },
  { key: "calls",   label: "مكالمات",     icon: "call-outline"       },
  { key: "combo",   label: "باقات مدمجة", icon: "layers-outline"     },
  { key: "roaming", label: "التجوال",     icon: "earth-outline"      },
  { key: "sms",     label: "رسائل",       icon: "chatbubble-outline" },
];

const SVC_CATS: Record<string, { label: string; color: string; icon: string }> = {
  recharge:  { label: "شحن الرصيد",    color: "#22C55E", icon: "card-outline"           },
  transfer:  { label: "تحويل الرصيد",  color: TC,        icon: "swap-horizontal-outline" },
  internet:  { label: "إنترنت",        color: "#06B6D4", icon: "wifi-outline"           },
  bill:      { label: "الفاتورة",      color: GOLD,      icon: "receipt-outline"        },
  sim:       { label: "SIM",           color: "#8B5CF6", icon: "phone-portrait-outline" },
  roaming:   { label: "تجوال",         color: "#F97316", icon: "earth-outline"          },
  support:   { label: "الدعم",         color: "#EC4899", icon: "headset-outline"        },
  other:     { label: "أخرى",          color: "#6B7280", icon: "ellipsis-horizontal-outline" },
};

const FALLBACK_COMPANIES = [
  { id: 1, name: "MTN السودان", short: "MTN", logo_initial: "M", brand_color: "#FFC107", brand_color2: "#FF8F00", description: "أكبر شبكة اتصالات في السودان — تغطية واسعة وخدمات متنوعة", founded: "1997", subscribers: "+٢٠ مليون", coverage: "٩٨٪", website: "https://www.mtn.sd", hotline: "1800", ussd: "*100#", recharge: "*555*[رمز]#", package_type: "basic" },
  { id: 2, name: "زين السودان", short: "Zain", logo_initial: "Z", brand_color: "#E53935", brand_color2: "#B71C1C", description: "شبكة اتصالات عالمية بخدمات مميزة وتقنيات حديثة", founded: "1997", subscribers: "+١٥ مليون", coverage: "٩٥٪", website: "https://www.sd.zain.com", hotline: "111", ussd: "*1#", recharge: "*123*[رمز]#", package_type: "basic" },
  { id: 3, name: "سوداني", short: "Sudani", logo_initial: "S", brand_color: "#22C55E", brand_color2: "#15803D", description: "الشركة السودانية للاتصالات — حكومية وطنية بخدمات شاملة", founded: "1993", subscribers: "+١٠ مليون", coverage: "٩٠٪", website: "https://www.sudani.sd", hotline: "1717", ussd: "*900#", recharge: "*300*[رمز]#", package_type: "basic" },
];

type Company = typeof FALLBACK_COMPANIES[number] & { [k: string]: any };
type Offer    = { id: number; company_id: number; company_name?: string; company_color?: string; title: string; description: string; category: string; price: string; currency: string; validity: string; details?: string; is_active: boolean };
type TcEvent  = { id: number; company_id?: number; company_name?: string; company_color?: string; title: string; description: string; event_date: string; location?: string };
type Service  = { id: number; company_id: number; company_name?: string; company_color?: string; title: string; description?: string; icon: string; price?: string; category: string; ussd_code?: string; link?: string; is_active: boolean };
type Promo    = { id: number; name: string; short?: string; logo_initial?: string; brand_color: string; brand_color2?: string; promo_tagline?: string; promo_banner_url?: string; promo_badge?: string; package_type: string };

// ── ServiceCard ──────────────────────────────────────────────────────────────
function ServiceCard({ svc, index }: { svc: Service; index: number }) {
  const cat   = SVC_CATS[svc.category] || SVC_CATS.other;
  const color = svc.company_color || cat.color;
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 50).springify().damping(15)}>
      <Pressable
        style={[styles.svcCard, { borderColor: color + "40" }]}
        onPress={() => {
          if (svc.ussd_code) Alert.alert(svc.title, `الرمز: ${svc.ussd_code}${svc.description ? "\n\n" + svc.description : ""}`);
          else if (svc.link) Linking.openURL(svc.link);
          else if (svc.description) Alert.alert(svc.title, svc.description);
        }}
      >
        <LinearGradient colors={[color + "18", "#0A1628"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.svcIcon, { backgroundColor: color + "25", borderColor: color + "40" }]}>
          <Ionicons name={svc.icon as any || cat.icon as any} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.svcTitle}>{svc.title}</Text>
          {svc.company_name && (
            <Text style={[styles.svcCompany, { color }]}>{svc.company_name}</Text>
          )}
          {svc.description && (
            <Text style={styles.svcDesc} numberOfLines={2}>{svc.description}</Text>
          )}
          <View style={styles.svcFooter}>
            {svc.price && <Text style={[styles.svcPrice, { color }]}>{svc.price}</Text>}
            {svc.ussd_code && (
              <View style={[styles.ussdBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                <Text style={[styles.ussdText, { color }]}>{svc.ussd_code}</Text>
              </View>
            )}
          </View>
        </View>
        {(svc.ussd_code || svc.link) && (
          <Ionicons name={svc.ussd_code ? "keypad-outline" : "open-outline"} size={16} color={color + "80"} />
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── OfferCard ─────────────────────────────────────────────────────────────────
function OfferCard({ offer, index }: { offer: Offer; index: number }) {
  const catColor: Record<string, string> = { data: "#06B6D4", calls: "#22C55E", combo: "#8B5CF6", roaming: GOLD, sms: "#EC4899" };
  const catIcon: Record<string, any>     = { data: "wifi", calls: "call", combo: "layers", roaming: "earth", sms: "chatbubble" };
  const color = catColor[offer.category] || TC;
  const icon  = catIcon[offer.category]  || "pricetag";
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 60).springify().damping(16)}>
      <View style={styles.offerCard}>
        <LinearGradient colors={[color + "18", Colors.surface2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.offerHeader}>
          <View style={[styles.offerCatBadge, { backgroundColor: color + "25", borderColor: color + "50" }]}>
            <Ionicons name={icon} size={11} color={color} />
            <Text style={[styles.offerCatText, { color }]}>{OFFER_CATS.find(c => c.key === offer.category)?.label || offer.category}</Text>
          </View>
          {offer.company_name && (
            <View style={[styles.companyBadge, { backgroundColor: (offer.company_color || TC) + "25" }]}>
              <Text style={[styles.companyBadgeText, { color: offer.company_color || TC }]}>{offer.company_name}</Text>
            </View>
          )}
        </View>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
        <View style={styles.offerFooter}>
          <View>
            <Text style={[styles.offerPrice, { color }]}>{offer.price} {offer.currency || "SDG"}</Text>
            <Text style={styles.offerValidity}>{offer.validity}</Text>
          </View>
          {offer.details && (
            <TouchableOpacity style={[styles.offerDetailsBtn, { borderColor: color + "60", backgroundColor: color + "15" }]} onPress={() => Alert.alert(offer.title, offer.details)}>
              <Text style={[styles.offerDetailsBtnText, { color }]}>التفاصيل</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── EventCard ─────────────────────────────────────────────────────────────────
function EventCard({ event, index }: { event: TcEvent; index: number }) {
  const d = new Date(event.event_date);
  const color = event.company_color || TC;
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 70).springify().damping(16)}>
      <View style={styles.eventCard}>
        <LinearGradient colors={[color + "18", Colors.surface2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={[styles.eventDateBox, { backgroundColor: color }]}>
          <Text style={styles.eventDay}>{d.getDate()}</Text>
          <Text style={styles.eventMonth}>{d.toLocaleString("ar-SD", { month: "short" })}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {event.company_name && <Text style={[styles.eventCompany, { color }]}>{event.company_name}</Text>}
          <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
          {event.location && (
            <View style={styles.eventLocation}>
              <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.eventLocationText}>{event.location}</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── CompanyCard ───────────────────────────────────────────────────────────────
function CompanyCard({ company, onPress, index }: { company: Company; onPress: () => void; index: number }) {
  const isPremium  = company.package_type === "premium";
  const isStandard = company.package_type === "standard";
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 80).springify().damping(16)}>
      <TouchableOpacity style={[styles.companyCard, isPremium && styles.companyCardPremium]} onPress={onPress} activeOpacity={0.85}>
        <LinearGradient colors={[company.brand_color + "22", company.brand_color + "08"]} style={styles.companyCardGrad} />
        <View style={[styles.companyStripe, { backgroundColor: company.brand_color }]} />
        {isPremium && (
          <View style={styles.premiumRibbon}>
            <Text style={styles.premiumRibbonText}>★ بريميوم</Text>
          </View>
        )}
        {isStandard && !isPremium && (
          <View style={[styles.premiumRibbon, { backgroundColor: TC + "CC" }]}>
            <Text style={styles.premiumRibbonText}>⬡ ستاندرد</Text>
          </View>
        )}
        <View style={styles.companyCardContent}>
          <View style={[styles.companyLogo, { backgroundColor: company.brand_color }]}>
            <Text style={styles.companyLogoText}>{company.logo_initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.promo_tagline ? (
              <Text style={[styles.promoTagline, { color: company.brand_color }]}>{company.promo_tagline}</Text>
            ) : (
              <Text style={styles.companySub} numberOfLines={2}>{company.description}</Text>
            )}
            {company.promo_badge && (
              <View style={[styles.promoBadgePill, { backgroundColor: company.brand_color + "25", borderColor: company.brand_color + "60" }]}>
                <Text style={[styles.promoBadgeText, { color: company.brand_color }]}>{company.promo_badge}</Text>
              </View>
            )}
            <View style={styles.companyStats}>
              <View style={styles.statChip}><Ionicons name="people" size={11} color={company.brand_color} /><Text style={[styles.statText, { color: company.brand_color }]}>{company.subscribers}</Text></View>
              <View style={styles.statChip}><Ionicons name="signal" size={11} color={company.brand_color} /><Text style={[styles.statText, { color: company.brand_color }]}>{company.coverage} تغطية</Text></View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={company.brand_color + "80"} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── CompanyModal ──────────────────────────────────────────────────────────────
function CompanyModal({ company, visible, onClose, offers, services }: {
  company: Company | null; visible: boolean; onClose: () => void; offers: Offer[]; services: Service[];
}) {
  if (!company) return null;
  const co = company.brand_color;
  const compOffers   = offers.filter(o => o.company_id === company.id);
  const compServices = services.filter(s => s.company_id === company.id);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.modalSheet}>
        <LinearGradient colors={[co + "30", Colors.surface3, Colors.bg]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} />
        <View style={[styles.dragBar, { backgroundColor: co + "60" }]} />
        <View style={styles.modalHeader}>
          <View style={[styles.modalLogo, { backgroundColor: co }]}>
            <Text style={styles.modalLogoText}>{company.logo_initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{company.name}</Text>
            {company.promo_tagline ? (
              <Text style={[styles.promoTagline, { color: co }]}>{company.promo_tagline}</Text>
            ) : (
              <Text style={styles.modalSub}>{company.description}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* معلومات الاتصال */}
          <View style={styles.modalSection}>
            <Text style={[styles.modalSectionTitle, { color: co }]}>معلومات الاتصال</Text>
            <View style={styles.contactGrid}>
              {[
                { icon: "call" as const, label: "خط الخدمة", val: company.hotline },
                { icon: "keypad" as const, label: "رمز الاستعلام", val: company.ussd },
                { icon: "card" as const, label: "رمز الشحن", val: company.recharge },
              ].map((item, i) => (
                <TouchableOpacity key={i} style={[styles.contactCard, { borderColor: co + "40" }]}
                  onPress={() => { if (item.icon === "call") Linking.openURL(`tel:${item.val}`); else Alert.alert(item.label, item.val || ""); }}>
                  <Ionicons name={item.icon} size={20} color={co} />
                  <Text style={styles.contactLabel}>{item.label}</Text>
                  <Text style={[styles.contactVal, { color: co }]}>{item.val}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* الإحصائيات */}
          <View style={styles.modalSection}>
            <Text style={[styles.modalSectionTitle, { color: co }]}>الشبكة</Text>
            <View style={styles.statsRow}>
              {[
                { icon: "people", label: "المشتركون", val: company.subscribers },
                { icon: "signal",  label: "التغطية",   val: company.coverage   },
                { icon: "calendar", label: "التأسيس",  val: company.founded    },
              ].map((s, i) => (
                <View key={i} style={[styles.statBlock, { borderColor: co + "30" }]}>
                  <Ionicons name={s.icon as any} size={18} color={co} />
                  <Text style={[styles.statBlockVal, { color: co }]}>{s.val}</Text>
                  <Text style={styles.statBlockLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* الخدمات */}
          {compServices.length > 0 && (
            <View style={styles.modalSection}>
              <Text style={[styles.modalSectionTitle, { color: co }]}>🛠 الخدمات المتاحة</Text>
              {compServices.map((s, i) => <ServiceCard key={s.id} svc={{ ...s, company_color: co }} index={i} />)}
            </View>
          )}

          {/* العروض */}
          {compOffers.length > 0 && (
            <View style={styles.modalSection}>
              <Text style={[styles.modalSectionTitle, { color: co }]}>🏷 عروض وباقات</Text>
              {compOffers.map((o, i) => <OfferCard key={o.id} offer={o} index={i} />)}
            </View>
          )}

          {/* زر الموقع */}
          {company.website && (
            <TouchableOpacity style={[styles.websiteBtn, { borderColor: co, backgroundColor: co + "18" }]}
              onPress={() => Linking.openURL(company.website)}>
              <Ionicons name="globe-outline" size={18} color={co} />
              <Text style={[styles.websiteBtnText, { color: co }]}>زيارة الموقع الرسمي</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════════
export default function TelecomScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;

  const [tab, setTab]               = useState<"companies" | "offers" | "events" | "services">("companies");
  const [companies, setCompanies]   = useState<Company[]>(FALLBACK_COMPANIES);
  const [offers, setOffers]         = useState<Offer[]>([]);
  const [events, setEvents]         = useState<TcEvent[]>([]);
  const [services, setServices]     = useState<Service[]>([]);
  const [promos, setPromos]         = useState<Promo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offerCat, setOfferCat]     = useState("all");
  const [svcCat, setSvcCat]         = useState("all");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [modalVisible, setModalVisible]       = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const base = getApiUrl();
      const [compR, offR, evR, svcR, promoR] = await Promise.allSettled([
        fetchWithTimeout(`${base}/telecom/companies`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/offers`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/events`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/services`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/companies/promo`, {}, 10000),
      ]);
      if (compR.status === "fulfilled" && compR.value.ok) { const d = await compR.value.json(); if (d?.length) setCompanies(d); }
      if (offR.status  === "fulfilled" && offR.value.ok)  { const d = await offR.value.json();  if (Array.isArray(d)) setOffers(d); }
      if (evR.status   === "fulfilled" && evR.value.ok)   { const d = await evR.value.json();   if (Array.isArray(d)) setEvents(d); }
      if (svcR.status  === "fulfilled" && svcR.value.ok)  { const d = await svcR.value.json();  if (Array.isArray(d)) setServices(d); }
      if (promoR.status === "fulfilled" && promoR.value.ok) { const d = await promoR.value.json(); if (Array.isArray(d)) setPromos(d); }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredOffers   = offerCat === "all" ? offers : offers.filter(o => o.category === offerCat);
  const filteredServices = svcCat   === "all" ? services : services.filter(s => s.category === svcCat);
  const svcCategories    = ["all", ...Array.from(new Set(services.map(s => s.category)))];

  const TABS = [
    { key: "companies", label: "الشركات",  icon: "business-outline"   as const },
    { key: "services",  label: "الخدمات",  icon: "construct-outline"  as const },
    { key: "offers",    label: "العروض",   icon: "pricetags-outline"  as const },
    { key: "events",    label: "الفعاليات",icon: "calendar-outline"   as const },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* ══ HEADER ══ */}
      <LinearGradient colors={["#0A1628", TC2 + "55", TC + "30", Colors.bg]} locations={[0, 0.35, 0.65, 1]} style={[styles.header, { paddingTop: topPad }]}>
        <Animated.View entering={FadeIn.delay(60).duration(600)}>
          <View style={styles.headerRow}>
            <View style={[styles.headerIcon, { backgroundColor: TC + "25", borderColor: TC + "50" }]}>
              <MaterialCommunityIcons name="antenna" size={22} color={TC} />
            </View>
            <View>
              <Text style={styles.headerTitle}>شركات الاتصالات</Text>
              <Text style={styles.headerSub}>مساحات إعلانية · خدمات · عروض</Text>
            </View>
          </View>
        </Animated.View>
        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); setTab(t.key as any); }} activeOpacity={0.8}>
              {tab === t.key && <LinearGradient colors={[TC, TC2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />}
              <Ionicons name={t.icon} size={13} color={tab === t.key ? "#fff" : Colors.textMuted} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══ CONTENT ══ */}
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={TC} size="large" /><Text style={styles.loadingText}>جارٍ التحميل…</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={TC} colors={[TC]} />}>

          {/* ── الشركات ── */}
          {tab === "companies" && (
            <>
              {/* بانرات بروميوم */}
              {promos.filter(p => p.package_type === "premium" && (p.promo_tagline || p.promo_badge)).map((promo, i) => (
                <Animated.View key={promo.id} entering={FadeInDown.delay(i * 60).springify()}>
                  <LinearGradient colors={[promo.brand_color + "35", promo.brand_color + "10", "#050E08"]} style={styles.promoBanner}>
                    <View style={[styles.promoBannerLogo, { backgroundColor: promo.brand_color }]}>
                      <Text style={styles.promoBannerLogoText}>{promo.logo_initial}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <Text style={[styles.promoBannerName, { color: promo.brand_color }]}>{promo.name}</Text>
                        <View style={[styles.pkgBadge, { backgroundColor: GOLD + "30", borderColor: GOLD + "60" }]}>
                          <Text style={[styles.pkgBadgeText, { color: GOLD }]}>★ بريميوم</Text>
                        </View>
                      </View>
                      {promo.promo_tagline && <Text style={styles.promoBannerTagline}>{promo.promo_tagline}</Text>}
                      {promo.promo_badge && (
                        <View style={[styles.promoBadgePill, { backgroundColor: promo.brand_color + "30", borderColor: promo.brand_color + "60", marginTop: 4 }]}>
                          <Text style={[styles.promoBadgeText, { color: promo.brand_color }]}>{promo.promo_badge}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </Animated.View>
              ))}

              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="antenna" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>شبكات الاتصالات في السودان</Text>
                </View>
                <Text style={styles.sectionSub}>اضغط على أي شركة لعرض تفاصيلها وخدماتها وعروضها</Text>
              </Animated.View>

              {companies.map((c, i) => (
                <CompanyCard key={c.id} company={c} index={i} onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCompany(c); setModalVisible(true);
                }} />
              ))}

              {/* ستاندرد taglines */}
              {promos.filter(p => p.package_type === "standard" && p.promo_tagline).map((promo, i) => (
                <Animated.View key={promo.id} entering={FadeInDown.delay(350 + i * 60).springify()}>
                  <LinearGradient colors={[TC + "12", "#050E08"]} style={[styles.promoBanner, { paddingVertical: 10 }]}>
                    <View style={[styles.promoBannerLogo, { backgroundColor: promo.brand_color, width: 34, height: 34, borderRadius: 17 }]}>
                      <Text style={[styles.promoBannerLogoText, { fontSize: 14 }]}>{promo.logo_initial}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.promoBannerTagline, { fontSize: 12 }]}>{promo.promo_tagline}</Text>
                      <View style={[styles.pkgBadge, { backgroundColor: TC + "20", borderColor: TC + "40", marginTop: 3 }]}>
                        <Text style={[styles.pkgBadgeText, { color: TC }]}>⬡ ستاندرد</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Animated.View>
              ))}

              {/* معلومات عامة */}
              <Animated.View entering={FadeInDown.delay(400).springify().damping(14)}>
                <LinearGradient colors={[TC + "18", TC2 + "10"]} style={styles.infoCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <View style={styles.infoCardHeader}>
                    <Ionicons name="information-circle" size={18} color={TC} />
                    <Text style={[styles.infoCardTitle, { color: TC }]}>خدمات مشتركة</Text>
                  </View>
                  {[
                    { icon: "card-outline",            text: "اشحن رصيدك من أقرب موزع معتمد" },
                    { icon: "phone-portrait-outline",  text: "حوّل الرصيد بين المشتركين مجاناً" },
                    { icon: "shield-checkmark-outline",text: "أبلغ عن الاحتيال والاختراق" },
                    { icon: "star-outline",            text: "اكسب نقاط ولاء مع كل شحنة" },
                  ].map((item, i) => (
                    <View key={i} style={styles.infoRow}>
                      <Ionicons name={item.icon as any} size={14} color={TC3} />
                      <Text style={styles.infoText}>{item.text}</Text>
                    </View>
                  ))}
                </LinearGradient>
              </Animated.View>
            </>
          )}

          {/* ── الخدمات ── */}
          {tab === "services" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="construct" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>الخدمات المقدّمة</Text>
                </View>
                <Text style={styles.sectionSub}>خدمات الشركات — اضغط لعرض الرمز أو الرابط المباشر</Text>
              </Animated.View>
              {/* فلاتر فئات الخدمات */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                {svcCategories.map(k => {
                  const cat = k === "all" ? { label: "الكل", color: TC } : { label: SVC_CATS[k]?.label || k, color: SVC_CATS[k]?.color || "#6B7280" };
                  return (
                    <TouchableOpacity key={k} style={[styles.catChip, svcCat === k && styles.catChipActive]} onPress={() => setSvcCat(k)}>
                      {svcCat === k && <LinearGradient colors={[TC, TC2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />}
                      <Text style={[styles.catChipText, svcCat === k && { color: "#fff" }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {filteredServices.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="construct-outline" size={52} color={TC + "50"} />
                  <Text style={styles.emptyTitle}>لا توجد خدمات بعد</Text>
                  <Text style={styles.emptySub}>ستظهر خدمات الشركات هنا عند إضافتها</Text>
                </View>
              ) : (
                filteredServices.map((s, i) => <ServiceCard key={s.id} svc={s} index={i} />)
              )}
            </>
          )}

          {/* ── العروض ── */}
          {tab === "offers" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="pricetags" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>العروض والباقات</Text>
                </View>
              </Animated.View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                {OFFER_CATS.map(c => (
                  <TouchableOpacity key={c.key} style={[styles.catChip, offerCat === c.key && styles.catChipActive]} onPress={() => setOfferCat(c.key)}>
                    {offerCat === c.key && <LinearGradient colors={[TC, TC2]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />}
                    <Ionicons name={c.icon as any} size={13} color={offerCat === c.key ? "#fff" : Colors.textMuted} />
                    <Text style={[styles.catChipText, offerCat === c.key && { color: "#fff" }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {filteredOffers.length === 0 ? (
                <View style={styles.emptyWrap}><MaterialCommunityIcons name="tag-off-outline" size={52} color={TC + "50"} /><Text style={styles.emptyTitle}>لا توجد عروض بعد</Text><Text style={styles.emptySub}>ستظهر العروض هنا فور إضافتها</Text></View>
              ) : filteredOffers.map((o, i) => <OfferCard key={o.id} offer={o} index={i} />)}
            </>
          )}

          {/* ── الفعاليات ── */}
          {tab === "events" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="calendar" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>الفعاليات الاجتماعية</Text>
                </View>
                <Text style={styles.sectionSub}>فعاليات ومناسبات شركات الاتصالات في الحصاحيصا</Text>
              </Animated.View>
              {events.length === 0 ? (
                <View style={styles.emptyWrap}><Ionicons name="calendar-outline" size={52} color={TC + "50"} /><Text style={styles.emptyTitle}>لا توجد فعاليات قادمة</Text><Text style={styles.emptySub}>ستظهر الفعاليات هنا عند إضافتها</Text></View>
              ) : events.map((e, i) => <EventCard key={e.id} event={e} index={i} />)}
            </>
          )}

          <View style={{ height: Platform.OS === "web" ? 60 : 100 }} />
        </ScrollView>
      )}

      <CompanyModal company={selectedCompany} visible={modalVisible} onClose={() => setModalVisible(false)} offers={offers} services={services} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 18, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  tabBar: { flexDirection: "row", gap: 6, paddingVertical: 14, paddingBottom: 18 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 11, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  tabBtnActive: { borderColor: TC + "60" },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 14 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  sectionSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, marginBottom: 14, lineHeight: 20 },

  // Company card
  companyCard: { borderRadius: 16, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  companyCardPremium: { borderColor: GOLD + "50" },
  companyCardGrad: { ...StyleSheet.absoluteFillObject },
  companyStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  companyCardContent: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingLeft: 20 },
  companyLogo: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center" },
  companyLogoText: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  companyName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, marginBottom: 2 },
  companySub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 6 },
  companyStats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.surface3 },
  statText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },

  // Premium ribbon
  premiumRibbon: { position: "absolute", top: 0, right: 0, backgroundColor: GOLD + "CC", paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 10 },
  premiumRibbonText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },

  // Promo
  promoBanner: { borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: TC + "20" },
  promoBannerLogo: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  promoBannerLogoText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  promoBannerName: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  promoBannerTagline: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  promoTagline: { fontFamily: "Cairo_600SemiBold", fontSize: 12, marginBottom: 4 },
  promoBadgePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1, marginTop: 4, alignSelf: "flex-start" },
  promoBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  pkgBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start" },
  pkgBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },

  // Service card
  svcCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, backgroundColor: Colors.surface2, overflow: "hidden" },
  svcIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, flexShrink: 0 },
  svcTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, marginBottom: 2 },
  svcCompany: { fontFamily: "Cairo_600SemiBold", fontSize: 11, marginBottom: 3 },
  svcDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 6 },
  svcFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  svcPrice: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  ussdBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  ussdText: { fontFamily: "Cairo_700Bold", fontSize: 12 },

  // Offer card
  offerCard: { borderRadius: 14, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2, padding: 14 },
  offerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  offerCatBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  offerCatText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  companyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  companyBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  offerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 4 },
  offerDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
  offerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offerPrice: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  offerValidity: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  offerDetailsBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  offerDetailsBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // Event card
  eventCard: { borderRadius: 14, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2, padding: 14, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  eventDateBox: { width: 50, height: 56, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  eventDay: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", lineHeight: 24 },
  eventMonth: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#ffffffCC", lineHeight: 14 },
  eventTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 2 },
  eventCompany: { fontFamily: "Cairo_600SemiBold", fontSize: 11, marginBottom: 4 },
  eventDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 6 },
  eventLocation: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventLocationText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // Info card
  infoCard: { borderRadius: 14, borderWidth: 1, borderColor: TC + "30", padding: 16, marginTop: 4, marginBottom: 8 },
  infoCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  infoCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 20 },

  // Category filter
  catScroll: { marginBottom: 14 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  catChipActive: { borderColor: TC + "60" },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  // Empty
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { maxHeight: "90%", backgroundColor: Colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", flex: 1 },
  dragBar: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingTop: 8 },
  modalLogo: { width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center" },
  modalLogoText: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff" },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  modalSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 2 },
  modalCloseBtn: { padding: 8 },
  modalSection: { paddingHorizontal: 16, marginBottom: 20 },
  modalSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 12 },
  contactGrid: { flexDirection: "row", gap: 10 },
  contactCard: { flex: 1, alignItems: "center", gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.surface3 },
  contactLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  contactVal: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10 },
  statBlock: { flex: 1, alignItems: "center", gap: 5, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.surface3 },
  statBlockVal: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  statBlockLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  websiteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  websiteBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
});
