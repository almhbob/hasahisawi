import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Pressable, Alert, Platform,
  Image, ActivityIndicator,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
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

// ─── Types ─────────────────────────────────────────────────────

type AdType = "promotion" | "announcement" | "event" | "surprise" | "banner";

type Ad = {
  id: number;
  institution_name: string;
  title: string;
  description?: string;
  type: AdType;
  target_screen: string;
  start_date?: string;
  end_date?: string;
  priority: number;
  created_at: string;
  image_url?: string;
  website_url?: string;
};

type AdsSettings = {
  ad_price_per_day?: string;
  ad_contact_phone?: string;
  ad_contact_whatsapp?: string;
  ad_promo_text?: string;
  ad_partner_email?: string;
  ad_bank_info?: string;
};

// ─── Config ─────────────────────────────────────────────────────

const AD_TYPES: Record<AdType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  promotion:    { label: "عرض خاص",    icon: "pricetag",           color: "#E67E22", bg: "#E67E2215" },
  announcement: { label: "إعلان",      icon: "megaphone",          color: Colors.primary, bg: Colors.primary + "15" },
  event:        { label: "فعالية",     icon: "calendar",           color: Colors.cyber,   bg: Colors.cyber + "15"   },
  surprise:     { label: "مفاجأة",     icon: "gift",               color: "#9B59B6",      bg: "#9B59B615"           },
  banner:       { label: "إعلان عام",  icon: "information-circle", color: "#2980B9",      bg: "#2980B915"           },
};

const DURATION_OPTIONS = [
  { days: 7,  label: "أسبوع" },
  { days: 14, label: "أسبوعان" },
  { days: 30, label: "شهر" },
  { days: 60, label: "شهران" },
];

// ─── Helpers ────────────────────────────────────────────────────

function daysLeft(endDate?: string) {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.ceil(diff / 864e5);
  if (days <= 0) return "منتهي";
  if (days === 1) return "ينتهي غداً";
  return `${days} أيام متبقية`;
}

// ─── Promotional Partner Banner ──────────────────────────────────

function PartnerBanner({ pricePerDay, onPress }: { pricePerDay: number; onPress: () => void }) {
  const { isRTL } = useLang();
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.partnerBanner}>
      {/* Decorative gradient overlay */}
      <View style={styles.partnerBannerAccent} />
      <View style={[styles.partnerBannerContent, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <View style={[styles.partnerBadgeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={styles.partnerBadge}>
            <Ionicons name="star" size={11} color={Colors.accent} />
            <Text style={styles.partnerBadgeText}>شريك الإعلانات</Text>
          </View>
        </View>
        <Text style={[styles.partnerTitle, { textAlign: isRTL ? "right" : "left" }]}>
          أوصل رسالتك لأهل الحصاحيصا
        </Text>
        <Text style={[styles.partnerSub, { textAlign: isRTL ? "right" : "left" }]}>
          آلاف المستخدمين من أبناء المدينة يومياً
          {"\n"}إعلانات مستهدفة · مراجعة فورية · أسعار مناسبة
        </Text>
        <View style={[styles.partnerStats, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {[
            { icon: "people", label: "مستخدم نشط", value: "5,000+" },
            { icon: "cash",   label: "جنيه / يوم",  value: `${pricePerDay.toLocaleString()}` },
            { icon: "flash",  label: "ساعة موافقة", value: "24" },
          ].map((s, i) => (
            <View key={i} style={[styles.partnerStat, { alignItems: "center" }]}>
              <Ionicons name={s.icon as any} size={16} color={Colors.accent} />
              <Text style={styles.partnerStatVal}>{s.value}</Text>
              <Text style={styles.partnerStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.partnerCTA, { flexDirection: isRTL ? "row-reverse" : "row" }]}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <Ionicons name="megaphone" size={16} color="#fff" />
          <Text style={styles.partnerCTAText}>أعلن معنا الآن</Text>
          <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Ad Card Component ───────────────────────────────────────────

function AdCard({ ad, index }: { ad: Ad; index: number }) {
  const { isRTL } = useLang();
  const meta = AD_TYPES[ad.type] ?? AD_TYPES.announcement;
  const remaining = daysLeft(ad.end_date);

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)}>
      <View style={[styles.adCard, { borderLeftColor: meta.color, borderLeftWidth: 4 }]}>
        {/* Ad Image */}
        {ad.image_url ? (
          <Image
            source={{ uri: ad.image_url }}
            style={styles.adImage}
            resizeMode="cover"
          />
        ) : null}

        {/* Header */}
        <View style={[styles.adCardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.adTypeIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
            <View style={[styles.adTypeBadge, { backgroundColor: meta.bg, flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={[styles.adTypeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={[styles.adInstitution, { textAlign: isRTL ? "right" : "left" }]}>
              {ad.institution_name}
            </Text>
          </View>
          {remaining && (
            <View style={styles.remainingBadge}>
              <Text style={styles.remainingText}>{remaining}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <Text style={[styles.adTitle, { textAlign: isRTL ? "right" : "left" }]}>{ad.title}</Text>
        {ad.description ? (
          <Text style={[styles.adDesc, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={3}>
            {ad.description}
          </Text>
        ) : null}

        {/* Footer */}
        <View style={[styles.adFooter, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={[styles.sponsoredTag, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Ionicons name="star-half" size={11} color={Colors.accent} />
            <Text style={styles.sponsoredText}>إعلان مدفوع · تحت إشراف الإدارة</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Submit Ad Request Modal ────────────────────────────────────

function AdRequestModal({
  visible, onClose, onSuccess, pricePerDay,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pricePerDay: number;
}) {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [institutionName, setInstitutionName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adType, setAdType] = useState<AdType>("promotion");
  const [durationDays, setDurationDays] = useState(7);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const estimatedCost = durationDays * pricePerDay;

  const reset = () => {
    setStep(1); setInstitutionName(""); setContactName("");
    setContactPhone(""); setWebsiteUrl(""); setTitle(""); setDescription("");
    setAdType("promotion"); setDurationDays(7);
    setImageUri(null); setUploadProgress(null);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الصور من إعدادات الجهاز");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSend = async () => {
    if (!institutionName.trim() || !contactPhone.trim() || !title.trim()) {
      Alert.alert("حقول مطلوبة", "يرجى ملء اسم المؤسسة والعنوان والهاتف");
      return;
    }
    setSending(true);
    try {
      let uploadedImageUrl: string | undefined;

      if (imageUri) {
        setUploadProgress(0);
        try {
          uploadedImageUrl = await uploadAdImage(imageUri, (p) => {
            setUploadProgress(p.percent);
          });
        } catch {
          Alert.alert("خطأ في رفع الصورة", "سيتم إرسال الطلب بدون صورة");
        }
        setUploadProgress(null);
      }

      const res = await fetch(`${getApiUrl()}/api/ads/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_name: institutionName.trim(),
          contact_name: contactName.trim(),
          contact_phone: contactPhone.trim(),
          title: title.trim(),
          description: description.trim(),
          type: adType,
          duration_days: durationDays,
          budget: `${estimatedCost} جنيه`,
          image_url: uploadedImageUrl,
          website_url: websiteUrl.trim() || undefined,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        reset();
        onClose();
        onSuccess();
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "حدث خطأ، حاول مرة أخرى");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={[styles.sheetHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>طلب مساحة إعلانية</Text>
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>{step}/2</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              {step === 1 ? (
                <>
                  <Text style={[styles.formSection, { textAlign: isRTL ? "right" : "left" }]}>بيانات المؤسسة</Text>

                  {[
                    { label: "اسم المؤسسة *", value: institutionName, set: setInstitutionName, placeholder: "مدرسة / متجر / شركة..." },
                    { label: "اسم المسؤول", value: contactName, set: setContactName, placeholder: "اسم الشخص المسؤول" },
                    { label: "رقم التواصل *", value: contactPhone, set: setContactPhone, placeholder: "+249...", numeric: true },
                    { label: "الموقع الإلكتروني", value: websiteUrl, set: setWebsiteUrl, placeholder: "https://..." },
                  ].map((f, i) => (
                    <View key={i} style={styles.formField}>
                      <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{f.label}</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder={f.placeholder}
                        placeholderTextColor={Colors.textMuted}
                        value={f.value}
                        onChangeText={f.set}
                        keyboardType={(f as any).numeric ? "phone-pad" : "default"}
                        textAlign={isRTL ? "right" : "left"}
                        autoCapitalize="none"
                      />
                    </View>
                  ))}

                  {/* Image Picker */}
                  <View style={styles.formField}>
                    <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>
                      صورة الإعلان (اختياري)
                    </Text>
                    <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
                      {imageUri ? (
                        <>
                          <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                          <View style={styles.imageOverlay}>
                            <Ionicons name="camera" size={22} color="#fff" />
                            <Text style={styles.imageOverlayText}>تغيير الصورة</Text>
                          </View>
                        </>
                      ) : (
                        <View style={styles.imagePickerEmpty}>
                          <Ionicons name="image-outline" size={36} color={Colors.textMuted} />
                          <Text style={styles.imagePickerText}>اضغط لاختيار صورة للإعلان</Text>
                          <Text style={styles.imagePickerHint}>نسبة 16:9 · JPG / PNG</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    {imageUri && (
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => setImageUri(null)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#E05567" />
                        <Text style={styles.removeImageText}>إزالة الصورة</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.nextBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                    onPress={() => {
                      if (!institutionName.trim() || !contactPhone.trim()) {
                        Alert.alert("مطلوب", "أدخل اسم المؤسسة ورقم التواصل");
                        return;
                      }
                      setStep(2);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.nextBtnText}>التالي</Text>
                    <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.formSection, { textAlign: isRTL ? "right" : "left" }]}>تفاصيل الإعلان</Text>

                  {/* نوع الإعلان */}
                  <View style={styles.formField}>
                    <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>نوع الإعلان</Text>
                    <View style={[styles.typeGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      {(Object.entries(AD_TYPES) as [AdType, typeof AD_TYPES[AdType]][]).map(([key, meta]) => (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.typeBtn,
                            adType === key && { backgroundColor: meta.color, borderColor: meta.color },
                          ]}
                          onPress={() => setAdType(key)}
                        >
                          <Ionicons name={meta.icon} size={14} color={adType === key ? "#fff" : Colors.textSecondary} />
                          <Text style={[styles.typeBtnText, adType === key && { color: "#fff" }]}>{meta.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* عنوان ووصف */}
                  {[
                    { label: "عنوان الإعلان *", value: title, set: setTitle, placeholder: "ما الذي تريد الإعلان عنه؟" },
                    { label: "تفاصيل الإعلان", value: description, set: setDescription, placeholder: "عروض، أسعار، شروط...", multi: true },
                  ].map((f, i) => (
                    <View key={i} style={styles.formField}>
                      <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>{f.label}</Text>
                      <TextInput
                        style={[styles.formInput, (f as any).multi && styles.formTextArea]}
                        placeholder={f.placeholder}
                        placeholderTextColor={Colors.textMuted}
                        value={f.value}
                        onChangeText={f.set}
                        multiline={(f as any).multi}
                        textAlign={isRTL ? "right" : "left"}
                        textAlignVertical={(f as any).multi ? "top" : undefined}
                      />
                    </View>
                  ))}

                  {/* مدة النشر */}
                  <View style={styles.formField}>
                    <Text style={[styles.formLabel, { textAlign: isRTL ? "right" : "left" }]}>مدة النشر</Text>
                    <View style={[styles.durationRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      {DURATION_OPTIONS.map(d => (
                        <TouchableOpacity
                          key={d.days}
                          style={[styles.durationBtn, durationDays === d.days && styles.durationBtnActive]}
                          onPress={() => setDurationDays(d.days)}
                        >
                          <Text style={[styles.durationDays, durationDays === d.days && { color: "#fff" }]}>{d.days}</Text>
                          <Text style={[styles.durationLabel, durationDays === d.days && { color: "#fff" }]}>{d.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* تقدير التكلفة */}
                  <View style={styles.costCard}>
                    <View style={[styles.costRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                      <Ionicons name="cash-outline" size={18} color={Colors.accent} />
                      <Text style={styles.costLabel}>التكلفة التقديرية</Text>
                    </View>
                    <Text style={styles.costAmount}>{estimatedCost.toLocaleString()} جنيه</Text>
                    <Text style={styles.costNote}>
                      {durationDays} يوم × {pricePerDay.toLocaleString()} جنيه/يوم
                      {"\n"}السعر قابل للتفاوض — الإدارة ستتواصل معك للتأكيد
                    </Text>
                  </View>

                  {/* Progress bar during upload */}
                  {uploadProgress !== null && (
                    <View style={styles.uploadBar}>
                      <View style={[styles.uploadBarFill, { width: `${uploadProgress}%` as any }]} />
                      <Text style={styles.uploadBarText}>جاري رفع الصورة... {uploadProgress}%</Text>
                    </View>
                  )}

                  <View style={[styles.formBtnsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                      <Text style={styles.backBtnText}>رجوع</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.submitBtn, { flexDirection: isRTL ? "row-reverse" : "row", opacity: sending ? 0.7 : 1 }]}
                      onPress={handleSend}
                      disabled={sending}
                      activeOpacity={0.85}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={16} color="#fff" />
                      )}
                      <Text style={styles.submitBtnText}>{sending ? "جاري الإرسال..." : "إرسال الطلب"}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────

export default function AdsScreen() {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<AdsSettings>({});

  const pricePerDay = parseInt(settings.ad_price_per_day ?? "500") || 500;

  const loadData = useCallback(async () => {
    try {
      const [adsRes, settingsRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/ads`),
        fetch(`${getApiUrl()}/api/ads/settings`),
      ]);
      if (adsRes.ok) setAds(await adsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View style={[styles.headerInner, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1, alignItems: isRTL ? "flex-end" : "flex-start" }}>
            <Text style={styles.headerTitle}>الإعلانات والعروض</Text>
            <Text style={styles.headerSub}>إعلانات مؤسسات الحصاحيصا · تحت إشراف الإدارة</Text>
          </View>
          <AnimatedPress
            style={[styles.addBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>أعلن معنا</Text>
          </AnimatedPress>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Promotional Partner Banner */}
              <PartnerBanner pricePerDay={pricePerDay} onPress={() => setShowModal(true)} />

              {/* Trust Banner */}
              <Animated.View entering={FadeIn.duration(400)} style={styles.infoBanner}>
                <View style={[styles.infoBannerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
                  <Text style={[styles.infoBannerText, { textAlign: isRTL ? "right" : "left" }]}>
                    جميع الإعلانات مراجعة ومعتمدة من إدارة التطبيق قبل نشرها
                  </Text>
                </View>
              </Animated.View>

              {ads.length > 0 && (
                <Text style={[styles.sectionLabel, { textAlign: isRTL ? "right" : "left" }]}>
                  الإعلانات النشطة
                </Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="megaphone-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد إعلانات نشطة حالياً</Text>
              <Text style={styles.emptySub}>كن أول من يُعلن في مجتمع الحصاحيصا</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)}>
                <Text style={styles.emptyBtnText}>أعلن الآن</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            ads.length > 0 ? (
              <View style={styles.footerPromo}>
                <Text style={styles.footerPromoTitle}>أعلن في تطبيق حصاحيصاوي</Text>
                <Text style={styles.footerPromoSub}>
                  وصول مباشر لأهل الحصاحيصا · مراجعة فورية من الإدارة
                  {"\n"}أسعار مناسبة تبدأ من {pricePerDay.toLocaleString()} جنيه/يوم
                </Text>
                <TouchableOpacity
                  style={[styles.footerPromoBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  onPress={() => setShowModal(true)}
                >
                  <Ionicons name="send-outline" size={15} color="#fff" />
                  <Text style={styles.footerPromoBtnText}>أرسل طلب إعلان</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => <AdCard ad={item} index={index} />}
        />
      )}

      <AdRequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        pricePerDay={pricePerDay}
        onSuccess={() => {
          Alert.alert(
            "✅ تم الإرسال",
            "تم استلام طلبك بنجاح. ستتواصل معك الإدارة خلال 24 ساعة للتأكيد وإتمام الدفع.",
            [{ text: "حسناً" }]
          );
          loadData();
        }}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerInner: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    alignItems: "center", gap: 6,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff" },

  // Partner Banner
  partnerBanner: {
    marginHorizontal: 14, marginTop: 14, marginBottom: 4,
    backgroundColor: "#0D2318",
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  partnerBannerAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 4,
    backgroundColor: Colors.accent,
  },
  partnerBannerContent: { padding: 18, paddingTop: 22, gap: 12 },
  partnerBadgeRow: { gap: 8 },
  partnerBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.accent + "20", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start",
  },
  partnerBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accent },
  partnerTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, lineHeight: 30,
  },
  partnerSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22,
  },
  partnerStats: {
    gap: 0,
    backgroundColor: Colors.primary + "12",
    borderRadius: 14, padding: 12, justifyContent: "space-around",
  },
  partnerStat: { flex: 1, gap: 2 },
  partnerStatVal: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  partnerStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  partnerCTA: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 20,
    alignItems: "center", gap: 8, alignSelf: "stretch", justifyContent: "center",
  },
  partnerCTAText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", flex: 1, textAlign: "center" },

  // Info banner
  infoBanner: {
    backgroundColor: Colors.primary + "0F",
    borderBottomWidth: 1, borderBottomColor: Colors.primary + "25",
    paddingHorizontal: 16, paddingVertical: 9,
    marginTop: 10,
  },
  infoBannerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  infoBannerText: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary,
  },

  sectionLabel: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4,
  },

  // List
  list: { gap: 12 },

  // Loading
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Ad Card
  adCard: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    marginHorizontal: 14,
  },
  adImage: { width: "100%", height: 160 },
  adCardHeader: { padding: 14, paddingBottom: 6, flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  adTypeIcon: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  adTypeBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start",
  },
  adTypeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  adInstitution: {
    fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary,
    marginTop: 3,
  },
  remainingBadge: {
    backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  remainingText: { fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.textMuted },
  adTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, lineHeight: 24, paddingHorizontal: 14 },
  adDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, lineHeight: 20, paddingHorizontal: 14, paddingTop: 4,
  },
  adFooter: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8 },
  sponsoredTag: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.accent + "15", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  sponsoredText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.accent },

  // Empty
  emptyContainer: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 10 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  emptyBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Footer Promo
  footerPromo: {
    margin: 14, padding: 20, backgroundColor: Colors.cardBg,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.divider,
    alignItems: "center", gap: 8,
  },
  footerPromoTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  footerPromoSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  footerPromoBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 4,
  },
  footerPromoBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },

  // Modal / Sheet
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "92%", paddingTop: 8,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider,
    alignSelf: "center", marginBottom: 8,
  },
  sheetHeader: {
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    alignItems: "center", gap: 10,
  },
  sheetTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  stepBadge: {
    backgroundColor: Colors.primary + "20", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stepText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary },

  // Form
  form: { padding: 20, gap: 4 },
  formSection: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary,
    marginBottom: 8, marginTop: 4,
  },
  formField: { marginBottom: 14, gap: 6 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  formInput: {
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
  },
  formTextArea: { minHeight: 80, paddingTop: 12 },

  // Image Picker
  imagePicker: {
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider,
    borderStyle: "dashed", overflow: "hidden", minHeight: 130,
    backgroundColor: Colors.bg,
  },
  imagePreview: { width: "100%", height: 160 },
  imageOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 8,
    alignItems: "center", gap: 4, flexDirection: "row", justifyContent: "center",
  },
  imageOverlayText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  imagePickerEmpty: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 28 },
  imagePickerText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  imagePickerHint: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  removeImageBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-end", marginTop: 6,
  },
  removeImageText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#E05567" },

  // Upload bar
  uploadBar: {
    backgroundColor: Colors.bg, borderRadius: 10, overflow: "hidden",
    height: 28, justifyContent: "center", borderWidth: 1, borderColor: Colors.divider,
    marginBottom: 8, position: "relative",
  },
  uploadBarFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: Colors.primary + "40",
  },
  uploadBarText: {
    fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textPrimary,
    textAlign: "center", position: "relative",
  },

  // Type grid
  typeGrid: { flexWrap: "wrap", gap: 8 },
  typeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderColor: Colors.divider, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: Colors.bg,
  },
  typeBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },

  // Duration
  durationRow: { gap: 8, flexWrap: "wrap" },
  durationBtn: {
    flex: 1, minWidth: 70, borderWidth: 1, borderColor: Colors.divider,
    borderRadius: 12, paddingVertical: 10, alignItems: "center",
    backgroundColor: Colors.bg,
  },
  durationBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationDays: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  durationLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // Cost Card
  costCard: {
    backgroundColor: Colors.accent + "12", borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent + "30",
    padding: 14, gap: 4, marginBottom: 8,
  },
  costRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  costLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  costAmount: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.accent },
  costNote: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    lineHeight: 18, textAlign: "right",
  },

  // Form buttons
  formBtnsRow: { gap: 10, marginTop: 4 },
  backBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.divider,
    borderRadius: 14, paddingVertical: 13, alignItems: "center",
  },
  backBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  submitBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: "center", justifyContent: "center", gap: 8,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  nextBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 8,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
