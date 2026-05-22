import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn, FadeInRight } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl } from "@/lib/query-client";

// ─── أنواع ──────────────────────────────────────────────────────────────────
type AgencyType = "local" | "international" | "hajj_umrah" | "tourism" | "corporate";

type Agency = {
  id: number;
  name: string;
  name_en?: string;
  agency_type: AgencyType;
  specialties: string[];
  destinations: string[];
  description?: string;
  logo_url?: string;
  website?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  city?: string;
  country?: string;
  license_number?: string;
  founded_year?: number;
  is_featured: boolean;
};

// ─── إعدادات الأنواع ─────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<AgencyType, { label: string; labelFull: string; icon: string; color: string; emoji: string; desc: string }> = {
  local:         { label: "محلية",      labelFull: "وكالات سفر محلية",    icon: "map-marker-radius",    color: "#10B981", emoji: "🇸🇩", desc: "رحلات داخل السودان وقراه" },
  international: { label: "دولية",      labelFull: "وكالات دولية",         icon: "airplane",             color: "#3B82F6", emoji: "✈️",  desc: "وكالات سفر عالمية وتذاكر دولية" },
  hajj_umrah:    { label: "حج وعمرة",   labelFull: "حج وعمرة",             icon: "star-crescent",        color: "#F59E0B", emoji: "🕋",  desc: "مكاتب الحج والعمرة المعتمدة" },
  tourism:       { label: "سياحة",      labelFull: "شركات سياحة وتراث",   icon: "camera-burst",         color: "#8B5CF6", emoji: "🌍",  desc: "برامج سياحية ورحلات استجمام" },
  corporate:     { label: "شركات",      labelFull: "سفر الأعمال",          icon: "briefcase-variant",    color: "#EC4899", emoji: "💼",  desc: "رحلات الأعمال وحجوزات المؤسسات" },
};

const TYPE_KEYS = Object.keys(TYPE_CONFIG) as AgencyType[];

// ─── لماذا تنضم؟ ─────────────────────────────────────────────────────────────
const BENEFITS = [
  { icon: "account-group", color: "#10B981", title: "وصول لآلاف العملاء", desc: "اعرض خدماتك لمجتمع الحصاحيصا وضواحيها" },
  { icon: "star-circle",   color: "#F59E0B", title: "ظهور مميز",         desc: "بطاقة وكالتك في قائمة الشركاء المعتمدين" },
  { icon: "chart-line",    color: "#3B82F6", title: "تنمية الأعمال",      desc: "حجوزات مباشرة وزيادة في طلبات العملاء" },
  { icon: "shield-check",  color: "#8B5CF6", title: "ختم الاعتماد",      desc: "شارة «شريك معتمد» تُعزز ثقة العملاء" },
];

// ─── مقاصد شهيرة ─────────────────────────────────────────────────────────────
const POPULAR_DEST = [
  { name: "القاهرة", flag: "🇪🇬", color: "#EF4444" },
  { name: "مكة المكرمة", flag: "🇸🇦", color: "#F59E0B" },
  { name: "دبي", flag: "🇦🇪", color: "#3B82F6" },
  { name: "إسطنبول", flag: "🇹🇷", color: "#8B5CF6" },
  { name: "الخرطوم", flag: "🇸🇩", color: "#10B981" },
  { name: "لندن", flag: "🇬🇧", color: "#EC4899" },
  { name: "أبو ظبي", flag: "🇦🇪", color: "#06B6D4" },
  { name: "أديس أبابا", flag: "🇪🇹", color: "#F97316" },
];

// ─── الشاشة الرئيسية ────────────────────────────────────────────────────────
export default function TravelAgenciesScreen() {
  const insets = useSafeAreaInsets();
  const [agencies, setAgencies]   = useState<Agency[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<AgencyType | "all">("all");
  const [showForm, setShowForm]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${getApiUrl()}/api/travel-agencies`);
      const j = await r.json();
      setAgencies(Array.isArray(j.agencies) ? j.agencies : []);
    } catch { setAgencies([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const featured  = useMemo(() => agencies.filter(a => a.is_featured), [agencies]);
  const filtered  = useMemo(
    () => filter === "all" ? agencies : agencies.filter(a => a.agency_type === filter),
    [agencies, filter]
  );

  const openWhatsApp = (wa: string) => {
    const num = wa.replace(/\D/g, "");
    Linking.openURL(`https://wa.me/${num}`).catch(() => {});
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={["#0A1A2E", "#0D2444", "#1A3A6E"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={s.headerTitle}>وكالات السفر والسياحة</Text>
            <Text style={s.headerSub}>دليل الوكالات المعتمدة — محلية وعالمية</Text>
          </View>
          <View style={s.headerIconWrap}>
            <MaterialCommunityIcons name="airplane" size={28} color="#60A5FA" />
          </View>
        </View>

        {/* إحصائيات */}
        <View style={s.statsRow}>
          {[
            { val: agencies.length,                          label: "وكالة",       icon: "business-outline"       },
            { val: agencies.filter(a => a.agency_type === "international").length, label: "دولية", icon: "globe-outline" },
            { val: agencies.filter(a => a.is_featured).length,                    label: "مميزة", icon: "star-outline"  },
          ].map((st, i) => (
            <View key={i} style={s.statBox}>
              <Ionicons name={st.icon as any} size={15} color="#93C5FD" />
              <Text style={s.statNum}>{st.val}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {/* ── مقاصد شهيرة ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🌍 مقاصد شهيرة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 6 }}>
            {POPULAR_DEST.map((d, i) => (
              <Animated.View key={d.name} entering={FadeInRight.delay(i * 50)}>
                <View style={[s.destChip, { borderColor: d.color + "50", backgroundColor: d.color + "12" }]}>
                  <Text style={s.destFlag}>{d.flag}</Text>
                  <Text style={[s.destName, { color: d.color }]}>{d.name}</Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        {/* ── CTA الانضمام ── */}
        <Animated.View entering={FadeInDown.duration(400)} style={{ paddingHorizontal: 16 }}>
          <AnimatedPress onPress={() => { Haptics.selectionAsync(); setShowForm(true); }}>
            <LinearGradient
              colors={["#1D4ED8", "#2563EB", "#3B82F6"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.ctaCard}
            >
              <View style={s.ctaIconWrap}>
                <MaterialCommunityIcons name="airplane-takeoff" size={30} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.ctaTitle}>انضم كوكالة شريكة</Text>
                <Text style={s.ctaDesc}>سجّل وكالتك وابدأ في استقبال العملاء من مجتمع الحصاحيصا</Text>
              </View>
              <Ionicons name="arrow-back-circle" size={28} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </AnimatedPress>
        </Animated.View>

        {/* ── مزايا الانضمام ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>✨ مزايا الشراكة</Text>
          <View style={s.benefitsGrid}>
            {BENEFITS.map((b, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 80)} style={[s.benefitCard, { borderColor: b.color + "30" }]}>
                <LinearGradient colors={[b.color + "15", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={[s.benefitIcon, { backgroundColor: b.color + "20" }]}>
                  <MaterialCommunityIcons name={b.icon as any} size={22} color={b.color} />
                </View>
                <Text style={s.benefitTitle}>{b.title}</Text>
                <Text style={s.benefitDesc}>{b.desc}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* ── وكالات مميزة ── */}
        {featured.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionRow}>
              <View style={s.featuredDot} />
              <Text style={s.sectionTitle}>⭐ وكالات مميزة</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 6 }}>
              {featured.map((a, i) => (
                <Animated.View key={a.id} entering={FadeInRight.delay(i * 80)}>
                  <FeaturedCard agency={a} onWA={openWhatsApp} />
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── فلاتر النوع ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📋 جميع الوكالات</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}>
            <TouchableOpacity
              style={[s.filterChip, filter === "all" && { backgroundColor: "#3B82F6", borderColor: "#3B82F6" }]}
              onPress={() => setFilter("all")}
            >
              <Text style={[s.filterText, filter === "all" && { color: "#fff" }]}>الكل</Text>
            </TouchableOpacity>
            {TYPE_KEYS.map(k => {
              const cfg = TYPE_CONFIG[k];
              const active = filter === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[s.filterChip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setFilter(k)}
                >
                  <Text style={s.filterEmoji}>{cfg.emoji}</Text>
                  <Text style={[s.filterText, active && { color: "#fff" }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── قائمة الوكالات ── */}
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {loading && (
            <View style={s.emptyBox}>
              <ActivityIndicator color="#3B82F6" />
              <Text style={s.emptyText}>جاري التحميل…</Text>
            </View>
          )}

          {!loading && filtered.length === 0 && (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="airplane-off" size={56} color={Colors.textMuted} />
              <Text style={s.emptyText}>لا توجد وكالات في هذا القسم بعد</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => { Haptics.selectionAsync(); setShowForm(true); }}>
                <Text style={s.emptyBtnText}>سجّل وكالتك الآن</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && filtered.map((a, i) => (
            <Animated.View key={a.id} entering={FadeInDown.delay(i * 60).springify()}>
              <AgencyCard agency={a} onWA={openWhatsApp} />
            </Animated.View>
          ))}
        </View>

        {/* ── قسم الوكالات الدولية ── */}
        <View style={[s.section, { marginTop: 24 }]}>
          <LinearGradient colors={["#0F172A", "#1E3A5F"]} style={s.intlBanner}>
            <View style={s.intlRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.intlTitle}>✈️ الوكالات الدولية</Text>
                <Text style={s.intlDesc}>
                  نرحّب بوكالات السفر العالمية الراغبة في الوصول لمجتمع الحصاحيصا والسودان.
                  سواء كنتم في الرياض أو دبي أو القاهرة أو لندن — انضموا لشبكة شركائنا.
                </Text>
                <View style={s.intlChips}>
                  {["🇸🇦 السعودية", "🇦🇪 الإمارات", "🇪🇬 مصر", "🇬🇧 المملكة المتحدة", "🌍 وأكثر"].map((c, i) => (
                    <View key={i} style={s.intlChip}>
                      <Text style={s.intlChipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <MaterialCommunityIcons name="earth" size={48} color="#60A5FA" />
            </View>
            <TouchableOpacity
              style={s.intlBtn}
              onPress={() => { Haptics.selectionAsync(); setShowForm(true); }}
            >
              <Text style={s.intlBtnText}>تسجيل كوكالة دولية</Text>
              <Ionicons name="arrow-back" size={16} color="#1D4ED8" />
            </TouchableOpacity>
          </LinearGradient>
        </View>

      </ScrollView>

      {/* نموذج الانضمام */}
      <JoinFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => { setShowForm(false); load(); }}
      />
    </View>
  );
}

// ─── بطاقة وكالة مميزة (أفقية) ───────────────────────────────────────────────
function FeaturedCard({ agency: a, onWA }: { agency: Agency; onWA: (w: string) => void }) {
  const cfg = TYPE_CONFIG[a.agency_type] || TYPE_CONFIG.local;
  return (
    <View style={[fc.card, { borderColor: cfg.color + "50" }]}>
      <LinearGradient colors={[cfg.color + "18", "#0D1117"]} style={StyleSheet.absoluteFill} />
      <View style={[fc.iconWrap, { backgroundColor: cfg.color + "20" }]}>
        <Text style={{ fontSize: 26 }}>{cfg.emoji}</Text>
      </View>
      <Text style={fc.name} numberOfLines={2}>{a.name}</Text>
      {a.city && <Text style={fc.city}>📍 {a.city}</Text>}
      {a.specialties?.length > 0 && (
        <View style={fc.chips}>
          {a.specialties.slice(0, 2).map((sp, i) => (
            <View key={i} style={[fc.chip, { backgroundColor: cfg.color + "20" }]}>
              <Text style={[fc.chipText, { color: cfg.color }]}>{sp}</Text>
            </View>
          ))}
        </View>
      )}
      {a.whatsapp && (
        <TouchableOpacity style={fc.waBtn} onPress={() => onWA(a.whatsapp!)}>
          <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
          <Text style={fc.waText}>واتساب</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── بطاقة وكالة عادية ────────────────────────────────────────────────────────
function AgencyCard({ agency: a, onWA }: { agency: Agency; onWA: (w: string) => void }) {
  const cfg = TYPE_CONFIG[a.agency_type] || TYPE_CONFIG.local;
  return (
    <View style={[ac.card, { borderColor: cfg.color + "35" }]}>
      <LinearGradient colors={[cfg.color + "0D", "transparent"]} style={StyleSheet.absoluteFill} />

      {a.is_featured && (
        <View style={[ac.featuredBadge, { backgroundColor: "#F59E0B" }]}>
          <Ionicons name="star" size={10} color="#000" />
          <Text style={ac.featuredText}>مميز</Text>
        </View>
      )}

      <View style={ac.topRow}>
        <View style={[ac.typeIcon, { backgroundColor: cfg.color + "1A", borderColor: cfg.color + "40" }]}>
          <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ac.name} numberOfLines={2}>{a.name}</Text>
          {a.name_en && <Text style={ac.nameEn}>{a.name_en}</Text>}
          <View style={[ac.typePill, { backgroundColor: cfg.color + "20" }]}>
            <Text style={[ac.typePillText, { color: cfg.color }]}>{cfg.labelFull}</Text>
          </View>
        </View>
      </View>

      {(a.city || a.country) && (
        <View style={ac.metaRow}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
          <Text style={ac.metaText}>{[a.city, a.country].filter(Boolean).join(" — ")}</Text>
        </View>
      )}

      {a.license_number && (
        <View style={ac.metaRow}>
          <Ionicons name="shield-checkmark-outline" size={13} color="#10B981" />
          <Text style={[ac.metaText, { color: "#10B981" }]}>رقم الترخيص: {a.license_number}</Text>
        </View>
      )}

      {a.description ? <Text style={ac.desc} numberOfLines={3}>{a.description}</Text> : null}

      {a.destinations && a.destinations.length > 0 && (
        <View>
          <Text style={ac.subsection}>🗺️ المقاصد</Text>
          <View style={ac.chips}>
            {a.destinations.slice(0, 5).map((d, i) => (
              <View key={i} style={[ac.chip, { backgroundColor: "#3B82F620", borderColor: "#3B82F640" }]}>
                <Text style={[ac.chipText, { color: "#60A5FA" }]}>{d}</Text>
              </View>
            ))}
            {a.destinations.length > 5 && (
              <View style={[ac.chip, { backgroundColor: Colors.cardBg }]}>
                <Text style={[ac.chipText, { color: Colors.textMuted }]}>+{a.destinations.length - 5}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {a.specialties && a.specialties.length > 0 && (
        <View>
          <Text style={ac.subsection}>✈️ التخصصات</Text>
          <View style={ac.chips}>
            {a.specialties.map((sp, i) => (
              <View key={i} style={[ac.chip, { backgroundColor: cfg.color + "12", borderColor: cfg.color + "30" }]}>
                <Text style={[ac.chipText, { color: cfg.color }]}>{sp}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={ac.actions}>
        {a.whatsapp && (
          <TouchableOpacity style={ac.waBtn} onPress={() => onWA(a.whatsapp!)}>
            <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
            <Text style={ac.waBtnText}>واتساب</Text>
          </TouchableOpacity>
        )}
        {a.phone && (
          <TouchableOpacity
            style={ac.phoneBtn}
            onPress={() => Linking.openURL(`tel:${a.phone}`).catch(() => {})}
          >
            <Ionicons name="call-outline" size={15} color={Colors.textMuted} />
            <Text style={ac.phoneBtnText}>{a.phone}</Text>
          </TouchableOpacity>
        )}
        {a.website && (
          <TouchableOpacity
            style={ac.webBtn}
            onPress={() => Linking.openURL(a.website!.startsWith("http") ? a.website! : `https://${a.website}`).catch(() => {})}
          >
            <Ionicons name="globe-outline" size={14} color="#60A5FA" />
            <Text style={ac.webBtnText} numberOfLines={1}>{a.website.replace(/^https?:\/\//, "")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── نموذج الانضمام ───────────────────────────────────────────────────────────
function JoinFormModal({
  visible, onClose, onSuccess,
}: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // الخطوة ١
  const [agencyName,   setAgencyName]   = useState("");
  const [agencyNameEn, setAgencyNameEn] = useState("");
  const [agencyType,   setAgencyType]   = useState<AgencyType>("local");
  const [city,         setCity]         = useState("");
  const [country,      setCountry]      = useState("السودان");
  const [licenseNum,   setLicenseNum]   = useState("");
  const [foundedYear,  setFoundedYear]  = useState("");
  const [website,      setWebsite]      = useState("");

  // الخطوة ٢
  const [contactName,  setContactName]  = useState("");
  const [contactRole,  setContactRole]  = useState("");
  const [phone,        setPhone]        = useState("");
  const [whatsapp,     setWhatsapp]     = useState("");
  const [email,        setEmail]        = useState("");

  // الخطوة ٣
  const [description,     setDescription]    = useState("");
  const [specialtiesText, setSpecialtiesText] = useState("");
  const [destinationsText,setDestinationsText]= useState("");
  const [targetRoutes,    setTargetRoutes]    = useState("");
  const [servicesOffered, setServicesOffered] = useState("");

  const reset = () => {
    setStep(1);
    setAgencyName(""); setAgencyNameEn(""); setAgencyType("local");
    setCity(""); setCountry("السودان"); setLicenseNum(""); setFoundedYear(""); setWebsite("");
    setContactName(""); setContactRole(""); setPhone(""); setWhatsapp(""); setEmail("");
    setDescription(""); setSpecialtiesText(""); setDestinationsText(""); setTargetRoutes(""); setServicesOffered("");
  };

  const handleClose = () => { reset(); onClose(); };

  const validateStep = (n: number): boolean => {
    if (n === 1) {
      if (!agencyName.trim()) { Alert.alert("بيانات ناقصة", "اسم الوكالة مطلوب"); return false; }
      return true;
    }
    if (n === 2) {
      if (!contactName.trim()) { Alert.alert("بيانات ناقصة", "اسم المسؤول مطلوب"); return false; }
      if (!phone.trim() && !whatsapp.trim() && !email.trim()) {
        Alert.alert("بيانات ناقصة", "يرجى إدخال وسيلة تواصل واحدة على الأقل"); return false;
      }
      return true;
    }
    return true;
  };

  const next = () => { if (validateStep(step)) { Haptics.selectionAsync(); setStep(s => s + 1); } };
  const prev = () => { Haptics.selectionAsync(); setStep(s => Math.max(1, s - 1)); };

  const submit = async () => {
    if (!validateStep(1) || !validateStep(2)) return;
    try {
      setSubmitting(true);
      const specialties  = specialtiesText.split(/[,،\n]/).map(s => s.trim()).filter(Boolean);
      const destinations = destinationsText.split(/[,،\n]/).map(s => s.trim()).filter(Boolean);
      const r = await fetch(`${getApiUrl()}/api/travel-agencies/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency_name: agencyName, agency_type: agencyType,
          specialties, destinations, description, website,
          contact_name: contactName, contact_role: contactRole,
          phone, whatsapp, email, city,
          country: country || "السودان",
          license_number: licenseNum,
          founded_year: foundedYear ? parseInt(foundedYear) : undefined,
          services_offered: servicesOffered,
          target_routes: targetRoutes,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الإرسال");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "✅ تم استلام طلبكم",
        j.message || "سيتم مراجعة طلب انضمام وكالتكم والرد خلال 48 ساعة",
        [{ text: "حسناً", onPress: () => { reset(); onSuccess(); } }]
      );
    } catch (e: any) {
      Alert.alert("خطأ في الإرسال", e.message || "تعذّر إرسال الطلب. يرجى المحاولة مجدداً.");
    } finally { setSubmitting(false); }
  };

  const stepLabels = ["بيانات الوكالة", "جهة الاتصال", "الخدمات والمسارات"];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: Colors.bg }}>

        {/* رأس النموذج */}
        <LinearGradient colors={["#0A1A2E", "#1D4ED8"]} style={[m.header, { paddingTop: insets.top + 10 }]}>
          <View style={m.headerRow}>
            <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={m.headerTitle}>✈️ تسجيل وكالة سفر</Text>
              <Text style={m.headerSub}>الخطوة {step} من 3 — {stepLabels[step - 1]}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <View style={m.progress}>
            {[1, 2, 3].map(n => (
              <View key={n} style={[m.progressBar, { backgroundColor: n <= step ? "#60A5FA" : "rgba(255,255,255,0.15)" }]} />
            ))}
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* ── الخطوة ١ ── */}
          {step === 1 && (
            <Animated.View entering={FadeIn}>
              <SectionHint icon="business" title="بيانات الوكالة" hint="عرّفنا بوكالتكم" />

              <Field label="اسم الوكالة (عربي) *" value={agencyName} onChangeText={setAgencyName} placeholder="مثال: وكالة النيل للسفر" />
              <Field label="اسم الوكالة (إنجليزي)" value={agencyNameEn} onChangeText={setAgencyNameEn} placeholder="Nile Travel Agency" autoCapitalize="words" />

              <Text style={m.label}>نوع الوكالة *</Text>
              <View style={m.typeGrid}>
                {TYPE_KEYS.map(k => {
                  const cfg = TYPE_CONFIG[k];
                  const active = agencyType === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[m.typeBtn, active && { borderColor: cfg.color, backgroundColor: cfg.color + "20" }]}
                      onPress={() => { Haptics.selectionAsync(); setAgencyType(k); }}
                    >
                      <Text style={m.typeEmoji}>{cfg.emoji}</Text>
                      <Text style={[m.typeBtnText, active && { color: cfg.color }]}>{cfg.label}</Text>
                      <Text style={m.typeDesc}>{cfg.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="المدينة" value={city} onChangeText={setCity} placeholder="الحصاحيصا" /></View>
                <View style={{ flex: 1 }}><Field label="الدولة" value={country} onChangeText={setCountry} placeholder="السودان" /></View>
              </View>
              <Field label="رقم الترخيص" value={licenseNum} onChangeText={setLicenseNum} placeholder="اختياري" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="سنة التأسيس" value={foundedYear} onChangeText={setFoundedYear} placeholder="مثال: 2010" keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Field label="الموقع الإلكتروني" value={website} onChangeText={setWebsite} placeholder="example.com" autoCapitalize="none" /></View>
              </View>
            </Animated.View>
          )}

          {/* ── الخطوة ٢ ── */}
          {step === 2 && (
            <Animated.View entering={FadeIn}>
              <SectionHint icon="person" title="جهة الاتصال" hint="المسؤول عن متابعة الطلب" />

              <Field label="اسم المسؤول *" value={contactName} onChangeText={setContactName} placeholder="الاسم الكامل" />
              <Field label="المسمى الوظيفي" value={contactRole} onChangeText={setContactRole} placeholder="مثال: مدير التسويق" />
              <Field label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="+249916xxxxxxx" keyboardType="phone-pad" />
              <Field label="رقم الواتساب" value={whatsapp} onChangeText={setWhatsapp} placeholder="+966xxxxxxxxx" keyboardType="phone-pad" />
              <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="info@agency.com" keyboardType="email-address" autoCapitalize="none" />

              <View style={m.notice}>
                <Ionicons name="information-circle" size={16} color="#60A5FA" />
                <Text style={m.noticeText}>يُرجى إدخال وسيلة تواصل واحدة على الأقل</Text>
              </View>
            </Animated.View>
          )}

          {/* ── الخطوة ٣ ── */}
          {step === 3 && (
            <Animated.View entering={FadeIn}>
              <SectionHint icon="map" title="الخدمات والمسارات" hint="صف ما تقدمه وكالتكم" />

              <Field
                label="نبذة عن الوكالة"
                value={description} onChangeText={setDescription}
                placeholder="صف وكالتكم وتجربتها في مجال السفر..."
                multiline
              />
              <Field
                label="التخصصات (افصل بفاصلة)"
                value={specialtiesText} onChangeText={setSpecialtiesText}
                placeholder="مثال: حج وعمرة، رحلات عائلية، سياحة طبية"
                multiline
              />
              <Field
                label="المقاصد والوجهات (افصل بفاصلة)"
                value={destinationsText} onChangeText={setDestinationsText}
                placeholder="مثال: القاهرة، دبي، إسطنبول، مكة المكرمة"
                multiline
              />
              <Field
                label="خطوط السفر المتاحة"
                value={targetRoutes} onChangeText={setTargetRoutes}
                placeholder="مثال: الحصاحيصا — الخرطوم — الرياض"
                multiline
              />
              <Field
                label="الخدمات المقدمة"
                value={servicesOffered} onChangeText={setServicesOffered}
                placeholder="مثال: حجز تذاكر طيران، تأشيرات، فنادق، باقات سياحية"
                multiline
              />

              <View style={m.notice}>
                <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                <Text style={m.noticeText}>سيُراجَع طلبكم من قِبل فريق المنصة ويُعتمَد خلال 48 ساعة</Text>
              </View>
            </Animated.View>
          )}

        </ScrollView>

        {/* أزرار التنقل */}
        <View style={[m.footer, { paddingBottom: insets.bottom + 12 }]}>
          {step > 1 && (
            <TouchableOpacity style={m.prevBtn} onPress={prev}>
              <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
              <Text style={m.prevText}>السابق</Text>
            </TouchableOpacity>
          )}
          {step < 3 ? (
            <TouchableOpacity style={m.nextBtn} onPress={next}>
              <Text style={m.nextText}>التالي</Text>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[m.nextBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Text style={m.nextText}>إرسال الطلب</Text><Ionicons name="send" size={16} color="#fff" /></>
              }
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── مكوّنات مساعدة ────────────────────────────────────────────────────────
function SectionHint({ icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <View style={m.sectionHint}>
      <Ionicons name={icon} size={20} color="#60A5FA" />
      <View>
        <Text style={m.sectionHintTitle}>{title}</Text>
        <Text style={m.sectionHintSub}>{hint}</Text>
      </View>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={m.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={Colors.textMuted} multiline={multiline}
        keyboardType={keyboardType} autoCapitalize={autoCapitalize}
        style={[m.input, multiline && { height: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

// ─── الأنماط ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.bg },
  header:     { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow:  { flexDirection: "row-reverse", alignItems: "center", paddingTop: 12, marginBottom: 14 },
  backBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  headerIconWrap: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(96,165,250,0.15)", justifyContent: "center", alignItems: "center" },
  headerTitle:{ fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "right" },
  headerSub:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "right" },
  statsRow:   { flexDirection: "row-reverse", justifyContent: "space-around" },
  statBox:    { alignItems: "center", gap: 3 },
  statNum:    { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statLabel:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)" },

  section:      { marginTop: 20 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 10, paddingHorizontal: 16 },
  sectionRow:   { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  featuredDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B" },

  destChip:   { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  destFlag:   { fontSize: 16 },
  destName:   { fontFamily: "Cairo_600SemiBold", fontSize: 13 },

  ctaCard:    { flexDirection: "row-reverse", alignItems: "center", gap: 14, borderRadius: 16, padding: 18, marginBottom: 4 },
  ctaIconWrap:{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  ctaTitle:   { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  ctaDesc:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)", textAlign: "right", marginTop: 2 },

  benefitsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 },
  benefitCard:  { width: "47%", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, overflow: "hidden" },
  benefitIcon:  { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  benefitTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  benefitDesc:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", lineHeight: 18 },

  filterChip:  { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  filterEmoji: { fontSize: 14 },
  filterText:  { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary },

  emptyBox:  { alignItems: "center", paddingVertical: 50, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textMuted, textAlign: "center" },
  emptyBtn:  { backgroundColor: "#1D4ED8", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 4 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  intlBanner: { marginHorizontal: 16, borderRadius: 18, padding: 20, gap: 16, overflow: "hidden" },
  intlRow:    { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  intlTitle:  { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right", marginBottom: 6 },
  intlDesc:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "right", lineHeight: 20, marginBottom: 10 },
  intlChips:  { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  intlChip:   { backgroundColor: "rgba(96,165,250,0.15)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(96,165,250,0.25)" },
  intlChipText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "#93C5FD" },
  intlBtn:    { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  intlBtnText:{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#1D4ED8" },
});

// بطاقة وكالة مميزة
const fc = StyleSheet.create({
  card:     { width: 180, backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, overflow: "hidden" },
  iconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  name:     { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  city:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  chips:    { flexDirection: "row-reverse", flexWrap: "wrap", gap: 4 },
  chip:     { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 10 },
  waBtn:    { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#25D36618", borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 4 },
  waText:   { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#25D366" },
});

// بطاقة وكالة عادية
const ac = StyleSheet.create({
  card:        { backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, padding: 16, gap: 10, overflow: "hidden" },
  featuredBadge: { position: "absolute", top: 10, left: 12, flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  featuredText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#000" },
  topRow:      { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  typeIcon:    { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  name:        { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  nameEn:      { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  typePill:    { alignSelf: "flex-end", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  typePillText:{ fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  metaRow:     { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  metaText:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  desc:        { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  subsection:  { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, marginBottom: 5, textAlign: "right" },
  chips:       { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip:        { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  chipText:    { fontFamily: "Cairo_500Medium", fontSize: 11 },
  actions:     { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 4 },
  waBtn:       { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#25D36618", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  waBtnText:   { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#25D366" },
  phoneBtn:    { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.bg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  phoneBtnText:{ fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  webBtn:      { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#3B82F610", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  webBtnText:  { fontFamily: "Cairo_500Medium", fontSize: 11, color: "#60A5FA", flex: 1 },
});

// نموذج الانضمام
const m = StyleSheet.create({
  header:     { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow:  { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12 },
  closeBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  headerTitle:{ fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  headerSub:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 2 },
  progress:   { flexDirection: "row-reverse", gap: 6 },
  progressBar:{ flex: 1, height: 4, borderRadius: 2 },

  label:   { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, marginBottom: 6, textAlign: "right" },
  input:   { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", minHeight: 46 },

  typeGrid:    { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  typeBtn:     { width: "47%", backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 10, alignItems: "flex-end", gap: 3 },
  typeEmoji:   { fontSize: 20 },
  typeBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary, textAlign: "right" },
  typeDesc:    { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right" },

  sectionHint:      { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#60A5FA10", borderRadius: 12, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: "#60A5FA25" },
  sectionHintTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  sectionHintSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  notice:     { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#60A5FA10", borderRadius: 10, padding: 12, marginTop: 6 },
  noticeText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right" },

  footer:  { flexDirection: "row-reverse", padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  prevBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.cardBg, borderRadius: 14, paddingVertical: 13 },
  prevText:{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  nextBtn: { flex: 2, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1D4ED8", borderRadius: 14, paddingVertical: 13 },
  nextText:{ fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
