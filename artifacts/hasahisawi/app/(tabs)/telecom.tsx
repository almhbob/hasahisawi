import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert, ActivityIndicator,
  RefreshControl, Modal, Pressable, TextInput, Dimensions,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, ZoomIn, useSharedValue,
  useAnimatedStyle, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const { width: SCREEN_W } = Dimensions.get("window");

const TC   = "#0EA5E9";   // telecom cyan-blue
const TC2  = "#2563EB";   // deep blue
const TC3  = "#7DD3FC";   // light blue
const GOLD = "#F59E0B";

// ── شركات الاتصالات السودانية الرئيسية (بيانات محلية احتياطية) ────────────────
const FALLBACK_COMPANIES = [
  {
    id: 1, name: "MTN السودان", short: "MTN",
    logo_initial: "M", brand_color: "#FFC107", brand_color2: "#FF8F00",
    description: "أكبر شبكة اتصالات في السودان — تغطية واسعة وخدمات متنوعة",
    founded: "1997", subscribers: "+٢٠ مليون", coverage: "٩٨٪",
    website: "https://www.mtn.sd", hotline: "1800",
    ussd: "*100#", recharge: "*555*[رمز الشحن]#",
  },
  {
    id: 2, name: "زين السودان", short: "Zain",
    logo_initial: "Z", brand_color: "#E53935", brand_color2: "#B71C1C",
    description: "شبكة اتصالات عالمية بخدمات مميزة وتقنيات حديثة",
    founded: "1997", subscribers: "+١٥ مليون", coverage: "٩٥٪",
    website: "https://www.sd.zain.com", hotline: "111",
    ussd: "*1#", recharge: "*123*[رمز الشحن]#",
  },
  {
    id: 3, name: "سوداني", short: "Sudani",
    logo_initial: "S", brand_color: "#22C55E", brand_color2: "#15803D",
    description: "الشركة السودانية للاتصالات — حكومية وطنية بخدمات شاملة",
    founded: "1993", subscribers: "+١٠ مليون", coverage: "٩٠٪",
    website: "https://www.sudani.sd", hotline: "1717",
    ussd: "*900#", recharge: "*300*[رمز الشحن]#",
  },
];

const OFFER_CATS = [
  { key: "all",      label: "الكل",          icon: "apps-outline"          },
  { key: "data",     label: "إنترنت",        icon: "wifi-outline"           },
  { key: "calls",    label: "مكالمات",       icon: "call-outline"           },
  { key: "combo",    label: "باقات مدمجة",   icon: "layers-outline"         },
  { key: "roaming",  label: "التجوال",       icon: "earth-outline"          },
  { key: "sms",      label: "رسائل",         icon: "chatbubble-outline"     },
];

type Company = typeof FALLBACK_COMPANIES[number] & { [k: string]: any };
type Offer = {
  id: number; company_id: number; company_name?: string; company_color?: string;
  title: string; description: string; category: string;
  price: string; currency: string; validity: string; details?: string;
  image_url?: string; is_active: boolean;
};
type TelecomEvent = {
  id: number; company_id?: number; company_name?: string; company_color?: string;
  title: string; description: string; event_date: string;
  location?: string; image_url?: string;
};

// ── مكوّن بطاقة الشركة ────────────────────────────────────────────────────────
function CompanyCard({
  company, onPress, index,
}: { company: Company; onPress: () => void; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 80).springify().damping(16)}>
      <TouchableOpacity style={styles.companyCard} onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={[company.brand_color + "22", company.brand_color + "08"]}
          style={styles.companyCardGrad}
        />
        {/* لون شريط جانبي */}
        <View style={[styles.companyStripe, { backgroundColor: company.brand_color }]} />
        <View style={styles.companyCardContent}>
          {/* الشعار */}
          <View style={[styles.companyLogo, { backgroundColor: company.brand_color }]}>
            <Text style={styles.companyLogoText}>{company.logo_initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companySub} numberOfLines={2}>{company.description}</Text>
            <View style={styles.companyStats}>
              <View style={styles.statChip}>
                <Ionicons name="people" size={11} color={company.brand_color} />
                <Text style={[styles.statText, { color: company.brand_color }]}>{company.subscribers}</Text>
              </View>
              <View style={styles.statChip}>
                <Ionicons name="signal" size={11} color={company.brand_color} />
                <Text style={[styles.statText, { color: company.brand_color }]}>{company.coverage} تغطية</Text>
              </View>
              {company.founded && (
                <View style={styles.statChip}>
                  <Ionicons name="calendar" size={11} color={company.brand_color} />
                  <Text style={[styles.statText, { color: company.brand_color }]}>منذ {company.founded}</Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={company.brand_color + "80"} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── مكوّن بطاقة العرض ─────────────────────────────────────────────────────────
function OfferCard({ offer, index }: { offer: Offer; index: number }) {
  const catColor: Record<string, string> = {
    data: "#06B6D4", calls: "#22C55E", combo: "#8B5CF6",
    roaming: "#F59E0B", sms: "#EC4899",
  };
  const catIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
    data: "wifi", calls: "call", combo: "layers",
    roaming: "earth", sms: "chatbubble",
  };
  const color = catColor[offer.category] || TC;
  const icon  = catIcon[offer.category] || "pricetag";

  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 60).springify().damping(16)}>
      <View style={styles.offerCard}>
        <LinearGradient
          colors={[color + "18", Colors.surface2]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={styles.offerHeader}>
          <View style={[styles.offerCatBadge, { backgroundColor: color + "25", borderColor: color + "50" }]}>
            <Ionicons name={icon} size={11} color={color} />
            <Text style={[styles.offerCatText, { color }]}>
              {OFFER_CATS.find(c => c.key === offer.category)?.label || offer.category}
            </Text>
          </View>
          {offer.company_name && (
            <View style={[styles.companyBadge, { backgroundColor: (offer.company_color || TC) + "25" }]}>
              <Text style={[styles.companyBadgeText, { color: offer.company_color || TC }]}>
                {offer.company_name}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
        <View style={styles.offerFooter}>
          <View>
            <Text style={[styles.offerPrice, { color }]}>
              {offer.price} {offer.currency || "SDG"}
            </Text>
            <Text style={styles.offerValidity}>
              <Ionicons name="time-outline" size={11} color={Colors.textMuted} /> {offer.validity}
            </Text>
          </View>
          {offer.details && (
            <TouchableOpacity
              style={[styles.offerDetailsBtn, { borderColor: color + "60", backgroundColor: color + "15" }]}
              onPress={() => Alert.alert(offer.title, offer.details)}
            >
              <Text style={[styles.offerDetailsBtnText, { color }]}>التفاصيل</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── مكوّن بطاقة الفعالية ──────────────────────────────────────────────────────
function EventCard({ event, index }: { event: TelecomEvent; index: number }) {
  const dateObj = new Date(event.event_date);
  const day   = dateObj.getDate();
  const month = dateObj.toLocaleString("ar-SD", { month: "short" });
  const color = event.company_color || TC;

  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 70).springify().damping(16)}>
      <View style={styles.eventCard}>
        <LinearGradient
          colors={[color + "18", Colors.surface2]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={[styles.eventDateBox, { backgroundColor: color }]}>
          <Text style={styles.eventDay}>{day}</Text>
          <Text style={styles.eventMonth}>{month}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {event.company_name && (
            <Text style={[styles.eventCompany, { color }]}>{event.company_name}</Text>
          )}
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

// ── مكوّن Modal تفاصيل الشركة ─────────────────────────────────────────────────
function CompanyModal({
  company, visible, onClose,
  offers,
}: { company: Company | null; visible: boolean; onClose: () => void; offers: Offer[] }) {
  if (!company) return null;
  const co = company.brand_color;
  const companyOffers = offers.filter(o => o.company_id === company.id);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.modalSheet}>
        <LinearGradient
          colors={[co + "30", Colors.surface3, Colors.bg]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        />
        {/* شريط السحب */}
        <View style={[styles.dragBar, { backgroundColor: co + "60" }]} />
        {/* Header الشركة */}
        <View style={styles.modalHeader}>
          <View style={[styles.modalLogo, { backgroundColor: co }]}>
            <Text style={styles.modalLogoText}>{company.logo_initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{company.name}</Text>
            <Text style={styles.modalSub}>{company.description}</Text>
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
                <TouchableOpacity
                  key={i}
                  style={[styles.contactCard, { borderColor: co + "40" }]}
                  onPress={() => {
                    if (item.icon === "call") Linking.openURL(`tel:${item.val}`);
                    else Alert.alert(item.label, item.val || "");
                  }}
                >
                  <Ionicons name={item.icon} size={20} color={co} />
                  <Text style={styles.contactLabel}>{item.label}</Text>
                  <Text style={[styles.contactVal, { color: co }]}>{item.val}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* إحصائيات */}
          <View style={styles.modalSection}>
            <Text style={[styles.modalSectionTitle, { color: co }]}>الشبكة</Text>
            <View style={styles.statsRow}>
              {[
                { icon: "people", label: "المشتركون", val: company.subscribers },
                { icon: "signal",  label: "التغطية",    val: company.coverage },
                { icon: "calendar", label: "التأسيس",   val: company.founded },
              ].map((s, i) => (
                <View key={i} style={[styles.statBlock, { borderColor: co + "30" }]}>
                  <Ionicons name={s.icon as any} size={18} color={co} />
                  <Text style={[styles.statBlockVal, { color: co }]}>{s.val}</Text>
                  <Text style={styles.statBlockLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* عروض الشركة */}
          {companyOffers.length > 0 && (
            <View style={styles.modalSection}>
              <Text style={[styles.modalSectionTitle, { color: co }]}>عروض وباقات</Text>
              {companyOffers.map((o, i) => <OfferCard key={o.id} offer={o} index={i} />)}
            </View>
          )}

          {/* زر الموقع */}
          {company.website && (
            <TouchableOpacity
              style={[styles.websiteBtn, { borderColor: co, backgroundColor: co + "18" }]}
              onPress={() => Linking.openURL(company.website)}
            >
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
  const { token } = useAuth();
  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;

  const [tab, setTab]                 = useState<"companies" | "offers" | "events">("companies");
  const [companies, setCompanies]     = useState<Company[]>(FALLBACK_COMPANIES);
  const [offers, setOffers]           = useState<Offer[]>([]);
  const [events, setEvents]           = useState<TelecomEvent[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [offerCat, setOfferCat]       = useState("all");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const base = getApiUrl();
      const [compRes, offRes, evRes] = await Promise.allSettled([
        fetchWithTimeout(`${base}/telecom/companies`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/offers`, {}, 12000),
        fetchWithTimeout(`${base}/telecom/events`, {}, 12000),
      ]);
      if (compRes.status === "fulfilled" && compRes.value.ok) {
        const data = await compRes.value.json();
        if (Array.isArray(data) && data.length > 0) setCompanies(data);
      }
      if (offRes.status === "fulfilled" && offRes.value.ok) {
        const data = await offRes.value.json();
        if (Array.isArray(data)) setOffers(data);
      }
      if (evRes.status === "fulfilled" && evRes.value.ok) {
        const data = await evRes.value.json();
        if (Array.isArray(data)) setEvents(data);
      }
    } catch { /* نستخدم البيانات الاحتياطية */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredOffers = offerCat === "all"
    ? offers
    : offers.filter(o => o.category === offerCat);

  const TABS = [
    { key: "companies", label: "الشركات",   icon: "business-outline"    as const },
    { key: "offers",    label: "العروض",    icon: "pricetags-outline"   as const },
    { key: "events",    label: "الفعاليات", icon: "calendar-outline"    as const },
  ];

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      {/* ══ HEADER ══ */}
      <LinearGradient
        colors={["#0A1628", TC2 + "55", TC + "30", Colors.bg]}
        locations={[0, 0.35, 0.65, 1]}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <Animated.View entering={FadeIn.delay(60).duration(600)}>
          <View style={styles.headerRow}>
            <View style={[styles.headerIcon, { backgroundColor: TC + "25", borderColor: TC + "50" }]}>
              <MaterialCommunityIcons name="antenna" size={22} color={TC} />
            </View>
            <View>
              <Text style={styles.headerTitle}>شركات الاتصالات</Text>
              <Text style={styles.headerSub}>عروض · خدمات · فعاليات السودان</Text>
            </View>
          </View>
        </Animated.View>

        {/* التبويبات */}
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setTab(t.key as any);
              }}
              activeOpacity={0.8}
            >
              {tab === t.key && (
                <LinearGradient
                  colors={[TC, TC2]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                />
              )}
              <Ionicons name={t.icon} size={14} color={tab === t.key ? "#fff" : Colors.textMuted} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══ CONTENT ══ */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={TC} size="large" />
          <Text style={styles.loadingText}>جارٍ تحميل البيانات…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={TC}
              colors={[TC]}
            />
          }
        >
          {/* ── تبويب الشركات ── */}
          {tab === "companies" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="antenna" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>شبكات الاتصالات في السودان</Text>
                </View>
                <Text style={styles.sectionSub}>
                  اضغط على أي شركة لعرض تفاصيلها وعروضها وطريقة التواصل
                </Text>
              </Animated.View>

              {companies.map((c, i) => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  index={i}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCompany(c);
                    setModalVisible(true);
                  }}
                />
              ))}

              {/* بطاقة خدمات مشتركة */}
              <Animated.View entering={FadeInDown.delay(350).springify().damping(14)}>
                <LinearGradient
                  colors={[TC + "18", TC2 + "10"]}
                  style={styles.infoCard}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <View style={styles.infoCardHeader}>
                    <Ionicons name="information-circle" size={18} color={TC} />
                    <Text style={[styles.infoCardTitle, { color: TC }]}>خدمات مشتركة</Text>
                  </View>
                  {[
                    { icon: "card-outline", text: "اشحن رصيدك من أقرب موزع معتمد" },
                    { icon: "phone-portrait-outline", text: "حوّل الرصيد بين المشتركين مجاناً" },
                    { icon: "shield-checkmark-outline", text: "أبلغ عن الاحتيال والاختراق" },
                    { icon: "star-outline", text: "اكسب نقاط ولاء مع كل شحنة" },
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

          {/* ── تبويب العروض ── */}
          {tab === "offers" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="pricetags" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>العروض والباقات</Text>
                </View>
              </Animated.View>

              {/* فلاتر الفئات */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
              >
                {OFFER_CATS.map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.catChip, offerCat === c.key && styles.catChipActive]}
                    onPress={() => setOfferCat(c.key)}
                  >
                    {offerCat === c.key && (
                      <LinearGradient
                        colors={[TC, TC2]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      />
                    )}
                    <Ionicons
                      name={c.icon as any}
                      size={13}
                      color={offerCat === c.key ? "#fff" : Colors.textMuted}
                    />
                    <Text style={[styles.catChipText, offerCat === c.key && { color: "#fff" }]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filteredOffers.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <MaterialCommunityIcons name="tag-off-outline" size={52} color={TC + "50"} />
                  <Text style={styles.emptyTitle}>لا توجد عروض بعد</Text>
                  <Text style={styles.emptySub}>ستظهر العروض هنا فور إضافتها من الإدارة</Text>
                </View>
              ) : (
                filteredOffers.map((o, i) => <OfferCard key={o.id} offer={o} index={i} />)
              )}
            </>
          )}

          {/* ── تبويب الفعاليات ── */}
          {tab === "events" && (
            <>
              <Animated.View entering={FadeInDown.delay(40).springify()}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="calendar" size={16} color={TC} />
                  <Text style={styles.sectionTitle}>الفعاليات الاجتماعية</Text>
                </View>
                <Text style={styles.sectionSub}>
                  فعاليات ومناسبات شركات الاتصالات في الحصاحيصا والمنطقة
                </Text>
              </Animated.View>

              {events.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="calendar-outline" size={52} color={TC + "50"} />
                  <Text style={styles.emptyTitle}>لا توجد فعاليات قادمة</Text>
                  <Text style={styles.emptySub}>ستظهر الفعاليات هنا عند إضافتها</Text>
                </View>
              ) : (
                events.map((e, i) => <EventCard key={e.id} event={e} index={i} />)
              )}
            </>
          )}

          <View style={{ height: Platform.OS === "web" ? 60 : 100 }} />
        </ScrollView>
      )}

      {/* ══ Modal تفاصيل الشركة ══ */}
      <CompanyModal
        company={selectedCompany}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        offers={offers}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },

  // Header
  header:       { paddingHorizontal: 18, paddingBottom: 0 },
  headerRow:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  headerIcon:   { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  headerTitle:  { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, writingDirection: "rtl" },
  headerSub:    { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, writingDirection: "rtl" },

  // Tabs
  tabBar:       { flexDirection: "row", gap: 8, paddingVertical: 14, paddingBottom: 18 },
  tabBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  tabBtnActive: { borderColor: TC + "60" },
  tabLabel:     { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },

  // Content
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  loadingWrap:   { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText:   { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 14 },

  // Section header
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionTitle:     { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  sectionSub:       { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, marginBottom: 14, lineHeight: 20 },

  // Company card
  companyCard:        { borderRadius: 16, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2 },
  companyCardGrad:    { ...StyleSheet.absoluteFillObject },
  companyStripe:      { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  companyCardContent: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingLeft: 20 },
  companyLogo:        { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center" },
  companyLogoText:    { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  companyName:        { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, marginBottom: 3 },
  companySub:         { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 8 },
  companyStats:       { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statChip:           { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.surface3 },
  statText:           { fontFamily: "Cairo_600SemiBold", fontSize: 10 },

  // Offer card
  offerCard:          { borderRadius: 14, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2, padding: 14 },
  offerHeader:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  offerCatBadge:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  offerCatText:       { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  companyBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  companyBadgeText:   { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  offerTitle:         { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 4 },
  offerDesc:          { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 10 },
  offerFooter:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offerPrice:         { fontFamily: "Cairo_700Bold", fontSize: 16 },
  offerValidity:      { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  offerDetailsBtn:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  offerDetailsBtnText:{ fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // Event card
  eventCard:         { borderRadius: 14, overflow: "hidden", marginBottom: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface2, padding: 14, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  eventDateBox:      { width: 50, height: 56, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  eventDay:          { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", lineHeight: 24 },
  eventMonth:        { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#ffffffCC", lineHeight: 14 },
  eventTitle:        { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 2 },
  eventCompany:      { fontFamily: "Cairo_600SemiBold", fontSize: 11, marginBottom: 4 },
  eventDesc:         { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: 6 },
  eventLocation:     { flexDirection: "row", alignItems: "center", gap: 4 },
  eventLocationText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // Info card
  infoCard:          { borderRadius: 14, borderWidth: 1, borderColor: TC + "30", padding: 16, marginTop: 4, marginBottom: 8 },
  infoCardHeader:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  infoCardTitle:     { fontFamily: "Cairo_700Bold", fontSize: 14 },
  infoRow:           { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  infoText:          { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 20 },

  // Category filter
  catScroll:         { marginBottom: 14 },
  catChip:           { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  catChipActive:     { borderColor: TC + "60" },
  catChipText:       { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  // Empty state
  emptyWrap:         { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle:        { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  emptySub:          { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet:        { maxHeight: "90%", backgroundColor: Colors.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", flex: 1 },
  dragBar:           { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  modalHeader:       { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingTop: 8 },
  modalLogo:         { width: 54, height: 54, borderRadius: 27, justifyContent: "center", alignItems: "center" },
  modalLogoText:     { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff" },
  modalTitle:        { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  modalSub:          { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginTop: 2 },
  modalCloseBtn:     { padding: 8 },
  modalSection:      { paddingHorizontal: 16, marginBottom: 20 },
  modalSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 12 },

  // Contact grid
  contactGrid:       { flexDirection: "row", gap: 10 },
  contactCard:       { flex: 1, alignItems: "center", gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.surface3 },
  contactLabel:      { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
  contactVal:        { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center" },

  // Stats row
  statsRow:          { flexDirection: "row", gap: 10 },
  statBlock:         { flex: 1, alignItems: "center", gap: 5, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.surface3 },
  statBlockVal:      { fontFamily: "Cairo_700Bold", fontSize: 14 },
  statBlockLabel:    { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },

  // Website button
  websiteBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  websiteBtnText:    { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
});
