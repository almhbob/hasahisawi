import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Pressable, Alert, Platform,
  Linking,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { getApiUrl } from "@/lib/query-client";
import AnimatedPress from "@/components/AnimatedPress";

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
};

// ─── Config ─────────────────────────────────────────────────────

const AD_TYPES: Record<AdType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  promotion:    { label: "عرض خاص",   icon: "pricetag",         color: "#E67E22", bg: "#E67E2215" },
  announcement: { label: "إعلان",     icon: "megaphone",        color: Colors.primary, bg: Colors.primary + "15" },
  event:        { label: "فعالية",    icon: "calendar",         color: Colors.cyber,   bg: Colors.cyber + "15"   },
  surprise:     { label: "مفاجأة",    icon: "gift",             color: "#9B59B6",      bg: "#9B59B615"           },
  banner:       { label: "إعلان عام", icon: "information-circle", color: "#2980B9",   bg: "#2980B915"           },
};

const DURATION_OPTIONS = [
  { days: 7,  label: "أسبوع" },
  { days: 14, label: "أسبوعان" },
  { days: 30, label: "شهر" },
  { days: 60, label: "شهران" },
];

const PRICE_PER_DAY = 500; // جنيه سوداني

// ─── Helpers ────────────────────────────────────────────────────

function daysLeft(endDate?: string) {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.ceil(diff / 864e5);
  if (days <= 0) return "منتهي";
  if (days === 1) return "ينتهي غداً";
  return `${days} أيام متبقية`;
}

// ─── Ad Card Component ───────────────────────────────────────────

function AdCard({ ad, index }: { ad: Ad; index: number }) {
  const { isRTL } = useLang();
  const meta = AD_TYPES[ad.type] ?? AD_TYPES.announcement;
  const remaining = daysLeft(ad.end_date);

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify().damping(18)}>
      <View style={[styles.adCard, { borderLeftColor: meta.color, borderLeftWidth: 4 }]}>
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

        {/* Sponsored label */}
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
  visible, onClose, onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { isRTL } = useLang();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [institutionName, setInstitutionName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [adType, setAdType] = useState<AdType>("promotion");
  const [durationDays, setDurationDays] = useState(7);
  const [sending, setSending] = useState(false);

  const estimatedCost = durationDays * PRICE_PER_DAY;

  const reset = () => {
    setStep(1); setInstitutionName(""); setContactName("");
    setContactPhone(""); setTitle(""); setDescription("");
    setAdType("promotion"); setDurationDays(7);
  };

  const handleSend = async () => {
    if (!institutionName.trim() || !contactPhone.trim() || !title.trim()) {
      Alert.alert("حقول مطلوبة", "يرجى ملء اسم المؤسسة والعنوان والهاتف");
      return;
    }
    setSending(true);
    try {
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
            <View style={[styles.stepBadge]}>
              <Text style={styles.stepText}>{step}/2</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              {step === 1 ? (
                <>
                  {/* Step 1 — بيانات المؤسسة */}
                  <Text style={styles.formSection}>بيانات المؤسسة</Text>

                  {[
                    { label: "اسم المؤسسة *", value: institutionName, set: setInstitutionName, placeholder: "مدرسة / متجر / شركة..." },
                    { label: "اسم المسؤول", value: contactName, set: setContactName, placeholder: "اسم الشخص المسؤول" },
                    { label: "رقم التواصل *", value: contactPhone, set: setContactPhone, placeholder: "+249...", numeric: true },
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
                      />
                    </View>
                  ))}

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
                  {/* Step 2 — تفاصيل الإعلان */}
                  <Text style={styles.formSection}>تفاصيل الإعلان</Text>

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

                  {/* عنوان ووصف الإعلان */}
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
                      {durationDays} يوم × {PRICE_PER_DAY.toLocaleString()} جنيه/يوم
                      {"\n"}السعر قابل للتفاوض — الإدارة ستتواصل معك للتأكيد
                    </Text>
                  </View>

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
                      <Ionicons name="send" size={16} color="#fff" />
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

  const loadAds = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/ads`);
      if (res.ok) setAds(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAds(); }, []);
  useFocusEffect(useCallback(() => { loadAds(); }, [loadAds]));

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

      {/* Info Banner */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.infoBanner}>
        <View style={[styles.infoBannerRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
          <Text style={[styles.infoBannerText, { textAlign: isRTL ? "right" : "left" }]}>
            جميع الإعلانات مراجعة ومعتمدة من إدارة التطبيق قبل نشرها
          </Text>
        </View>
      </Animated.View>

      {/* Ads List */}
      {loading ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="loading" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>جاري التحميل...</Text>
        </View>
      ) : ads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="megaphone-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyText}>لا توجد إعلانات نشطة حالياً</Text>
          <Text style={styles.emptySub}>كن أول من يُعلن في مجتمع الحصاحيصا</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.emptyBtnText}>أعلن الآن</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={styles.footerPromo}>
              <Text style={styles.footerPromoTitle}>أعلن في تطبيق حصاحيصاوي</Text>
              <Text style={styles.footerPromoSub}>
                وصول مباشر لأهل الحصاحيصا · مراجعة فورية من الإدارة
                {"\n"}أسعار مناسبة تبدأ من {PRICE_PER_DAY.toLocaleString()} جنيه/يوم
              </Text>
              <TouchableOpacity style={styles.footerPromoBtn} onPress={() => setShowModal(true)}>
                <Ionicons name="send-outline" size={15} color="#fff" />
                <Text style={styles.footerPromoBtnText}>أرسل طلب إعلان</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item, index }) => <AdCard ad={item} index={index} />}
        />
      )}

      <AdRequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          Alert.alert(
            "✅ تم الإرسال",
            "تم استلام طلبك بنجاح. ستتواصل معك الإدارة خلال 24 ساعة للتأكيد وإتمام الدفع.",
            [{ text: "حسناً" }]
          );
          loadAds();
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
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2, textAlign: "right" },
  addBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff" },

  // Info banner
  infoBanner: {
    backgroundColor: Colors.primary + "0F",
    borderBottomWidth: 1, borderBottomColor: Colors.primary + "25",
    paddingHorizontal: 16, paddingVertical: 9,
  },
  infoBannerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  infoBannerText: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary,
    textAlign: "right",
  },

  // List
  list: { padding: 14, gap: 12 },

  // Ad Card
  adCard: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    padding: 14, gap: 10,
  },
  adCardHeader: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
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
    marginTop: 3, textAlign: "right",
  },
  remainingBadge: {
    backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start",
  },
  remainingText: { fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.textMuted },
  adTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", lineHeight: 24 },
  adDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, textAlign: "right", lineHeight: 20,
  },
  adFooter: { flexDirection: "row-reverse", alignItems: "center" },
  sponsoredTag: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.accent + "12", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sponsoredText: { fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.accent },

  // Empty
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textSecondary, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  emptyBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Footer promo
  footerPromo: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.accent + "30",
    padding: 16, marginTop: 8, gap: 8, alignItems: "center",
  },
  footerPromoTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.accent, textAlign: "center" },
  footerPromoSub: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 18,
  },
  footerPromoBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 4,
  },
  footerPromoBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "95%",
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  stepBadge: {
    backgroundColor: Colors.accent + "20", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stepText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.accent },
  form: { padding: 16, gap: 14 },
  formSection: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary,
    textAlign: "right", borderRightWidth: 3, borderRightColor: Colors.accent,
    paddingRight: 10, marginBottom: 4,
  },
  formField: { gap: 6 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  formInput: {
    backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider,
  },
  formTextArea: { minHeight: 90, lineHeight: 22 },
  typeGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  typeBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  typeBtnText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  durationRow: { flexDirection: "row-reverse", gap: 8 },
  durationBtn: {
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  durationBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  durationDays: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  durationLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  costCard: {
    backgroundColor: Colors.accent + "10", borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent + "30",
    padding: 14, gap: 6,
  },
  costRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  costLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.accent },
  costAmount: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.accent, textAlign: "right" },
  costNote: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary,
    textAlign: "right", lineHeight: 17,
  },
  nextBtn: {
    backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 15,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 4,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  formBtnsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  backBtn: {
    flex: 0.4, backgroundColor: Colors.divider, borderRadius: 14,
    paddingVertical: 15, alignItems: "center",
  },
  backBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary },
  submitBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
