import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Linking, Modal, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl } from "@/lib/query-client";

type OrgType =
  | "hospital" | "university" | "ngo" | "government"
  | "company" | "media" | "supplier" | "research" | "other";

type Partner = {
  id: number;
  org_name: string;
  org_type: OrgType;
  sector: string;
  city: string;
  country: string;
  website: string;
  logo_url: string;
  cooperation_scope: string;
  description: string;
  services_offered: string[];
  target_audience: string;
  is_featured: boolean;
};

const TYPE_CONFIG: Record<OrgType, { label: string; icon: string; color: string; emoji: string }> = {
  hospital:    { label: "مستشفى / مركز طبي", icon: "hospital-building",  color: "#EF4444", emoji: "🏥" },
  university:  { label: "جامعة / أكاديمية",  icon: "school",             color: "#3B82F6", emoji: "🎓" },
  ngo:         { label: "منظمة / جمعية",     icon: "hand-heart",         color: "#10B981", emoji: "🤝" },
  government:  { label: "جهة حكومية",       icon: "city-variant",       color: "#6366F1", emoji: "🏛️" },
  company:     { label: "شركة / قطاع خاص",  icon: "office-building",    color: "#8B5CF6", emoji: "🏢" },
  media:       { label: "وسيلة إعلامية",     icon: "broadcast",          color: "#F59E0B", emoji: "📡" },
  supplier:    { label: "مورّد / تجاري",     icon: "truck-delivery",     color: "#06B6D4", emoji: "🚛" },
  research:    { label: "مركز أبحاث",        icon: "microscope",         color: "#EC4899", emoji: "🔬" },
  other:       { label: "أخرى",              icon: "domain",             color: "#64748B", emoji: "✨" },
};

const TYPE_KEYS = Object.keys(TYPE_CONFIG) as OrgType[];

export default function ExternalPartnershipScreen() {
  const insets = useSafeAreaInsets();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrgType | "all">("all");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${getApiUrl()}/api/external-partnerships`);
      const j = await r.json();
      setPartners(Array.isArray(j.partnerships) ? j.partnerships : []);
    } catch { setPartners([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter === "all" ? partners : partners.filter(p => p.org_type === filter),
    [partners, filter]
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[Colors.primary, "#0E7B5C", "#0A5C44"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <View style={s.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>شراكات المؤسسات الخارجية</Text>
            <Text style={s.headerSubtitle}>تعاون احترافي مع المنظمات والمؤسسات من خارج المدينة</Text>
          </View>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="handshake" size={26} color="#fff" />
          </View>
        </View>

        <View style={s.statsRow}>
          {[
            { num: partners.length, label: "شريك مُعتمد", icon: "checkmark-circle" },
            { num: TYPE_KEYS.length, label: "قطاع متاح", icon: "apps" },
            { num: "48س", label: "زمن الرد", icon: "time" },
          ].map((st, i) => (
            <View key={i} style={s.statBox}>
              <Ionicons name={st.icon as any} size={16} color="#FFD700" />
              <Text style={s.statNum}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CTA — تقديم طلب ── */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <AnimatedPress onPress={() => { Haptics.selectionAsync(); setShowForm(true); }}>
            <LinearGradient
              colors={["#FFD700", "#F0C040", "#C9A84C"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.ctaCard}
            >
              <View style={s.ctaIconWrap}>
                <MaterialCommunityIcons name="file-document-edit" size={32} color="#000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.ctaTitle}>تقديم طلب تعاون جديد</Text>
                <Text style={s.ctaDesc}>املأ النموذج وسيتم التواصل معكم خلال 48 ساعة من فريق المنصة</Text>
              </View>
              <Ionicons name="arrow-back-circle" size={32} color="#000" />
            </LinearGradient>
          </AnimatedPress>
        </Animated.View>

        {/* ── لمن هذه المساحة؟ ── */}
        <Animated.View entering={FadeInDown.delay(100)} style={s.infoCard}>
          <View style={s.infoHeader}>
            <Ionicons name="information-circle" size={20} color={Colors.primary} />
            <Text style={s.infoTitle}>مَن يمكنه التقديم؟</Text>
          </View>
          <View style={s.infoGrid}>
            {TYPE_KEYS.map(k => {
              const cfg = TYPE_CONFIG[k];
              return (
                <View key={k} style={[s.infoChip, { borderColor: cfg.color + "40", backgroundColor: cfg.color + "10" }]}>
                  <Text style={s.infoChipEmoji}>{cfg.emoji}</Text>
                  <Text style={[s.infoChipText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* ── شركاؤنا المعتمدون ── */}
        <View style={s.sectionHeader}>
          <View style={s.sectionTitleRow}>
            <View style={s.sectionDot} />
            <Text style={s.sectionTitle}>شركاؤنا المعتمدون</Text>
          </View>
          <Text style={s.sectionCount}>{filtered.length}</Text>
        </View>

        {/* فلاتر */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
          <TouchableOpacity
            style={[s.filterChip, filter === "all" && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
            onPress={() => setFilter("all")}
          >
            <Text style={[s.filterChipText, filter === "all" && { color: "#000" }]}>الكل</Text>
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
                <Text style={s.filterChipEmoji}>{cfg.emoji}</Text>
                <Text style={[s.filterChipText, active && { color: "#fff" }]}>{cfg.label.split("/")[0].trim()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ marginTop: 16, gap: 14 }}>
          {loading && (
            <View style={s.emptyBox}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={s.emptyText}>جاري التحميل…</Text>
            </View>
          )}

          {!loading && filtered.length === 0 && (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="handshake-outline" size={56} color={Colors.textMuted} />
              <Text style={s.emptyText}>لا يوجد شركاء معتمدون في هذا القطاع بعد</Text>
              <Text style={s.emptyHint}>كن أول شريك — قدّم طلب التعاون الآن</Text>
            </View>
          )}

          {!loading && filtered.map((p, i) => {
            const cfg = TYPE_CONFIG[p.org_type] || TYPE_CONFIG.other;
            return (
              <Animated.View key={p.id} entering={FadeInDown.delay(i * 60).springify()}>
                <View style={[s.partnerCard, { borderColor: cfg.color + "40" }]}>
                  <LinearGradient colors={[cfg.color + "10", "transparent"]} style={StyleSheet.absoluteFill} />
                  {p.is_featured && (
                    <View style={s.featuredBadge}>
                      <Ionicons name="star" size={11} color="#000" />
                      <Text style={s.featuredText}>شريك مميز</Text>
                    </View>
                  )}

                  <View style={s.partnerHeader}>
                    <View style={[s.partnerIconCircle, { backgroundColor: cfg.color + "20", borderColor: cfg.color + "50" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={28} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.partnerName} numberOfLines={2}>{p.org_name}</Text>
                      <View style={[s.typeBadge, { backgroundColor: cfg.color + "20" }]}>
                        <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {(p.city || p.country) && (
                        <View style={s.locationRow}>
                          <Ionicons name="location" size={12} color={Colors.textMuted} />
                          <Text style={s.locationText}>{[p.city, p.country].filter(Boolean).join("، ")}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {p.description ? <Text style={s.partnerDesc}>{p.description}</Text> : null}

                  {p.cooperation_scope ? (
                    <View style={s.scopeBox}>
                      <Text style={s.scopeLabel}>🎯 نطاق التعاون</Text>
                      <Text style={s.scopeText}>{p.cooperation_scope}</Text>
                    </View>
                  ) : null}

                  {p.services_offered && p.services_offered.length > 0 && (
                    <View style={s.servicesWrap}>
                      {p.services_offered.map((srv, si) => (
                        <View key={si} style={[s.serviceChip, { backgroundColor: cfg.color + "12", borderColor: cfg.color + "30" }]}>
                          <Text style={[s.serviceChipText, { color: cfg.color }]}>{srv}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {p.website ? (
                    <TouchableOpacity
                      style={s.websiteBtn}
                      onPress={() => Linking.openURL(p.website.startsWith("http") ? p.website : `https://${p.website}`)}
                    >
                      <Ionicons name="globe-outline" size={16} color={Colors.primary} />
                      <Text style={s.websiteText} numberOfLines={1}>{p.website.replace(/^https?:\/\//, "")}</Text>
                      <Ionicons name="open-outline" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <ApplicationFormModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => { setShowForm(false); load(); }}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
// نموذج تقديم الطلب
// ════════════════════════════════════════════════════════════════
function ApplicationFormModal({
  visible, onClose, onSuccess,
}: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("ngo");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");

  // Step 2
  const [contactPerson, setContactPerson] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  // Step 3
  const [cooperationScope, setCooperationScope] = useState("");
  const [description, setDescription] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [targetAudience, setTargetAudience] = useState("");

  const reset = () => {
    setStep(1); setOrgName(""); setOrgType("ngo"); setSector("");
    setCity(""); setCountry(""); setWebsite("");
    setContactPerson(""); setContactRole(""); setEmail(""); setPhone(""); setWhatsapp("");
    setCooperationScope(""); setDescription(""); setServicesText(""); setTargetAudience("");
  };

  const handleClose = () => { reset(); onClose(); };

  const validateStep = (n: number): boolean => {
    if (n === 1) {
      if (!orgName.trim()) { Alert.alert("بيانات ناقصة", "اسم المؤسسة مطلوب"); return false; }
      return true;
    }
    if (n === 2) {
      if (!contactPerson.trim()) { Alert.alert("بيانات ناقصة", "اسم المسؤول عن التواصل مطلوب"); return false; }
      if (!email.trim() && !phone.trim() && !whatsapp.trim()) {
        Alert.alert("بيانات ناقصة", "يرجى إدخال وسيلة تواصل واحدة على الأقل");
        return false;
      }
      if (email.trim() && !email.includes("@")) {
        Alert.alert("بيانات غير صحيحة", "صيغة الإيميل غير صحيحة"); return false;
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
      const services = servicesText.split(/[,،\n]/).map(s => s.trim()).filter(Boolean);
      const r = await fetch(`${getApiUrl()}/api/external-partnerships/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName, org_type: orgType, sector, city, country, website,
          contact_person: contactPerson, contact_role: contactRole,
          email, phone, whatsapp,
          cooperation_scope: cooperationScope, description,
          services_offered: services, target_audience: targetAudience,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الإرسال");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("✅ تم استلام طلبكم", j.message || "سيتم مراجعة الطلب والرد خلال 48 ساعة", [
        { text: "حسناً", onPress: () => { reset(); onSuccess(); } }
      ]);
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "تعذر إرسال الطلب");
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: Colors.bg }}>
        {/* Modal Header */}
        <LinearGradient colors={[Colors.primary, "#0E7B5C"]} style={[m.header, { paddingTop: insets.top + 12 }]}>
          <View style={m.headerRow}>
            <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={m.headerTitle}>طلب تعاون</Text>
              <Text style={m.headerSubtitle}>الخطوة {step} من 3</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <View style={m.progressRow}>
            {[1, 2, 3].map(n => (
              <View key={n} style={[m.progressBar, { backgroundColor: n <= step ? "#FFD700" : "rgba(255,255,255,0.2)" }]} />
            ))}
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <Animated.View entering={FadeIn}>
              <Text style={m.stepTitle}>📋 بيانات المؤسسة</Text>
              <Text style={m.stepHint}>عرّفنا بمؤسستكم</Text>

              <Field label="اسم المؤسسة *" value={orgName} onChangeText={setOrgName} placeholder="مثال: مستشفى الملك فيصل" />

              <Text style={m.label}>نوع المؤسسة *</Text>
              <View style={m.typeGrid}>
                {TYPE_KEYS.map(k => {
                  const cfg = TYPE_CONFIG[k];
                  const active = orgType === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[m.typeBtn, active && { borderColor: cfg.color, backgroundColor: cfg.color + "20" }]}
                      onPress={() => { Haptics.selectionAsync(); setOrgType(k); }}
                    >
                      <Text style={m.typeEmoji}>{cfg.emoji}</Text>
                      <Text style={[m.typeBtnText, active && { color: cfg.color, fontWeight: "700" }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Field label="القطاع / التخصص" value={sector} onChangeText={setSector} placeholder="مثال: طب القلب، تعليم تقني..." />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="المدينة" value={city} onChangeText={setCity} placeholder="الرياض" /></View>
                <View style={{ flex: 1 }}><Field label="الدولة" value={country} onChangeText={setCountry} placeholder="السعودية" /></View>
              </View>
              <Field label="الموقع الإلكتروني" value={website} onChangeText={setWebsite} placeholder="example.com" autoCapitalize="none" keyboardType="url" />
            </Animated.View>
          )}

          {step === 2 && (
            <Animated.View entering={FadeIn}>
              <Text style={m.stepTitle}>👤 جهة الاتصال</Text>
              <Text style={m.stepHint}>المسؤول عن متابعة هذا الطلب</Text>

              <Field label="اسم المسؤول *" value={contactPerson} onChangeText={setContactPerson} placeholder="الاسم الكامل" />
              <Field label="المسمى الوظيفي" value={contactRole} onChangeText={setContactRole} placeholder="مدير الشراكات" />
              <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="contact@org.com" keyboardType="email-address" autoCapitalize="none" />
              <Field label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="+9665xxxxxxxx" keyboardType="phone-pad" />
              <Field label="رقم الواتساب" value={whatsapp} onChangeText={setWhatsapp} placeholder="+9665xxxxxxxx" keyboardType="phone-pad" />

              <View style={m.notice}>
                <Ionicons name="information-circle" size={16} color={Colors.primary} />
                <Text style={m.noticeText}>يجب إدخال وسيلة تواصل واحدة على الأقل</Text>
              </View>
            </Animated.View>
          )}

          {step === 3 && (
            <Animated.View entering={FadeIn}>
              <Text style={m.stepTitle}>🎯 تفاصيل التعاون</Text>
              <Text style={m.stepHint}>صف نوع الشراكة والخدمات المقدّمة</Text>

              <Field label="نطاق التعاون المقترح" value={cooperationScope} onChangeText={setCooperationScope}
                placeholder="مثال: تقديم خدمات طبية متخصصة لأهالي الحصاحيصا..." multiline />
              <Field label="نبذة عن المؤسسة" value={description} onChangeText={setDescription}
                placeholder="معلومات مختصرة تعرّف بمؤسستكم..." multiline />
              <Field label="الخدمات / المنتجات المقدّمة" value={servicesText} onChangeText={setServicesText}
                placeholder="افصل بين الخدمات بفاصلة، مثال: استشارات، فحوصات، ندوات..." multiline />
              <Field label="الفئة المستهدفة" value={targetAudience} onChangeText={setTargetAudience}
                placeholder="مثال: المرضى، الطلاب، الأسر..." />
            </Animated.View>
          )}
        </ScrollView>

        {/* Footer Buttons */}
        <View style={[m.footer, { paddingBottom: insets.bottom + 12 }]}>
          {step > 1 && (
            <TouchableOpacity style={m.prevBtn} onPress={prev} disabled={submitting}>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              <Text style={m.prevBtnText}>السابق</Text>
            </TouchableOpacity>
          )}
          {step < 3 ? (
            <TouchableOpacity style={m.nextBtn} onPress={next}>
              <LinearGradient colors={[Colors.primary, "#0E7B5C"]} style={StyleSheet.absoluteFill} />
              <Text style={m.nextBtnText}>التالي</Text>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={m.nextBtn} onPress={submit} disabled={submitting}>
              <LinearGradient colors={["#FFD700", "#F0C040"]} style={StyleSheet.absoluteFill} />
              {submitting ? <ActivityIndicator color="#000" /> : (
                <>
                  <Text style={[m.nextBtnText, { color: "#000" }]}>إرسال الطلب</Text>
                  <Ionicons name="paper-plane" size={18} color="#000" />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={m.label}>{label}</Text>
      <TextInput
        style={[m.input, multiline && { minHeight: 90, textAlignVertical: "top", paddingTop: 12 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlign="right"
      />
    </View>
  );
}

// ────────── Styles ──────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTopRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  headerIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "right" },
  headerSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 3, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  statNum: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 4 },
  statLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 2 },

  ctaCard: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 18, gap: 14, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  ctaIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.12)", alignItems: "center", justifyContent: "center" },
  ctaTitle: { fontSize: 16, fontWeight: "800", color: "#000", textAlign: "right" },
  ctaDesc: { fontSize: 11, color: "rgba(0,0,0,0.7)", marginTop: 3, textAlign: "right", lineHeight: 16 },

  infoCard: { marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderGlow },
  infoHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  infoTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  infoChipEmoji: { fontSize: 13 },
  infoChipText: { fontSize: 11, fontWeight: "600" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 4, height: 18, borderRadius: 2, backgroundColor: Colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  sectionCount: { fontSize: 12, fontWeight: "700", color: Colors.primary, backgroundColor: Colors.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },

  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderGlow, backgroundColor: Colors.cardBg },
  filterChipText: { fontSize: 12, color: Colors.text, fontWeight: "600" },
  filterChipEmoji: { fontSize: 12 },

  partnerCard: { borderRadius: 16, padding: 14, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden" },
  featuredBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFD700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, zIndex: 2 },
  featuredText: { fontSize: 10, fontWeight: "800", color: "#000" },
  partnerHeader: { flexDirection: "row", gap: 12, marginBottom: 10 },
  partnerIconCircle: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  partnerName: { fontSize: 15, fontWeight: "800", color: Colors.text, textAlign: "right", marginBottom: 6 },
  typeBadge: { alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, justifyContent: "flex-end" },
  locationText: { fontSize: 11, color: Colors.textMuted },
  partnerDesc: { fontSize: 12.5, color: Colors.textMuted, lineHeight: 19, textAlign: "right", marginBottom: 10 },
  scopeBox: { padding: 10, borderRadius: 10, backgroundColor: Colors.bg, marginBottom: 10, borderRightWidth: 3, borderRightColor: Colors.primary },
  scopeLabel: { fontSize: 11, fontWeight: "700", color: Colors.primary, marginBottom: 4, textAlign: "right" },
  scopeText: { fontSize: 12, color: Colors.text, lineHeight: 18, textAlign: "right" },
  servicesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  serviceChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  serviceChipText: { fontSize: 10.5, fontWeight: "600" },
  websiteBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, backgroundColor: Colors.primary + "10", borderWidth: 1, borderColor: Colors.primary + "30" },
  websiteText: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: "600", textAlign: "right" },

  emptyBox: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  emptyHint: { fontSize: 11, color: Colors.primary, fontWeight: "600" },
});

const m = StyleSheet.create({
  header: { paddingBottom: 12, paddingHorizontal: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  progressRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },

  stepTitle: { fontSize: 18, fontWeight: "800", color: Colors.text, textAlign: "right", marginBottom: 4 },
  stepHint: { fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 18 },

  label: { fontSize: 13, fontWeight: "700", color: Colors.text, marginBottom: 6, textAlign: "right" },
  input: { backgroundColor: Colors.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.borderGlow },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderGlow, backgroundColor: Colors.cardBg },
  typeEmoji: { fontSize: 14 },
  typeBtnText: { fontSize: 12, color: Colors.text },

  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: Colors.primary + "10", borderRadius: 10, borderWidth: 1, borderColor: Colors.primary + "30", marginTop: 8 },
  noticeText: { flex: 1, fontSize: 11.5, color: Colors.primary, textAlign: "right" },

  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderGlow, backgroundColor: Colors.cardBg },
  prevBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderGlow },
  prevBtnText: { fontSize: 14, fontWeight: "700", color: Colors.textMuted },
  nextBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, overflow: "hidden" },
  nextBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
