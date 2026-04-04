import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Pressable, Alert, Platform,
  Image, ActivityIndicator, Linking,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { getApiUrl } from "@/lib/query-client";
import AnimatedPress from "@/components/AnimatedPress";
import { uploadAdImage } from "@/lib/firebase/storage";

// ─── Constants ───────────────────────────────────────────────────

const ACCENT   = Colors.accent ?? "#F59E0B";
const EMERALD  = Colors.primary;
const CARD_BG  = Colors.cardBg;
const BG       = Colors.bg;
const TEXT     = Colors.textPrimary;
const MUTED    = Colors.textMuted;
const SUB      = Colors.textSecondary;
const DIVIDER  = Colors.divider;

type AdType   = "promotion" | "announcement" | "event" | "surprise" | "banner";
type TabId    = "active" | "spaces" | "mine";
type AdStatus = "pending" | "active" | "rejected" | "expired";

type Ad = {
  id: number;
  institution_name: string;
  title: string;
  description?: string;
  type: AdType;
  status: AdStatus;
  start_date?: string;
  end_date?: string;
  created_at: string;
  image_url?: string;
  website_url?: string;
  admin_note?: string;
  duration_days?: number;
  budget?: string;
};

type AdsSettings = {
  ad_price_per_day?: string;
  ad_contact_phone?: string;
  ad_contact_whatsapp?: string;
  ad_promo_text?: string;
  ad_bank_info?: string;
};

const AD_TYPES: Record<AdType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  promotion:    { label: "عرض خاص",   icon: "pricetag",           color: "#E67E22" },
  announcement: { label: "إعلان",     icon: "megaphone",          color: EMERALD   },
  event:        { label: "فعالية",    icon: "calendar",           color: "#3B82F6" },
  surprise:     { label: "مفاجأة",    icon: "gift",               color: "#8B5CF6" },
  banner:       { label: "إعلان عام", icon: "information-circle", color: "#2980B9" },
};

const STATUS_META: Record<AdStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:  { label: "قيد المراجعة", color: "#F59E0B", bg: "#F59E0B18", icon: "time-outline"              },
  active:   { label: "نشط",          color: "#27AE60", bg: "#27AE6018", icon: "checkmark-circle-outline"  },
  rejected: { label: "مرفوض",        color: "#E05567", bg: "#E0556718", icon: "close-circle-outline"      },
  expired:  { label: "منتهي",        color: MUTED,     bg: "#FFFFFF10", icon: "hourglass-outline"          },
};

function daysLeft(endDate?: string) {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.ceil(diff / 864e5);
  if (days <= 0) return "منتهي";
  if (days === 1) return "ينتهي غداً";
  return `${days} أيام متبقية`;
}

// ─── Package Card ─────────────────────────────────────────────────

type PackageDef = {
  days: number;
  label: string;
  badge?: string;
  badgeColor?: string;
  features: string[];
};

const PACKAGES: PackageDef[] = [
  { days: 7,  label: "أسبوع",   features: ["نشر فوري بعد المراجعة", "ظهور في الصفحة الرئيسية", "شارة 'إعلان نشط'"] },
  { days: 14, label: "أسبوعان", badge: "الأكثر طلباً", badgeColor: ACCENT,
    features: ["كل مزايا الأسبوع", "أولوية الظهور أعلى القائمة", "إشعار للمستخدمين"] },
  { days: 30, label: "شهر",     badge: "أفضل قيمة", badgeColor: "#27AE60",
    features: ["كل مزايا الأسبوعين", "ظهور مميز في الواجهة", "تقرير أداء شهري"] },
  { days: 60, label: "شهران",   badge: "مميز", badgeColor: "#8B5CF6",
    features: ["كل مزايا الشهر", "دعم مباشر من الإدارة", "تجديد تلقائي اختياري"] },
];

function PackageCard({
  pkg, pricePerDay, selected, onSelect,
}: { pkg: PackageDef; pricePerDay: number; selected: boolean; onSelect: () => void }) {
  const cost = pkg.days * pricePerDay;
  const color = selected ? pkg.badgeColor ?? EMERALD : CARD_BG;
  return (
    <TouchableOpacity
      style={[
        s.pkgCard,
        selected && { borderColor: pkg.badgeColor ?? EMERALD, backgroundColor: (pkg.badgeColor ?? EMERALD) + "12" },
      ]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      {pkg.badge && (
        <View style={[s.pkgBadge, { backgroundColor: pkg.badgeColor + "22" }]}>
          <Text style={[s.pkgBadgeText, { color: pkg.badgeColor }]}>{pkg.badge}</Text>
        </View>
      )}
      <Text style={s.pkgDays}>{pkg.days}</Text>
      <Text style={s.pkgDaysLabel}>يوم</Text>
      <Text style={s.pkgName}>{pkg.label}</Text>
      <Text style={[s.pkgPrice, selected && { color: pkg.badgeColor ?? EMERALD }]}>
        {cost.toLocaleString()} ج
      </Text>
      <View style={s.pkgDivider} />
      {pkg.features.map((f, i) => (
        <View key={i} style={s.pkgFeatureRow}>
          <Ionicons name="checkmark-circle" size={13} color={pkg.badgeColor ?? EMERALD} />
          <Text style={s.pkgFeature}>{f}</Text>
        </View>
      ))}
      {selected && (
        <View style={[s.pkgSelectedBadge, { backgroundColor: pkg.badgeColor ?? EMERALD }]}>
          <Ionicons name="checkmark" size={12} color="#fff" />
          <Text style={s.pkgSelectedText}>مختار</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Active Ad Card ───────────────────────────────────────────────

function AdCard({ ad, index }: { ad: Ad; index: number }) {
  const meta = AD_TYPES[ad.type] ?? AD_TYPES.announcement;
  const remaining = daysLeft(ad.end_date);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
      <TouchableOpacity
        style={s.adCard}
        activeOpacity={ad.website_url ? 0.85 : 1}
        onPress={() => ad.website_url && Linking.openURL(ad.website_url)}
      >
        {ad.image_url ? (
          <Image source={{ uri: ad.image_url }} style={s.adImage} resizeMode="cover" />
        ) : null}
        <View style={[s.adTypeBorderLine, { backgroundColor: meta.color }]} />
        <View style={s.adBody}>
          <View style={s.adHeaderRow}>
            <View style={[s.adTypeChip, { backgroundColor: meta.color + "18" }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[s.adTypeChipText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {remaining && (
              <View style={s.remainingBadge}>
                <Ionicons name="time-outline" size={10} color={MUTED} />
                <Text style={s.remainingText}>{remaining}</Text>
              </View>
            )}
          </View>
          <Text style={s.adInstitution}>{ad.institution_name}</Text>
          <Text style={s.adTitle}>{ad.title}</Text>
          {ad.description ? (
            <Text style={s.adDesc} numberOfLines={2}>{ad.description}</Text>
          ) : null}
          <View style={s.adFooterRow}>
            <View style={s.sponsoredChip}>
              <Ionicons name="star" size={10} color={ACCENT} />
              <Text style={s.sponsoredText}>إعلان مموَّل · مراجعة الإدارة</Text>
            </View>
            {ad.website_url && (
              <View style={s.linkChip}>
                <Ionicons name="open-outline" size={12} color={EMERALD} />
                <Text style={s.linkChipText}>زيارة</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── My Request Card ──────────────────────────────────────────────

function MyRequestCard({ ad, index }: { ad: Ad; index: number }) {
  const sm = STATUS_META[ad.status] ?? STATUS_META.pending;
  const meta = AD_TYPES[ad.type] ?? AD_TYPES.announcement;
  const date = new Date(ad.created_at).toLocaleDateString("ar-SD", { year: "numeric", month: "short", day: "numeric" });
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={s.myCard}>
      {ad.image_url ? (
        <Image source={{ uri: ad.image_url }} style={s.myCardImg} resizeMode="cover" />
      ) : (
        <View style={[s.myCardImgPlaceholder, { backgroundColor: meta.color + "18" }]}>
          <Ionicons name={meta.icon} size={28} color={meta.color} />
        </View>
      )}
      <View style={s.myCardBody}>
        <View style={s.myCardTop}>
          <View style={[s.statusChip, { backgroundColor: sm.bg }]}>
            <Ionicons name={sm.icon} size={12} color={sm.color} />
            <Text style={[s.statusChipText, { color: sm.color }]}>{sm.label}</Text>
          </View>
          <Text style={s.myCardDate}>{date}</Text>
        </View>
        <Text style={s.myCardInstitution}>{ad.institution_name}</Text>
        <Text style={s.myCardTitle}>{ad.title}</Text>
        {ad.admin_note ? (
          <View style={s.adminNoteRow}>
            <Ionicons name="information-circle-outline" size={13} color={MUTED} />
            <Text style={s.adminNoteText} numberOfLines={2}>{ad.admin_note}</Text>
          </View>
        ) : null}
        <View style={s.myCardFooter}>
          <Text style={s.myCardMeta}>
            {ad.duration_days} يوم · {ad.budget ?? "—"}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Book Ad Space Tab ────────────────────────────────────────────

function SpacesTab({
  pricePerDay, settings, onBook,
}: { pricePerDay: number; settings: AdsSettings; onBook: () => void }) {
  const HOW_TO = [
    { n: "١", title: "اختر باقتك",     desc: "حدد مدة الإعلان والميزانية المناسبة لك" },
    { n: "٢", title: "أرسل طلبك",      desc: "أدخل بيانات جهتك واختر صورة الإعلان" },
    { n: "٣", title: "موافقة الإدارة", desc: "نراجع طلبك ونتواصل معك خلال 24 ساعة" },
    { n: "٤", title: "ابدأ الإعلان",   desc: "بعد إتمام الدفع ينشر إعلانك فوراً"   },
  ];

  const promoText = settings.ad_promo_text || "أعلن لآلاف أبناء الحصاحيصا يومياً";

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.spacesContent}>

      {/* Hero */}
      <Animated.View entering={FadeIn.duration(500)} style={s.spaceHero}>
        <View style={s.spaceHeroAccent} />
        <View style={s.spaceHeroIcon}>
          <Ionicons name="megaphone" size={36} color={ACCENT} />
        </View>
        <Text style={s.spaceHeroTitle}>مساحة إعلانية للإيجار</Text>
        <Text style={s.spaceHeroSub}>{promoText}</Text>
        <View style={s.heroStatsRow}>
          {[
            { v: "5,000+", l: "مستخدم نشط" },
            { v: `${pricePerDay.toLocaleString()}`, l: "جنيه / يوم" },
            { v: "24 ساعة", l: "للموافقة" },
          ].map((st, i) => (
            <View key={i} style={s.heroStat}>
              <Text style={s.heroStatVal}>{st.v}</Text>
              <Text style={s.heroStatLabel}>{st.l}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Packages */}
      <Text style={s.sectionTitle}>باقات الإعلان</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pkgsRow}>
        {PACKAGES.map(pkg => (
          <View key={pkg.days} style={s.pkgStaticWrapper}>
            <View style={[s.pkgCard, pkg.badgeColor && { borderColor: pkg.badgeColor + "55" }]}>
              {pkg.badge && (
                <View style={[s.pkgBadge, { backgroundColor: pkg.badgeColor + "22" }]}>
                  <Text style={[s.pkgBadgeText, { color: pkg.badgeColor }]}>{pkg.badge}</Text>
                </View>
              )}
              <Text style={s.pkgDays}>{pkg.days}</Text>
              <Text style={s.pkgDaysLabel}>يوم</Text>
              <Text style={s.pkgName}>{pkg.label}</Text>
              <Text style={[s.pkgPrice, pkg.badgeColor && { color: pkg.badgeColor }]}>
                {(pkg.days * pricePerDay).toLocaleString()} ج
              </Text>
              <View style={s.pkgDivider} />
              {pkg.features.map((f, i) => (
                <View key={i} style={s.pkgFeatureRow}>
                  <Ionicons name="checkmark-circle" size={13} color={pkg.badgeColor ?? EMERALD} />
                  <Text style={s.pkgFeature}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CTA Button */}
      <TouchableOpacity style={s.bigCTA} onPress={onBook} activeOpacity={0.88}>
        <Ionicons name="megaphone-outline" size={20} color="#fff" />
        <Text style={s.bigCTAText}>احجز مساحتك الإعلانية الآن</Text>
        <Ionicons name="chevron-back" size={18} color="#ffffff99" />
      </TouchableOpacity>

      {/* How it works */}
      <Text style={s.sectionTitle}>كيف يعمل؟</Text>
      {HOW_TO.map((h, i) => (
        <Animated.View key={i} entering={FadeInDown.delay(i * 80)} style={s.stepCard}>
          <View style={s.stepNum}>
            <Text style={s.stepNumText}>{h.n}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>{h.title}</Text>
            <Text style={s.stepDesc}>{h.desc}</Text>
          </View>
        </Animated.View>
      ))}

      {/* Contact */}
      {(settings.ad_contact_whatsapp || settings.ad_contact_phone) && (
        <View style={s.contactCard}>
          <Text style={s.contactTitle}>تواصل للاستفسار</Text>
          <Text style={s.contactSub}>للمزيد من المعلومات تواصل معنا مباشرة</Text>
          <View style={s.contactBtns}>
            {settings.ad_contact_whatsapp && (
              <TouchableOpacity
                style={s.waBtn}
                onPress={() => Linking.openURL(`whatsapp://send?phone=${settings.ad_contact_whatsapp}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={s.waBtnText}>واتساب</Text>
              </TouchableOpacity>
            )}
            {settings.ad_contact_phone && (
              <TouchableOpacity
                style={s.callBtn}
                onPress={() => Linking.openURL(`tel:${settings.ad_contact_phone}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={18} color={EMERALD} />
                <Text style={s.callBtnText}>اتصال</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── My Requests Tab ──────────────────────────────────────────────

function MyRequestsTab() {
  const [phone, setPhone] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);

  const handleSearch = async () => {
    if (!phone.trim()) { Alert.alert("مطلوب", "أدخل رقم هاتفك لعرض طلباتك"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/ads/my-requests?phone=${encodeURIComponent(phone.trim())}`);
      if (res.ok) { setAds(await res.json()); setSearched(true); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.mineContent}>
      <View style={s.phoneSearchCard}>
        <Ionicons name="phone-portrait-outline" size={28} color={EMERALD} />
        <Text style={s.phoneSearchTitle}>تتبّع طلباتك الإعلانية</Text>
        <Text style={s.phoneSearchSub}>أدخل رقم هاتفك الذي سجّلت به طلبك</Text>
        <View style={s.phoneRow}>
          <TextInput
            style={s.phoneInput}
            placeholder="+249..."
            placeholderTextColor={MUTED}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textAlign="right"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={s.phoneSearchBtn} onPress={handleSearch} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {searched && (
        <>
          {ads.length === 0 ? (
            <Animated.View entering={FadeIn} style={s.noResultsCard}>
              <Ionicons name="search-outline" size={40} color={MUTED} />
              <Text style={s.noResultsText}>لا توجد طلبات بهذا الرقم</Text>
              <Text style={s.noResultsSub}>تأكد من الرقم أو أرسل طلباً إعلانياً جديداً</Text>
            </Animated.View>
          ) : (
            <>
              <Text style={s.resultsCount}>{ads.length} طلب إعلاني</Text>
              {ads.map((a, i) => <MyRequestCard key={a.id} ad={a} index={i} />)}
            </>
          )}
        </>
      )}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ─── 3-Step Ad Request Modal ──────────────────────────────────────

function AdRequestModal({
  visible, onClose, onSuccess, pricePerDay, settings,
}: {
  visible: boolean; onClose: () => void; onSuccess: (bankInfo?: string) => void;
  pricePerDay: number; settings: AdsSettings;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 – Image
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Step 2 – Business info
  const [institutionName, setInstitutionName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Step 3 – Ad details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adType, setAdType] = useState<AdType>("promotion");
  const [durationDays, setDurationDays] = useState(14);
  const [sending, setSending] = useState(false);

  const estimatedCost = durationDays * pricePerDay;

  const reset = () => {
    setStep(1); setImageUri(null); setUploadProgress(null);
    setInstitutionName(""); setContactName(""); setContactPhone(""); setWebsiteUrl("");
    setTitle(""); setDescription(""); setAdType("promotion"); setDurationDays(14); setSending(false);
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("الإذن مطلوب", "اسمح للتطبيق بالوصول إلى الصور من إعدادات الجهاز"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [16, 9], quality: 0.88,
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("الإذن مطلوب", "اسمح للتطبيق بالوصول إلى الكاميرا من إعدادات الجهاز"); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [16, 9], quality: 0.88,
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const handleSend = async () => {
    if (!institutionName.trim() || !contactPhone.trim() || !title.trim()) {
      Alert.alert("حقول مطلوبة", "أدخل اسم الجهة والهاتف وعنوان الإعلان");
      return;
    }
    setSending(true);
    try {
      let uploadedImageUrl: string | undefined;
      if (imageUri) {
        setUploadProgress(0);
        try {
          uploadedImageUrl = await uploadAdImage(imageUri, p => setUploadProgress(p.percent));
        } catch { Alert.alert("تنبيه", "تعذّر رفع الصورة — سيُرسل الطلب بدون صورة"); }
        setUploadProgress(null);
      }
      const res = await fetch(`${getApiUrl()}/api/ads/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_name: institutionName.trim(),
          contact_name:     contactName.trim() || undefined,
          contact_phone:    contactPhone.trim(),
          title:            title.trim(),
          description:      description.trim() || undefined,
          type:             adType,
          duration_days:    durationDays,
          budget:           `${estimatedCost.toLocaleString()} جنيه`,
          image_url:        uploadedImageUrl,
          website_url:      websiteUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        reset(); onClose(); onSuccess(settings.ad_bank_info);
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "حدث خطأ، حاول مرة أخرى");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSending(false); }
  };

  const STEP_LABELS = ["الصورة", "بيانات الجهة", "تفاصيل الإعلان"];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />

          {/* Header */}
          <View style={s.sheetHeader}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={MUTED} />
            </TouchableOpacity>
            <Text style={s.sheetTitle}>حجز مساحة إعلانية</Text>
            <View style={s.stepBadge}>
              <Text style={s.stepBadgeText}>{step}/3</Text>
            </View>
          </View>

          {/* Step progress */}
          <View style={s.stepProgress}>
            {STEP_LABELS.map((lbl, i) => (
              <View key={i} style={s.stepItem}>
                <View style={[s.stepDot, step > i && s.stepDotDone, step === i + 1 && s.stepDotActive]}>
                  {step > i + 1 ? (
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  ) : (
                    <Text style={s.stepDotNum}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[s.stepLbl, step === i + 1 && s.stepLblActive]}>{lbl}</Text>
                {i < STEP_LABELS.length - 1 && (
                  <View style={[s.stepLine, step > i + 1 && s.stepLineDone]} />
                )}
              </View>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.formPad}>

              {/* ── Step 1: Image ── */}
              {step === 1 && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={s.stepHeading}>صورة الإعلان</Text>
                  <Text style={s.stepSubheading}>اختر صورة جذابة تعكس هوية جهتك (16:9)</Text>

                  {imageUri ? (
                    <View style={s.imgPreviewWrap}>
                      <Image source={{ uri: imageUri }} style={s.imgPreview} resizeMode="cover" />
                      <TouchableOpacity style={s.imgRemoveBtn} onPress={() => setImageUri(null)}>
                        <Ionicons name="close-circle" size={26} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.imgPickerEmpty}>
                      <Ionicons name="image-outline" size={48} color={MUTED} />
                      <Text style={s.imgPickerText}>لم يتم اختيار صورة بعد</Text>
                      <Text style={s.imgPickerHint}>JPG · PNG · نسبة 16:9 · جودة عالية</Text>
                    </View>
                  )}

                  <View style={s.imgBtnsRow}>
                    <TouchableOpacity style={s.imgPickBtn} onPress={pickFromGallery} activeOpacity={0.85}>
                      <Ionicons name="images-outline" size={20} color={EMERALD} />
                      <Text style={s.imgPickBtnText}>من المعرض</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.imgPickBtn} onPress={pickFromCamera} activeOpacity={0.85}>
                      <Ionicons name="camera-outline" size={20} color={EMERALD} />
                      <Text style={s.imgPickBtnText}>من الكاميرا</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.imgTipBox}>
                    <Ionicons name="bulb-outline" size={15} color={ACCENT} />
                    <Text style={s.imgTipText}>
                      الصورة تزيد من مشاهدات إعلانك بنسبة 3 أضعاف — ننصح باختيار صورة عالية الجودة
                    </Text>
                  </View>

                  <TouchableOpacity style={s.nextBtn} onPress={() => setStep(2)} activeOpacity={0.88}>
                    <Text style={s.nextBtnText}>التالي</Text>
                    <Ionicons name="chevron-back" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={() => setStep(2)}>
                    <Text style={s.skipBtnText}>تخطي — بدون صورة</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* ── Step 2: Business Info ── */}
              {step === 2 && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={s.stepHeading}>بيانات جهتك</Text>
                  <Text style={s.stepSubheading}>معلومات التواصل الرسمية لمؤسستك أو نشاطك التجاري</Text>

                  {[
                    { label: "اسم الجهة / المؤسسة *", value: institutionName, set: setInstitutionName, ph: "مدرسة · متجر · شركة · مكتب..." },
                    { label: "اسم الشخص المسؤول",      value: contactName,     set: setContactName,     ph: "الاسم الكامل" },
                    { label: "رقم التواصل *",           value: contactPhone,    set: setContactPhone,    ph: "+249XXXXXXXXX", numeric: true },
                    { label: "الموقع الإلكتروني",       value: websiteUrl,      set: setWebsiteUrl,      ph: "https://..." },
                  ].map((f, i) => (
                    <View key={i} style={s.formField}>
                      <Text style={s.formLabel}>{f.label}</Text>
                      <TextInput
                        style={s.formInput}
                        placeholder={f.ph}
                        placeholderTextColor={MUTED}
                        value={f.value}
                        onChangeText={f.set}
                        keyboardType={(f as any).numeric ? "phone-pad" : "default"}
                        textAlign="right"
                        autoCapitalize="none"
                      />
                    </View>
                  ))}

                  <View style={s.navRow}>
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)}>
                      <Ionicons name="chevron-forward" size={16} color={MUTED} />
                      <Text style={s.backBtnText}>رجوع</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.nextBtn}
                      onPress={() => {
                        if (!institutionName.trim() || !contactPhone.trim()) {
                          Alert.alert("مطلوب", "أدخل اسم الجهة ورقم التواصل");
                          return;
                        }
                        setStep(3);
                      }}
                      activeOpacity={0.88}
                    >
                      <Text style={s.nextBtnText}>التالي</Text>
                      <Ionicons name="chevron-back" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {/* ── Step 3: Ad Details & Package ── */}
              {step === 3 && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={s.stepHeading}>تفاصيل الإعلان</Text>
                  <Text style={s.stepSubheading}>اختر نوع إعلانك ومحتواه والباقة الأنسب لك</Text>

                  {/* نوع الإعلان */}
                  <Text style={s.formLabel}>نوع الإعلان</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={s.typeRow}>
                      {(Object.entries(AD_TYPES) as [AdType, typeof AD_TYPES[AdType]][]).map(([key, meta]) => (
                        <TouchableOpacity
                          key={key}
                          style={[s.typeChip, adType === key && { backgroundColor: meta.color, borderColor: meta.color }]}
                          onPress={() => setAdType(key)}
                        >
                          <Ionicons name={meta.icon} size={14} color={adType === key ? "#fff" : MUTED} />
                          <Text style={[s.typeChipText, adType === key && { color: "#fff" }]}>{meta.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* عنوان */}
                  <View style={s.formField}>
                    <Text style={s.formLabel}>عنوان الإعلان *</Text>
                    <TextInput
                      style={s.formInput}
                      placeholder="ما الذي تريد الإعلان عنه؟"
                      placeholderTextColor={MUTED}
                      value={title}
                      onChangeText={setTitle}
                      textAlign="right"
                    />
                  </View>

                  {/* تفاصيل */}
                  <View style={s.formField}>
                    <Text style={s.formLabel}>تفاصيل الإعلان</Text>
                    <TextInput
                      style={[s.formInput, s.formTextArea]}
                      placeholder="عروض، أسعار، شروط، مواعيد..."
                      placeholderTextColor={MUTED}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      textAlign="right"
                      textAlignVertical="top"
                    />
                  </View>

                  {/* الباقات */}
                  <Text style={s.formLabel}>اختر الباقة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={s.pkgsSelectRow}>
                      {PACKAGES.map(pkg => (
                        <PackageCard
                          key={pkg.days}
                          pkg={pkg}
                          pricePerDay={pricePerDay}
                          selected={durationDays === pkg.days}
                          onSelect={() => setDurationDays(pkg.days)}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  {/* Cost summary */}
                  <View style={s.costCard}>
                    <View style={s.costRow}>
                      <Text style={s.costLabel}>التكلفة التقديرية</Text>
                      <Text style={s.costAmount}>{estimatedCost.toLocaleString()} جنيه</Text>
                    </View>
                    <Text style={s.costBreakdown}>
                      {durationDays} يوم × {pricePerDay.toLocaleString()} جنيه/يوم
                    </Text>
                    <Text style={s.costNote}>
                      السعر قابل للتفاوض — ستتواصل معك الإدارة لإتمام الدفع
                    </Text>
                  </View>

                  {/* Upload progress */}
                  {uploadProgress !== null && (
                    <View style={s.uploadBar}>
                      <View style={[s.uploadBarFill, { width: `${uploadProgress}%` as any }]} />
                      <Text style={s.uploadBarText}>جاري رفع الصورة... {uploadProgress}%</Text>
                    </View>
                  )}

                  <View style={s.navRow}>
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)}>
                      <Ionicons name="chevron-forward" size={16} color={MUTED} />
                      <Text style={s.backBtnText}>رجوع</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.submitBtn, { opacity: sending ? 0.7 : 1 }]}
                      onPress={handleSend}
                      disabled={sending}
                      activeOpacity={0.88}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={16} color="#fff" />
                      )}
                      <Text style={s.submitBtnText}>{sending ? "جاري الإرسال..." : "إرسال الطلب"}</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Success Sheet ────────────────────────────────────────────────

function SuccessSheet({ visible, bankInfo, onClose }: { visible: boolean; bankInfo?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.sheetHandle} />
          <View style={s.successIconWrap}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color="#27AE60" />
            </View>
          </View>
          <Text style={s.successTitle}>تم استلام طلبك بنجاح!</Text>
          <Text style={s.successSub}>
            ستتواصل معك الإدارة خلال 24 ساعة لتأكيد الحجز وإتمام الدفع
          </Text>

          {bankInfo ? (
            <View style={s.bankBox}>
              <View style={s.bankBoxHeader}>
                <Ionicons name="card-outline" size={16} color={ACCENT} />
                <Text style={s.bankBoxTitle}>معلومات الدفع</Text>
              </View>
              <Text style={s.bankBoxText}>{bankInfo}</Text>
            </View>
          ) : null}

          <View style={s.nextStepsBox}>
            <Text style={s.nextStepsTitle}>الخطوات التالية</Text>
            {[
              "انتظر مراجعة الإدارة (24 ساعة)",
              "سيتصل بك المسؤول لتأكيد التفاصيل",
              "أتمِّ الدفع وفق المعلومات المُرسلة",
              "ينشر إعلانك فوراً بعد التأكيد",
            ].map((step, i) => (
              <View key={i} style={s.nextStepRow}>
                <View style={s.nextStepNum}>
                  <Text style={s.nextStepNumText}>{i + 1}</Text>
                </View>
                <Text style={s.nextStepText}>{step}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.successCloseBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.successCloseBtnText}>حسناً، فهمت</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────

export default function AdsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<TabId>("spaces");
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AdsSettings>({});
  const [showModal, setShowModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastBankInfo, setLastBankInfo] = useState<string | undefined>();

  const pricePerDay = parseInt(settings.ad_price_per_day ?? "500") || 500;

  const loadData = useCallback(async () => {
    try {
      const [adsRes, settingsRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/ads`),
        fetch(`${getApiUrl()}/api/ads/settings`),
      ]);
      if (adsRes.ok)      setAds(await adsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "active", label: "الإعلانات",   icon: "megaphone-outline" },
    { id: "spaces", label: "احجز مساحة", icon: "grid-outline"      },
    { id: "mine",   label: "طلباتي",      icon: "time-outline"      },
  ];

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>الإعلانات والمساحات</Text>
            <Text style={s.headerSub}>إعلانات مؤسسات الحصاحيصا · تحت إشراف الإدارة</Text>
          </View>
          <AnimatedPress style={s.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.addBtnText}>أعلن معنا</Text>
          </AnimatedPress>
        </View>

        {/* Tabs */}
        <View style={s.tabsRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, activeTab === tab.id && s.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={activeTab === tab.id ? "#fff" : MUTED}
              />
              <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === "spaces" && (
        <SpacesTab pricePerDay={pricePerDay} settings={settings} onBook={() => setShowModal(true)} />
      )}

      {activeTab === "mine" && <MyRequestsTab />}

      {activeTab === "active" && (
        loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={EMERALD} />
          </View>
        ) : (
          <FlatList
            data={ads}
            keyExtractor={a => String(a.id)}
            contentContainerStyle={s.listPad}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Animated.View entering={FadeIn.duration(400)} style={s.trustBanner}>
                <Ionicons name="shield-checkmark" size={15} color={EMERALD} />
                <Text style={s.trustBannerText}>
                  جميع الإعلانات مراجعة ومعتمدة من إدارة التطبيق قبل نشرها
                </Text>
              </Animated.View>
            }
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="megaphone-outline" size={56} color={MUTED} />
                <Text style={s.emptyTitle}>لا توجد إعلانات نشطة</Text>
                <Text style={s.emptySub}>كن أول من يُعلن في مجتمع الحصاحيصا</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setShowModal(true)}>
                  <Text style={s.emptyBtnText}>أعلن الآن</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item, index }) => <AdCard ad={item} index={index} />}
          />
        )
      )}

      <AdRequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        pricePerDay={pricePerDay}
        settings={settings}
        onSuccess={(bankInfo) => {
          setLastBankInfo(bankInfo);
          setShowSuccess(true);
          loadData();
        }}
      />

      <SuccessSheet
        visible={showSuccess}
        bankInfo={lastBankInfo}
        onClose={() => setShowSuccess(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    backgroundColor: CARD_BG,
    paddingHorizontal: 16, paddingBottom: 0,
    borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingBottom: 12 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: TEXT },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED, marginTop: 2 },
  addBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: EMERALD, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },

  // Tabs
  tabsRow: { flexDirection: "row-reverse", gap: 8, paddingBottom: 0 },
  tab: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 0,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: EMERALD },
  tabText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: MUTED },
  tabTextActive: { color: EMERALD, fontFamily: "Cairo_700Bold" },

  // Loading
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Ads list
  listPad: { gap: 12, paddingVertical: 14, paddingBottom: 120 },

  // Trust banner
  trustBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: EMERALD + "0F",
    borderBottomWidth: 1, borderBottomColor: EMERALD + "25",
    paddingHorizontal: 16, paddingVertical: 9, marginBottom: 4,
  },
  trustBannerText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: SUB, textAlign: "right" },

  // Active Ad Card
  adCard: {
    backgroundColor: CARD_BG, borderRadius: 18,
    borderWidth: 1, borderColor: DIVIDER,
    marginHorizontal: 14, overflow: "hidden",
    elevation: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8,
  },
  adImage: { width: "100%", height: 170 },
  adTypeBorderLine: { height: 3, width: "100%" },
  adBody: { padding: 14, gap: 5 },
  adHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  adTypeChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  adTypeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  remainingBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 3,
    backgroundColor: BG, borderRadius: 8, borderWidth: 1, borderColor: DIVIDER,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  remainingText: { fontFamily: "Cairo_500Medium", fontSize: 10, color: MUTED },
  adInstitution: { fontFamily: "Cairo_700Bold", fontSize: 14, color: TEXT, textAlign: "right" },
  adTitle:       { fontFamily: "Cairo_700Bold", fontSize: 16, color: TEXT, textAlign: "right", lineHeight: 24 },
  adDesc:        { fontFamily: "Cairo_400Regular", fontSize: 13, color: SUB, textAlign: "right", lineHeight: 20 },
  adFooterRow:   { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  sponsoredChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: ACCENT + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  sponsoredText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: ACCENT },
  linkChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: EMERALD + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  linkChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: EMERALD },

  // My Request Card
  myCard: {
    flexDirection: "row-reverse", backgroundColor: CARD_BG,
    borderRadius: 16, borderWidth: 1, borderColor: DIVIDER,
    marginHorizontal: 16, overflow: "hidden",
    elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  myCardImg: { width: 90, height: "100%" as any },
  myCardImgPlaceholder: { width: 90, justifyContent: "center", alignItems: "center" },
  myCardBody: { flex: 1, padding: 12, gap: 4 },
  myCardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  statusChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  myCardDate:        { fontFamily: "Cairo_400Regular", fontSize: 10, color: MUTED },
  myCardInstitution: { fontFamily: "Cairo_700Bold", fontSize: 12, color: TEXT, textAlign: "right" },
  myCardTitle:       { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: TEXT, textAlign: "right" },
  adminNoteRow:      { flexDirection: "row-reverse", gap: 4, alignItems: "flex-start" },
  adminNoteText:     { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED, textAlign: "right" },
  myCardFooter:      { marginTop: 2 },
  myCardMeta:        { fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED, textAlign: "right" },

  // Empty
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: TEXT },
  emptySub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: MUTED, textAlign: "center" },
  emptyBtn: {
    backgroundColor: EMERALD, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 11, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Spaces Tab
  spacesContent: { paddingBottom: 40 },
  spaceHero: {
    margin: 14, borderRadius: 22, overflow: "hidden",
    backgroundColor: "#0C1E14", borderWidth: 1, borderColor: EMERALD + "30",
    alignItems: "center", padding: 24, gap: 10,
  },
  spaceHeroAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: ACCENT },
  spaceHeroIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: ACCENT + "18",
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: ACCENT + "30",
  },
  spaceHeroTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: TEXT, textAlign: "center" },
  spaceHeroSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: SUB, textAlign: "center", lineHeight: 22 },
  heroStatsRow: { flexDirection: "row-reverse", gap: 0, width: "100%", backgroundColor: EMERALD + "12", borderRadius: 14, padding: 12, justifyContent: "space-around" },
  heroStat:     { alignItems: "center", gap: 2 },
  heroStatVal:  { fontFamily: "Cairo_700Bold", fontSize: 18, color: TEXT },
  heroStatLabel:{ fontFamily: "Cairo_400Regular", fontSize: 10, color: MUTED },

  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: TEXT,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, textAlign: "right",
  },

  pkgsRow: { paddingHorizontal: 14, gap: 10 },
  pkgsSelectRow: { flexDirection: "row", gap: 10 },
  pkgStaticWrapper: {},
  pkgCard: {
    width: 168, borderRadius: 18, borderWidth: 1.5, borderColor: DIVIDER,
    backgroundColor: CARD_BG, padding: 14, gap: 4, alignItems: "center",
  },
  pkgBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 4, alignSelf: "center",
  },
  pkgBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  pkgDays:      { fontFamily: "Cairo_700Bold", fontSize: 36, color: TEXT, lineHeight: 44 },
  pkgDaysLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED, marginTop: -6 },
  pkgName:      { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: TEXT, marginTop: 4 },
  pkgPrice:     { fontFamily: "Cairo_700Bold", fontSize: 18, color: ACCENT, marginTop: 2 },
  pkgDivider:   { height: 1, backgroundColor: DIVIDER, width: "100%", marginVertical: 8 },
  pkgFeatureRow:{ flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  pkgFeature:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: SUB, textAlign: "right" },
  pkgSelectedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
  },
  pkgSelectedText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },

  bigCTA: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: EMERALD, borderRadius: 16, marginHorizontal: 14, marginBottom: 6,
    paddingVertical: 16, paddingHorizontal: 20, justifyContent: "center",
    elevation: 4,
    shadowColor: EMERALD, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10,
  },
  bigCTAText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", flex: 1, textAlign: "center" },

  stepCard: {
    flexDirection: "row-reverse", gap: 14,
    backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: DIVIDER,
    padding: 14, marginHorizontal: 14, marginBottom: 10,
  },
  stepNum: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: EMERALD + "20", borderWidth: 2, borderColor: EMERALD + "40",
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: EMERALD },
  stepTitle:   { fontFamily: "Cairo_700Bold", fontSize: 14, color: TEXT, textAlign: "right" },
  stepDesc:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED, textAlign: "right", marginTop: 3 },

  contactCard: {
    backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: DIVIDER,
    margin: 14, padding: 18, alignItems: "center", gap: 6,
  },
  contactTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: TEXT },
  contactSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED },
  contactBtns:  { flexDirection: "row", gap: 10, marginTop: 8 },
  waBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#25D366", borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 11,
  },
  waBtnText:  { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  callBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: EMERALD + "18", borderRadius: 12, borderWidth: 1.5, borderColor: EMERALD + "40",
    paddingHorizontal: 18, paddingVertical: 11,
  },
  callBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: EMERALD },

  // My Requests Tab
  mineContent: { paddingHorizontal: 0, gap: 12, paddingTop: 16, paddingBottom: 80 },
  phoneSearchCard: {
    backgroundColor: CARD_BG, borderRadius: 18, borderWidth: 1, borderColor: DIVIDER,
    margin: 16, padding: 20, alignItems: "center", gap: 8,
  },
  phoneSearchTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: TEXT },
  phoneSearchSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED, textAlign: "center" },
  phoneRow: { flexDirection: "row", gap: 8, width: "100%", marginTop: 6 },
  phoneInput: {
    flex: 1, backgroundColor: BG, borderRadius: 12,
    borderWidth: 1, borderColor: DIVIDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: TEXT,
  },
  phoneSearchBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: EMERALD,
    justifyContent: "center", alignItems: "center",
  },
  resultsCount: {
    fontFamily: "Cairo_700Bold", fontSize: 14, color: TEXT,
    paddingHorizontal: 16, textAlign: "right",
  },
  noResultsCard: {
    alignItems: "center", backgroundColor: CARD_BG, borderRadius: 16,
    borderWidth: 1, borderColor: DIVIDER, marginHorizontal: 16,
    padding: 28, gap: 8,
  },
  noResultsText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: TEXT },
  noResultsSub:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED, textAlign: "center" },

  // Modal
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: CARD_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "92%",
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: DIVIDER,
    borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: TEXT },
  stepBadge: {
    backgroundColor: EMERALD + "20", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stepBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: EMERALD },

  // Step progress indicator
  stepProgress: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "center", paddingHorizontal: 18, paddingVertical: 12, gap: 0,
  },
  stepItem:      { flexDirection: "row-reverse", alignItems: "center", gap: 0 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: BG, borderWidth: 2, borderColor: DIVIDER,
    justifyContent: "center", alignItems: "center",
  },
  stepDotDone:   { backgroundColor: EMERALD, borderColor: EMERALD },
  stepDotActive: { borderColor: EMERALD },
  stepDotNum:    { fontFamily: "Cairo_700Bold", fontSize: 10, color: MUTED },
  stepLbl:       { fontFamily: "Cairo_400Regular", fontSize: 10, color: MUTED, marginHorizontal: 4 },
  stepLblActive: { color: EMERALD, fontFamily: "Cairo_700Bold" },
  stepLine:      { width: 22, height: 2, backgroundColor: DIVIDER },
  stepLineDone:  { backgroundColor: EMERALD },

  formPad:   { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20, gap: 6 },
  stepHeading:    { fontFamily: "Cairo_700Bold", fontSize: 18, color: TEXT, textAlign: "right", marginBottom: 2 },
  stepSubheading: { fontFamily: "Cairo_400Regular", fontSize: 13, color: MUTED, textAlign: "right", marginBottom: 12 },

  // Image step
  imgPreviewWrap: { borderRadius: 16, overflow: "hidden", position: "relative", marginBottom: 12 },
  imgPreview:     { width: "100%", height: 190, borderRadius: 16 },
  imgRemoveBtn:   { position: "absolute", top: 8, left: 8 },
  imgPickerEmpty: {
    height: 170, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: DIVIDER,
    justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 12,
    backgroundColor: BG,
  },
  imgPickerText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: MUTED },
  imgPickerHint: { fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED },
  imgBtnsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  imgPickBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: EMERALD + "18", borderRadius: 14, borderWidth: 1.5, borderColor: EMERALD + "40",
    paddingVertical: 13,
  },
  imgPickBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: EMERALD },
  imgTipBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: ACCENT + "10", borderRadius: 12, borderWidth: 1, borderColor: ACCENT + "30",
    padding: 12, marginBottom: 16,
  },
  imgTipText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: SUB, textAlign: "right", lineHeight: 20 },

  // Form fields
  formField: { marginBottom: 12 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: SUB, textAlign: "right", marginBottom: 6 },
  formInput: {
    backgroundColor: BG, borderRadius: 12,
    borderWidth: 1, borderColor: DIVIDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: TEXT,
  },
  formTextArea: { height: 90, textAlignVertical: "top" },

  // Type selector
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 10, borderWidth: 1.5, borderColor: DIVIDER,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: MUTED },

  // Cost card
  costCard: {
    backgroundColor: EMERALD + "0C", borderRadius: 14,
    borderWidth: 1, borderColor: EMERALD + "25",
    padding: 14, gap: 4, marginBottom: 14,
  },
  costRow:      { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  costLabel:    { fontFamily: "Cairo_700Bold", fontSize: 14, color: TEXT },
  costAmount:   { fontFamily: "Cairo_700Bold", fontSize: 22, color: EMERALD },
  costBreakdown:{ fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED, textAlign: "right" },
  costNote:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED, textAlign: "right", lineHeight: 18 },

  // Upload progress
  uploadBar: {
    height: 28, backgroundColor: BG, borderRadius: 8,
    overflow: "hidden", position: "relative", marginBottom: 12,
  },
  uploadBarFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: EMERALD },
  uploadBarText: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    textAlign: "center", textAlignVertical: "center",
    fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff",
  },

  // Navigation buttons
  navRow:   { flexDirection: "row-reverse", gap: 10, marginTop: 10 },
  nextBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: EMERALD, borderRadius: 14, paddingVertical: 14,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  skipBtn:  { alignItems: "center", paddingVertical: 8 },
  skipBtnText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: MUTED },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: BG, borderRadius: 14, borderWidth: 1, borderColor: DIVIDER,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: MUTED },
  submitBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: EMERALD, borderRadius: 14, paddingVertical: 14,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Success Sheet
  successIconWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  successIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "#27AE6018", justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "#27AE6030",
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: TEXT, textAlign: "center", paddingHorizontal: 24 },
  successSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: MUTED, textAlign: "center", paddingHorizontal: 24, lineHeight: 22 },
  bankBox: {
    backgroundColor: ACCENT + "10", borderRadius: 14, borderWidth: 1, borderColor: ACCENT + "30",
    marginHorizontal: 16, padding: 14, gap: 6,
  },
  bankBoxHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  bankBoxTitle:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT },
  bankBoxText:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: TEXT, textAlign: "right", lineHeight: 22 },
  nextStepsBox: {
    backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: DIVIDER,
    marginHorizontal: 16, padding: 14, gap: 10,
  },
  nextStepsTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: TEXT, textAlign: "right", marginBottom: 4 },
  nextStepRow:    { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  nextStepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: EMERALD + "20", justifyContent: "center", alignItems: "center",
  },
  nextStepNumText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: EMERALD },
  nextStepText:    { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: SUB, textAlign: "right" },
  successCloseBtn: {
    backgroundColor: EMERALD, borderRadius: 16, marginHorizontal: 16,
    paddingVertical: 15, alignItems: "center",
  },
  successCloseBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
