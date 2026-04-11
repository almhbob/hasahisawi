import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
  Modal, Platform, Linking, FlatList,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

// ─────────────────────────────────────────────
const PRIMARY  = "#27AE68";
const GOLD     = "#F0A500";
const PURPLE   = "#8B5CF6";
const PINK     = "#EC4899";
const BLUE     = "#3B82F6";
const ORANGE   = "#F97316";
const BG       = "#050E09";
const CARD     = "#0C1A10";
const CARD2    = "#0F2016";
const BORDER   = "#1a3a22";

// ─────────────────────────────────────────────
//  أنواع الفعاليات
// ─────────────────────────────────────────────
const EVENT_TYPES = [
  { key: "all",          label: "الكل",        icon: "grid-outline",             color: PRIMARY  },
  { key: "festival",     label: "مهرجانات",    icon: "star-outline",             color: GOLD     },
  { key: "graduation",   label: "تخاريج",      icon: "school-outline",           color: PURPLE   },
  { key: "conference",   label: "مؤتمرات",     icon: "business-outline",         color: BLUE     },
  { key: "exhibition",   label: "معارض",       icon: "easel-outline",            color: ORANGE   },
  { key: "concert",      label: "حفلات",       icon: "musical-notes-outline",    color: PINK     },
  { key: "cultural",     label: "ثقافية",      icon: "color-palette-outline",    color: "#06B6D4" },
  { key: "sports",       label: "رياضية",      icon: "football-outline",         color: "#10B981" },
  { key: "religious",    label: "دينية",       icon: "moon-outline",             color: "#A78BFA" },
  { key: "other",        label: "أخرى",        icon: "ellipsis-horizontal",      color: "#6B7280" },
];

// ─────────────────────────────────────────────
//  خدمات التأجير
// ─────────────────────────────────────────────
const RENTAL_CATS = [
  { key: "gown",        label: "أردية التخرج",    icon: "school",        color: PURPLE,  emoji: "🎓" },
  { key: "tent",        label: "خيام وسرادقات",   icon: "home",          color: ORANGE,  emoji: "⛺" },
  { key: "furniture",   label: "كراسي وطاولات",   icon: "server",        color: BLUE,    emoji: "🪑" },
  { key: "sound",       label: "معدات صوت",       icon: "mic",           color: PINK,    emoji: "🎤" },
  { key: "photo",       label: "تصوير وفيديو",    icon: "camera",        color: GOLD,    emoji: "📸" },
  { key: "lighting",    label: "إضاءة وديكور",    icon: "flash",         color: "#FCD34D", emoji: "💡" },
  { key: "catering",    label: "ضيافة وتموين",    icon: "restaurant",    color: "#34D399", emoji: "🍽️" },
  { key: "transport",   label: "مواصلات VIP",     icon: "car",           color: "#F472B6", emoji: "🚗" },
];

type Event = {
  id: number;
  title: string;
  type: string;
  description: string;
  location: string;
  event_date: string;
  event_time?: string;
  organizer_name: string;
  contact_phone?: string;
  price?: number;
  capacity?: number;
  registered_count: number;
  is_free: boolean;
  status: string;
  created_at: string;
};

type RentalItem = {
  id: number;
  category: string;
  name: string;
  description: string;
  price_per_day: number;
  price_per_event?: number;
  quantity_available: number;
  contact_phone: string;
  provider_name: string;
  created_at: string;
};

// ─────────────────────────────────────────────
//  مساعدات
// ─────────────────────────────────────────────
function formatDate(d: string) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function getTypeInfo(key: string) {
  return EVENT_TYPES.find(t => t.key === key) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
}
function getRentalCat(key: string) {
  return RENTAL_CATS.find(c => c.key === key) ?? RENTAL_CATS[0];
}

// ═══════════════════════════════════════════════
//  الشاشة الرئيسية
// ═══════════════════════════════════════════════
export default function EventsScreen() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tab, setTab] = useState<"browse" | "rental" | "organize">("browse");

  // browse
  const [events,      setEvents]      = useState<Event[]>([]);
  const [loadingEvt,  setLoadingEvt]  = useState(false);
  const [refreshEvt,  setRefreshEvt]  = useState(false);
  const [filterType,  setFilterType]  = useState("all");
  const [searchEvt,   setSearchEvt]   = useState("");
  const [selectedEvt, setSelectedEvt] = useState<Event | null>(null);

  // rental
  const [rentals,     setRentals]     = useState<RentalItem[]>([]);
  const [loadingRent, setLoadingRent] = useState(false);
  const [filterCat,   setFilterCat]   = useState("all");
  const [searchRent,  setSearchRent]  = useState("");
  const [selectedRent,setSelectedRent]= useState<RentalItem | null>(null);

  // organize form
  const [form, setForm] = useState({
    title: "", type: "festival", description: "", location: "",
    event_date: "", event_time: "", organizer_name: user?.name ?? "",
    contact_phone: "", is_free: true, price: "", capacity: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const BASE = getApiUrl().replace(/\/$/, "");

  // ── جلب الفعاليات ──────────────────────────
  const loadEvents = useCallback(async (refresh = false) => {
    if (refresh) setRefreshEvt(true); else setLoadingEvt(true);
    try {
      const r = await fetch(`${BASE}/api/events?limit=50`);
      if (r.ok) setEvents(await r.json());
    } catch {} finally {
      setLoadingEvt(false); setRefreshEvt(false);
    }
  }, [BASE]);

  const loadRentals = useCallback(async () => {
    setLoadingRent(true);
    try {
      const r = await fetch(`${BASE}/api/event-rentals?limit=50`);
      if (r.ok) setRentals(await r.json());
    } catch {} finally { setLoadingRent(false); }
  }, [BASE]);

  useEffect(() => { loadEvents(); loadRentals(); }, []);
  useFocusEffect(useCallback(() => { loadEvents(); }, []));

  // ── تصفية ──────────────────────────────────
  const filteredEvents = events.filter(e => {
    const matchType = filterType === "all" || e.type === filterType;
    const matchSearch = !searchEvt || e.title.includes(searchEvt) || e.location.includes(searchEvt);
    return matchType && matchSearch && e.status === "approved";
  });

  const filteredRentals = rentals.filter(r => {
    const matchCat = filterCat === "all" || r.category === filterCat;
    const matchSearch = !searchRent || r.name.includes(searchRent) || r.provider_name.includes(searchRent);
    return matchCat && matchSearch;
  });

  // ── نشر فعالية ─────────────────────────────
  const submitEvent = async () => {
    if (!form.title.trim() || !form.location.trim() || !form.event_date.trim() || !form.organizer_name.trim()) {
      Alert.alert("تنبيه", "يرجى ملء الحقول الإلزامية: العنوان، الموقع، التاريخ، اسم المنظم");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...form,
          price: form.is_free ? null : parseFloat(form.price) || null,
          capacity: parseInt(form.capacity) || null,
        }),
      });
      if (r.ok) {
        Alert.alert("تم الإرسال ✅", "فعاليتك قيد المراجعة وستظهر بعد الموافقة");
        setForm({ title: "", type: "festival", description: "", location: "", event_date: "", event_time: "", organizer_name: user?.name ?? "", contact_phone: "", is_free: true, price: "", capacity: "" });
        setTab("browse");
        setTimeout(() => loadEvents(), 1000);
      } else {
        const d = await r.json();
        Alert.alert("خطأ", d.error ?? "فشل الإرسال");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالسيرفر"); }
    finally { setSubmitting(false); }
  };

  // ─────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* ── Header ── */}
      <LinearGradient colors={["#051209", "#071610"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>🎪 الفعاليات</Text>
            <Text style={styles.headerSub}>مهرجانات · تخاريج · مؤتمرات · تأجير</Text>
          </View>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{filteredEvents.length}</Text>
            <Text style={styles.headerBadgeLabel}>فعالية</Text>
          </View>
        </View>
        {/* Tabs */}
        <View style={styles.tabBar}>
          {([
            { key: "browse",   label: "تصفح",    icon: "calendar-outline"   },
            { key: "rental",   label: "تأجير",   icon: "cube-outline"       },
            { key: "organize", label: "نظّم",    icon: "add-circle-outline" },
          ] as const).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
            >
              <Ionicons name={t.icon as any} size={16} color={tab === t.key ? "#000" : "#7aad8c"} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══════════════ تصفح الفعاليات ══════════════ */}
      {tab === "browse" && (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshEvt} onRefresh={() => loadEvents(true)} tintColor={PRIMARY} />}
        >
          {/* بحث */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#5a8a6a" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث عن فعالية..."
              placeholderTextColor="#4a7a5a"
              value={searchEvt}
              onChangeText={setSearchEvt}
            />
          </View>

          {/* فلتر النوع */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {EVENT_TYPES.map((t, i) => (
              <Animated.View key={t.key} entering={FadeInDown.delay(i * 40)}>
                <TouchableOpacity
                  style={[styles.filterChip, filterType === t.key && { backgroundColor: t.color, borderColor: t.color }]}
                  onPress={() => { setFilterType(t.key); Haptics.selectionAsync(); }}
                >
                  <Ionicons name={t.icon as any} size={14} color={filterType === t.key ? "#000" : t.color} />
                  <Text style={[styles.filterChipText, filterType === t.key && { color: "#000" }]}>{t.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>

          {/* الفعاليات */}
          {loadingEvt ? (
            <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
          ) : filteredEvents.length === 0 ? (
            <EmptyState icon="calendar-outline" text="لا توجد فعاليات في هذه الفئة" sub="كن أول من ينظّم فعالية!" />
          ) : (
            <View style={styles.eventsGrid}>
              {filteredEvents.map((ev, i) => (
                <EventCard key={ev.id} event={ev} index={i} onPress={() => setSelectedEvt(ev)} />
              ))}
            </View>
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ══════════════ خدمات التأجير ══════════════ */}
      {tab === "rental" && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* بحث */}
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#5a8a6a" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث في خدمات التأجير..."
              placeholderTextColor="#4a7a5a"
              value={searchRent}
              onChangeText={setSearchRent}
            />
          </View>

          {/* فئات التأجير */}
          <Text style={styles.sectionTitle}>📦 فئات التأجير</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.rentalCatChip, filterCat === "all" && { borderColor: PRIMARY, backgroundColor: PRIMARY + "22" }]}
              onPress={() => setFilterCat("all")}
            >
              <Text style={[styles.rentalCatEmoji]}>🔍</Text>
              <Text style={[styles.rentalCatLabel, filterCat === "all" && { color: PRIMARY }]}>الكل</Text>
            </TouchableOpacity>
            {RENTAL_CATS.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[styles.rentalCatChip, filterCat === c.key && { borderColor: c.color, backgroundColor: c.color + "22" }]}
                onPress={() => { setFilterCat(c.key); Haptics.selectionAsync(); }}
              >
                <Text style={styles.rentalCatEmoji}>{c.emoji}</Text>
                <Text style={[styles.rentalCatLabel, filterCat === c.key && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* بطاقات التأجير */}
          {loadingRent ? (
            <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
          ) : filteredRentals.length === 0 ? (
            <EmptyState icon="cube-outline" text="لا توجد خدمات تأجير حالياً" sub="تواصل معنا لإضافة خدمتك" />
          ) : (
            filteredRentals.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60)}>
                <RentalCard item={item} onPress={() => setSelectedRent(item)} />
              </Animated.View>
            ))
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ══════════════ نشر فعالية ══════════════ */}
      {tab === "organize" && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)}>
            <LinearGradient colors={[PURPLE + "22", "transparent"]} style={styles.organizeHero}>
              <Text style={styles.organizeIcon}>🎪</Text>
              <Text style={styles.organizeTitle}>نظّم فعاليتك</Text>
              <Text style={styles.organizeSub}>أضف فعاليتك وشاركها مع مجتمع حصاحيصا</Text>
            </LinearGradient>

            {/* نوع الفعالية */}
            <Text style={styles.fieldLabel}>نوع الفعالية *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {EVENT_TYPES.filter(t => t.key !== "all").map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeChip, form.type === t.key && { backgroundColor: t.color, borderColor: t.color }]}
                  onPress={() => setForm(f => ({ ...f, type: t.key }))}
                >
                  <Ionicons name={t.icon as any} size={16} color={form.type === t.key ? "#000" : t.color} />
                  <Text style={[styles.typeChipText, form.type === t.key && { color: "#000" }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* الحقول */}
            <FormField label="عنوان الفعالية *" placeholder="مثال: حفل تخرج دفعة 2026" value={form.title} onChangeText={(v: string) => setForm(f => ({ ...f, title: v }))} />
            <FormField label="الموقع *" placeholder="مثال: قاعة المدينة الرياضية" value={form.location} onChangeText={(v: string) => setForm(f => ({ ...f, location: v }))} icon="location-outline" />
            <FormField label="تاريخ الفعالية *" placeholder="مثال: 2026-06-15" value={form.event_date} onChangeText={(v: string) => setForm(f => ({ ...f, event_date: v }))} icon="calendar-outline" />
            <FormField label="الوقت" placeholder="مثال: 17:00" value={form.event_time} onChangeText={(v: string) => setForm(f => ({ ...f, event_time: v }))} icon="time-outline" />
            <FormField label="اسم المنظِّم *" placeholder="اسمك أو اسم جهتك" value={form.organizer_name} onChangeText={(v: string) => setForm(f => ({ ...f, organizer_name: v }))} icon="person-outline" />
            <FormField label="رقم التواصل" placeholder="للاستفسار والتسجيل" value={form.contact_phone} onChangeText={(v: string) => setForm(f => ({ ...f, contact_phone: v }))} icon="call-outline" keyboard="phone-pad" />
            <FormField label="وصف الفعالية" placeholder="تفاصيل الفعالية والبرنامج..." value={form.description} onChangeText={(v: string) => setForm(f => ({ ...f, description: v }))} multiline />

            {/* مجاني / مدفوع */}
            <Text style={styles.fieldLabel}>نوع الدخول</Text>
            <View style={styles.toggleRow}>
              {[{ v: true, l: "مجاني 🎁" }, { v: false, l: "مدفوع 💰" }].map(o => (
                <TouchableOpacity
                  key={String(o.v)}
                  style={[styles.toggleBtn, form.is_free === o.v && styles.toggleBtnActive]}
                  onPress={() => setForm(f => ({ ...f, is_free: o.v }))}
                >
                  <Text style={[styles.toggleBtnText, form.is_free === o.v && { color: "#000" }]}>{o.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!form.is_free && (
              <FormField label="سعر التذكرة (جنيه)" placeholder="0" value={form.price} onChangeText={(v: string) => setForm(f => ({ ...f, price: v }))} keyboard="numeric" />
            )}
            <FormField label="الطاقة الاستيعابية" placeholder="عدد المقاعد المتاحة" value={form.capacity} onChangeText={(v: string) => setForm(f => ({ ...f, capacity: v }))} keyboard="numeric" />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submitEvent}
              disabled={submitting}
            >
              <LinearGradient colors={[PRIMARY, "#1a9955"]} style={styles.submitGrad}>
                {submitting
                  ? <ActivityIndicator color="#000" />
                  : <><Ionicons name="send-outline" size={18} color="#000" /><Text style={styles.submitText}>إرسال للمراجعة</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
            <View style={{ height: 80 }} />
          </Animated.View>
        </ScrollView>
      )}

      {/* ══ Modal: تفاصيل الفعالية ══ */}
      <Modal visible={!!selectedEvt} transparent animationType="slide" onRequestClose={() => setSelectedEvt(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedEvt && <EventDetailSheet event={selectedEvt} onClose={() => setSelectedEvt(null)} />}
          </View>
        </View>
      </Modal>

      {/* ══ Modal: تفاصيل التأجير ══ */}
      <Modal visible={!!selectedRent} transparent animationType="slide" onRequestClose={() => setSelectedRent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {selectedRent && <RentalDetailSheet item={selectedRent} onClose={() => setSelectedRent(null)} />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────
//  بطاقة فعالية
// ─────────────────────────────────────────────
function EventCard({ event, index, onPress }: { event: Event; index: number; onPress: () => void }) {
  const typeInfo = getTypeInfo(event.type);
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={styles.eventCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient colors={[CARD2, CARD]} style={styles.eventCardInner}>
          {/* نوع + مجاني/مدفوع */}
          <View style={styles.eventCardTop}>
            <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + "22", borderColor: typeInfo.color + "55" }]}>
              <Ionicons name={typeInfo.icon as any} size={12} color={typeInfo.color} />
              <Text style={[styles.typeBadgeText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
            </View>
            <View style={[styles.priceBadge, event.is_free ? styles.priceFree : styles.pricePaid]}>
              <Text style={styles.priceBadgeText}>{event.is_free ? "مجاني" : `${event.price} ج`}</Text>
            </View>
          </View>

          {/* العنوان */}
          <Text style={styles.eventTitle}>{event.title}</Text>

          {/* التفاصيل */}
          <View style={styles.eventMeta}>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={13} color={PRIMARY} />
              <Text style={styles.metaText}>{formatDate(event.event_date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={GOLD} />
              <Text style={styles.metaText}>{event.location}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={13} color="#7aad8c" />
              <Text style={styles.metaText}>{event.organizer_name}</Text>
            </View>
          </View>

          {/* التسجيل */}
          <View style={styles.eventFooter}>
            <View style={styles.registeredRow}>
              <Ionicons name="people-outline" size={14} color="#5a8a6a" />
              <Text style={styles.registeredText}>{event.registered_count} مسجّل</Text>
              {event.capacity ? <Text style={styles.capacityText}> / {event.capacity}</Text> : null}
            </View>
            <View style={styles.detailBtn}>
              <Text style={styles.detailBtnText}>التفاصيل</Text>
              <Ionicons name="chevron-forward" size={12} color={PRIMARY} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
//  بطاقة تأجير
// ─────────────────────────────────────────────
function RentalCard({ item, onPress }: { item: RentalItem; onPress: () => void }) {
  const cat = getRentalCat(item.category);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.rentalCard}>
      <LinearGradient colors={[CARD2, CARD]} style={styles.rentalCardInner}>
        <View style={styles.rentalCardLeft}>
          <View style={[styles.rentalEmoji, { backgroundColor: cat.color + "22" }]}>
            <Text style={{ fontSize: 28 }}>{cat.emoji}</Text>
          </View>
        </View>
        <View style={styles.rentalCardBody}>
          <View style={styles.rentalCardTop}>
            <Text style={styles.rentalName}>{item.name}</Text>
            <View style={[styles.catTag, { backgroundColor: cat.color + "22" }]}>
              <Text style={[styles.catTagText, { color: cat.color }]}>{cat.label}</Text>
            </View>
          </View>
          <Text style={styles.rentalProvider}>🏪 {item.provider_name}</Text>
          {item.description ? <Text style={styles.rentalDesc} numberOfLines={2}>{item.description}</Text> : null}
          <View style={styles.rentalPriceRow}>
            <View style={styles.rentalPrice}>
              <Text style={styles.rentalPriceNum}>{item.price_per_day}</Text>
              <Text style={styles.rentalPriceUnit}> ج/يوم</Text>
            </View>
            {item.price_per_event ? (
              <View style={styles.rentalPrice}>
                <Text style={styles.rentalPriceNum}>{item.price_per_event}</Text>
                <Text style={styles.rentalPriceUnit}> ج/فعالية</Text>
              </View>
            ) : null}
            <View style={styles.availBadge}>
              <Text style={styles.availText}>متاح: {item.quantity_available}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
//  تفاصيل الفعالية (Sheet)
// ─────────────────────────────────────────────
function EventDetailSheet({ event, onClose }: { event: Event; onClose: () => void }) {
  const typeInfo = getTypeInfo(event.type);
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.sheetHandle} />
      <View style={[styles.sheetTypeBadge, { backgroundColor: typeInfo.color + "22" }]}>
        <Ionicons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
        <Text style={[styles.sheetTypeText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
      </View>
      <Text style={styles.sheetTitle}>{event.title}</Text>

      <View style={styles.sheetMetaGrid}>
        <SheetMetaItem icon="calendar-outline" color={PRIMARY} label="التاريخ" value={formatDate(event.event_date)} />
        {event.event_time ? <SheetMetaItem icon="time-outline" color={GOLD} label="الوقت" value={event.event_time} /> : null}
        <SheetMetaItem icon="location-outline" color={ORANGE} label="الموقع" value={event.location} />
        <SheetMetaItem icon="person-outline" color={PURPLE} label="المنظِّم" value={event.organizer_name} />
        <SheetMetaItem icon="cash-outline" color={event.is_free ? "#10B981" : GOLD} label="الدخول" value={event.is_free ? "مجاني" : `${event.price} جنيه`} />
        <SheetMetaItem icon="people-outline" color={BLUE} label="المسجّلون" value={`${event.registered_count}${event.capacity ? ` / ${event.capacity}` : ""}`} />
      </View>

      {event.description ? (
        <View style={styles.sheetDescBox}>
          <Text style={styles.sheetDescLabel}>عن الفعالية</Text>
          <Text style={styles.sheetDesc}>{event.description}</Text>
        </View>
      ) : null}

      {event.contact_phone ? (
        <TouchableOpacity
          style={styles.callBtn}
          onPress={() => Linking.openURL(`tel:${event.contact_phone}`)}
        >
          <LinearGradient colors={[PRIMARY, "#1a9955"]} style={styles.callBtnInner}>
            <Ionicons name="call-outline" size={20} color="#000" />
            <Text style={styles.callBtnText}>التسجيل والاستفسار</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>إغلاق</Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
//  تفاصيل التأجير (Sheet)
// ─────────────────────────────────────────────
function RentalDetailSheet({ item, onClose }: { item: RentalItem; onClose: () => void }) {
  const cat = getRentalCat(item.category);
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.sheetHandle} />
      <Text style={{ fontSize: 40, textAlign: "center", marginBottom: 8 }}>{cat.emoji}</Text>
      <Text style={styles.sheetTitle}>{item.name}</Text>
      <Text style={styles.rentalProvider2}>🏪 {item.provider_name}</Text>

      <View style={styles.sheetMetaGrid}>
        <SheetMetaItem icon="pricetag-outline" color={cat.color} label="الفئة" value={cat.label} />
        <SheetMetaItem icon="cash-outline" color={GOLD} label="السعر اليومي" value={`${item.price_per_day} جنيه`} />
        {item.price_per_event ? <SheetMetaItem icon="star-outline" color={PURPLE} label="سعر الفعالية" value={`${item.price_per_event} جنيه`} /> : null}
        <SheetMetaItem icon="cube-outline" color={BLUE} label="المتاح" value={`${item.quantity_available} وحدة`} />
      </View>

      {item.description ? (
        <View style={styles.sheetDescBox}>
          <Text style={styles.sheetDescLabel}>التفاصيل</Text>
          <Text style={styles.sheetDesc}>{item.description}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.callBtn}
        onPress={() => Linking.openURL(`tel:${item.contact_phone}`)}
      >
        <LinearGradient colors={[cat.color, cat.color + "cc"]} style={styles.callBtnInner}>
          <Ionicons name="call-outline" size={20} color="#fff" />
          <Text style={[styles.callBtnText, { color: "#fff" }]}>تواصل للحجز</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>إغلاق</Text>
      </TouchableOpacity>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
//  مكوّنات مساعدة
// ─────────────────────────────────────────────
function SheetMetaItem({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <View style={styles.sheetMetaItem}>
      <Ionicons name={icon as any} size={16} color={color} />
      <View style={{ marginRight: 6, flex: 1 }}>
        <Text style={styles.sheetMetaLabel}>{label}</Text>
        <Text style={styles.sheetMetaValue}>{value}</Text>
      </View>
    </View>
  );
}

function FormField({ label, placeholder, value, onChangeText, icon, keyboard, multiline }: any) {
  return (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputBox, multiline && { height: 90, alignItems: "flex-start" }]}>
        {icon && <Ionicons name={icon} size={16} color="#5a8a6a" style={{ marginLeft: 8 }} />}
        <TextInput
          style={[styles.input, multiline && { textAlignVertical: "top", paddingTop: 10 }]}
          placeholder={placeholder}
          placeholderTextColor="#3a5a42"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboard ?? "default"}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
        />
      </View>
    </View>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <Animated.View entering={FadeIn} style={styles.empty}>
      <Ionicons name={icon as any} size={52} color="#2a4a32" />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
//  الأنماط
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: BG },
  scroll:    { flex: 1 },

  // Header
  header:    { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 8 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#e0f5e8", textAlign: "right" },
  headerSub:   { fontSize: 11, color: "#4a7a5a", textAlign: "right", marginTop: 2 },
  headerBadge: { alignItems: "center", backgroundColor: PRIMARY + "22", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: PRIMARY + "44" },
  headerBadgeText: { fontSize: 22, fontWeight: "800", color: PRIMARY },
  headerBadgeLabel: { fontSize: 10, color: PRIMARY + "aa" },

  // Tabs
  tabBar:        { flexDirection: "row-reverse", gap: 8 },
  tabBtn:        { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 20, backgroundColor: "#0e2016", borderWidth: 1, borderColor: BORDER },
  tabBtnActive:  { backgroundColor: PRIMARY, borderColor: PRIMARY },
  tabLabel:      { fontSize: 12, color: "#7aad8c", fontWeight: "600" },
  tabLabelActive:{ color: "#000", fontWeight: "700" },

  // Search
  searchBox:   { flexDirection: "row-reverse", alignItems: "center", backgroundColor: CARD2, borderRadius: 14, margin: 14, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: BORDER, gap: 8 },
  searchInput: { flex: 1, color: "#d0e8d8", fontSize: 14, textAlign: "right" },

  // Filter chips
  filterScroll:    { paddingHorizontal: 14, marginBottom: 12 },
  filterChip:      { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD2, marginLeft: 8 },
  filterChipText:  { fontSize: 12, color: "#7aad8c" },

  // Events grid
  eventsGrid: { paddingHorizontal: 14, gap: 12 },
  eventCard:  { borderRadius: 16, overflow: "hidden" },
  eventCardInner: { borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER },
  eventCardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  typeBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  typeBadgeText: { fontSize: 11, fontWeight: "600" },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priceFree: { backgroundColor: "#10B981" + "33", borderWidth: 1, borderColor: "#10B981" + "55" },
  pricePaid: { backgroundColor: GOLD + "33", borderWidth: 1, borderColor: GOLD + "55" },
  priceBadgeText: { fontSize: 11, fontWeight: "700", color: "#d0e8d8" },
  eventTitle: { fontSize: 16, fontWeight: "700", color: "#d0f0e0", textAlign: "right", marginBottom: 10 },
  eventMeta: { gap: 5, marginBottom: 10 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: "#8aaa92", flex: 1, textAlign: "right" },
  eventFooter: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  registeredRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  registeredText: { fontSize: 12, color: "#5a8a6a" },
  capacityText: { fontSize: 12, color: "#3a5a42" },
  detailBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  detailBtnText: { fontSize: 12, color: PRIMARY, fontWeight: "600" },

  // Rental
  rentalCatChip: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD2, marginLeft: 8, minWidth: 80 },
  rentalCatEmoji: { fontSize: 22, marginBottom: 4 },
  rentalCatLabel: { fontSize: 11, color: "#7aad8c", fontWeight: "600" },

  rentalCard:      { marginHorizontal: 14, marginBottom: 12, borderRadius: 16, overflow: "hidden" },
  rentalCardInner: { flexDirection: "row-reverse", padding: 14, borderRadius: 16, borderWidth: 1, borderColor: BORDER, gap: 12 },
  rentalCardLeft:  { justifyContent: "center" },
  rentalEmoji:     { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rentalCardBody:  { flex: 1 },
  rentalCardTop:   { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  rentalName:      { fontSize: 15, fontWeight: "700", color: "#d0f0e0", flex: 1, textAlign: "right" },
  catTag:          { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 6 },
  catTagText:      { fontSize: 10, fontWeight: "600" },
  rentalProvider:  { fontSize: 12, color: "#6a9a72", textAlign: "right", marginBottom: 4 },
  rentalProvider2: { fontSize: 14, color: "#6a9a72", textAlign: "center", marginBottom: 12 },
  rentalDesc:      { fontSize: 12, color: "#5a7a62", textAlign: "right", marginBottom: 8 },
  rentalPriceRow:  { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rentalPrice:     { flexDirection: "row-reverse", alignItems: "baseline", backgroundColor: GOLD + "22", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  rentalPriceNum:  { fontSize: 14, fontWeight: "800", color: GOLD },
  rentalPriceUnit: { fontSize: 10, color: GOLD + "aa" },
  availBadge:      { backgroundColor: PRIMARY + "22", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  availText:       { fontSize: 11, color: PRIMARY },

  // Organize
  organizeHero:  { margin: 16, borderRadius: 20, padding: 24, alignItems: "center", borderWidth: 1, borderColor: PURPLE + "44" },
  organizeIcon:  { fontSize: 48, marginBottom: 8 },
  organizeTitle: { fontSize: 22, fontWeight: "800", color: "#d0e8ff", marginBottom: 4 },
  organizeSub:   { fontSize: 13, color: "#8898aa", textAlign: "center" },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#aac8b2", textAlign: "right", paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  fieldLabel:   { fontSize: 13, fontWeight: "600", color: "#8aaa92", textAlign: "right", marginBottom: 6, marginTop: 4 },

  typeChip:      { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD2, marginLeft: 8 },
  typeChipText:  { fontSize: 13, color: "#7aad8c", fontWeight: "600" },

  formField:  { paddingHorizontal: 16, marginBottom: 4 },
  inputBox:   { flexDirection: "row-reverse", alignItems: "center", backgroundColor: CARD2, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12 },
  input:      { flex: 1, color: "#d0e8d8", fontSize: 14, textAlign: "right", paddingVertical: 12 },

  toggleRow:    { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  toggleBtn:    { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD2, alignItems: "center" },
  toggleBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  toggleBtnText:   { fontSize: 13, fontWeight: "600", color: "#7aad8c" },

  submitBtn:   { margin: 16, borderRadius: 16, overflow: "hidden" },
  submitGrad:  { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  submitText:  { fontSize: 16, fontWeight: "800", color: "#000" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "#000000bb", justifyContent: "flex-end" },
  modalSheet:   { backgroundColor: "#0a1a0e", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", paddingHorizontal: 20, paddingBottom: 0 },
  sheetHandle:  { width: 40, height: 4, backgroundColor: BORDER, borderRadius: 2, alignSelf: "center", marginVertical: 12 },
  sheetTypeBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, marginBottom: 10 },
  sheetTypeText:  { fontSize: 14, fontWeight: "700" },
  sheetTitle:  { fontSize: 20, fontWeight: "800", color: "#d0f0e0", textAlign: "center", marginBottom: 16 },
  sheetMetaGrid: { gap: 10, marginBottom: 16 },
  sheetMetaItem: { flexDirection: "row-reverse", alignItems: "flex-start", backgroundColor: CARD2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER },
  sheetMetaLabel: { fontSize: 11, color: "#5a7a62", textAlign: "right" },
  sheetMetaValue: { fontSize: 14, fontWeight: "600", color: "#b0d8b8", textAlign: "right" },
  sheetDescBox: { backgroundColor: CARD2, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  sheetDescLabel: { fontSize: 12, color: "#5a7a62", textAlign: "right", marginBottom: 6 },
  sheetDesc: { fontSize: 14, color: "#9abaa2", textAlign: "right", lineHeight: 22 },

  callBtn:      { marginBottom: 10, borderRadius: 16, overflow: "hidden" },
  callBtnInner: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  callBtnText:  { fontSize: 16, fontWeight: "800", color: "#000" },
  closeBtn:     { alignItems: "center", paddingVertical: 14 },
  closeBtnText: { fontSize: 14, color: "#4a7a5a" },

  // Empty
  empty:      { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText:  { fontSize: 16, color: "#3a5a42", fontWeight: "600" },
  emptySub:   { fontSize: 13, color: "#2a3a2e" },
});
