import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, Platform, Alert, Modal,
  KeyboardAvoidingView, ActivityIndicator, Switch, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { fsGetCollection, COLLECTIONS, orderBy, isFirebaseAvailable } from "@/lib/firebase/firestore";
import { useFocusEffect, useRouter } from "expo-router";
import Colors from "@/constants/colors";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { LinearGradient } from "expo-linear-gradient";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { uploadPaymentProof } from "@/lib/firebase/storage";

// ══════════════════════════════════════════════════════
// الأنواع
// ══════════════════════════════════════════════════════
export type Facility = {
  id: string; name: string; type: "pharmacy" | "hospital" | "clinic";
  address: string; phone: string; isOnCall: boolean; hours: string; specialties?: string[];
};
type Specialist = {
  id: number; name: string; specialty: string; bio?: string;
  clinic?: string; phone?: string; photo_url?: string;
  available_days: string; fees?: string;
};
type Appointment = {
  id: number; target_type: string; target_id: string; facility_name?: string;
  appointment_date: string; appointment_time: string; status: string; notes?: string;
  created_at: string;
};
type Consultation = {
  id: number; user_name: string; specialty?: string; question: string;
  is_anonymous: boolean; replies_count: number; created_at: string;
};
type Reply = {
  id: number; user_name: string; is_specialist: boolean; specialist_title?: string;
  body: string; created_at: string;
};

export const MEDICAL_KEY = "medical_facilities_v1";
export async function loadFacilities(): Promise<Facility[]> {
  try {
    if (isFirebaseAvailable()) return await fsGetCollection<Facility>(COLLECTIONS.MEDICAL, orderBy("name"));
    return [];
  } catch { return []; }
}

export function getTypeIcon(type: Facility["type"]) {
  return type === "pharmacy" ? "medical-bag" : type === "hospital" ? "hospital-building" : "stethoscope";
}
export function getTypeColor(type: Facility["type"]) {
  return type === "pharmacy" ? Colors.primary : type === "hospital" ? "#2E7D9A" : "#6A5ACD";
}
export function getTypeLabel(type: Facility["type"], t: any) {
  return type === "pharmacy" ? t("medical", "pharmacy") : type === "hospital" ? t("medical", "hospital") : t("medical", "clinic");
}

const SPECIALTIES = [
  "الطب العام", "الطب الداخلي", "طب الأطفال", "النساء والتوليد", "العيون",
  "الأسنان", "العظام", "القلب", "الجراحة", "الأنف والأذن والحنجرة",
  "الجلدية", "الأعصاب", "الصحة النفسية", "الغدد والسكر", "المسالك البولية",
];
const APT_TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

// ══════════════════════════════════════════════════════
// زر انضمام المنشأة الطبية
// ══════════════════════════════════════════════════════
function MedicalJoinBanner() {
  const router = useRouter();
  return (
    <Animated.View entering={FadeIn.delay(150).duration(400)} style={mj.wrapper}>
      <LinearGradient colors={["#0E2B18", "#0B2215", "#091C12"]} style={mj.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={mj.dot1} /><View style={mj.dot2} />
        <View style={mj.topRow}>
          <View style={mj.iconBox}>
            <MaterialCommunityIcons name="hospital-building" size={28} color="#E74C6F" />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <View style={mj.badge}>
              <Ionicons name="shield-checkmark" size={11} color="#E74C6F" />
              <Text style={mj.badgeText}>انضمام رسمي موثّق</Text>
            </View>
            <Text style={mj.title}>سجِّل منشأتك الطبية{"\n"}في حصاحيصاوي</Text>
          </View>
        </View>
        <View style={mj.featuresList}>
          {[
            { icon: "people-outline",          text: "وصول مباشر لآلاف المرضى في الحصاحيصا" },
            { icon: "calendar-outline",         text: "نظام حجز مواعيد إلكتروني متكامل" },
            { icon: "shield-checkmark-outline", text: "ختم التحقق الرسمي على صفحتك الطبية" },
          ].map((f, i) => (
            <View key={i} style={mj.featureRow}>
              <Ionicons name={f.icon as any} size={15} color="#E74C6F" />
              <Text style={mj.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        <View style={mj.typesRow}>
          {[
            { icon: "hospital-building", label: "مستشفيات", color: "#E74C6F" },
            { icon: "stethoscope",       label: "عيادات",   color: "#F97316" },
            { icon: "medical-bag",       label: "صيدليات",  color: "#3E9CBF" },
          ].map((tp, i) => (
            <View key={i} style={[mj.typeChip, { borderColor: tp.color + "40", backgroundColor: tp.color + "12" }]}>
              <MaterialCommunityIcons name={tp.icon as any} size={15} color={tp.color} />
              <Text style={[mj.typeLabel, { color: tp.color }]}>{tp.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={() => router.push("/org-join" as any)} activeOpacity={0.85} style={mj.joinBtnWrap}>
          <LinearGradient colors={["#E74C6F", "#C43057"]} style={mj.joinBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={mj.joinBtnText}>قدّم طلب انضمام منشأتك</Text>
            <View style={mj.joinBtnIcon}>
              <MaterialCommunityIcons name="domain-plus" size={18} color="#E74C6F" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={mj.freeNote}>التسجيل مجاني · عقد رسمي موثّق · موافقة خلال ٣-٥ أيام</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════
// قسم الدليل الطبي
// ══════════════════════════════════════════════════════
function DirectoryTab({ search, filter, facilities, t, isRTL, tr }: any) {
  const filtered = facilities.filter((f: Facility) => {
    const matchesSearch = search === "" || f.name.includes(search) || f.address.includes(search);
    const matchesFilter = filter === "all" || (filter === "onCall" ? f.isOnCall : f.type === filter);
    return matchesSearch && matchesFilter;
  });

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const clean = phone.replace(/[^0-9]/g, "");
    Alert.alert(t("common", "contact"), t("common", "contact"), [
      { text: t("common", "cancel"), style: "cancel" },
      { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
      { text: t("medical", "callPhone"), onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const openMaps = (address: string) =>
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address + " Hasahisa")}`);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]} showsVerticalScrollIndicator={false}>
      {filtered.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="hospital-box-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{t("medical", "noResults")}</Text>
        </View>
      )}
      <MedicalJoinBanner />
      {filtered.map((facility: Facility, index: number) => {
        const color = getTypeColor(facility.type);
        return (
          <Animated.View key={facility.id} entering={FadeInDown.delay(index * 60).springify().damping(18)}>
            <View style={styles.card}>
              <View style={[styles.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={[styles.actionButtons, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <AnimatedPress onPress={() => handleCall(facility.phone)}>
                    <View style={styles.callBtn}><Ionicons name="call" size={20} color={Colors.cardBg} /></View>
                  </AnimatedPress>
                  <AnimatedPress onPress={() => Alert.alert(t("common", "bookNow"), `${t("medical", "bookAppointment")}: ${facility.name}`)}>
                    <View style={[styles.callBtn, { backgroundColor: Colors.accent }]}><Ionicons name="calendar" size={20} color={Colors.cardBg} /></View>
                  </AnimatedPress>
                  <AnimatedPress onPress={() => Alert.alert(t("common", "rate"), `${t("common", "rateService")}: ${facility.name}`)}>
                    <View style={[styles.callBtn, { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider }]}>
                      <Ionicons name="star-outline" size={20} color={Colors.textPrimary} />
                    </View>
                  </AnimatedPress>
                </View>
                <View style={[styles.cardHeaderRight, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                  <View style={[styles.nameRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    {facility.isOnCall && (
                      <View style={styles.onCallBadge}><Text style={styles.onCallText}>{t("medical", "onCall")}</Text></View>
                    )}
                    <Text style={[styles.cardName, { textAlign: isRTL ? "right" : "left" }]}>{facility.name}</Text>
                  </View>
                  <View style={[styles.typeRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <MaterialCommunityIcons name={getTypeIcon(facility.type)} size={14} color={color} />
                    <Text style={[styles.typeLabel, { color }]}>{getTypeLabel(facility.type, t)}</Text>
                  </View>
                </View>
                <View style={[styles.iconCircle, { backgroundColor: color + "18" }]}>
                  <MaterialCommunityIcons name={getTypeIcon(facility.type)} size={26} color={color} />
                </View>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.cardDetails}>
                <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Text style={[styles.detailValue, { textAlign: isRTL ? "right" : "left" }]}>{facility.hours}</Text>
                  <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                </View>
                <AnimatedPress onPress={() => openMaps(facility.address)}>
                  <View style={[styles.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    <Text style={[styles.detailValue, { color: Colors.primary, textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>{facility.address}</Text>
                    <Ionicons name="location-outline" size={14} color={Colors.primary} />
                  </View>
                </AnimatedPress>
                {facility.specialties && facility.specialties.length > 0 && (
                  <View style={[styles.specialtiesRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                    {facility.specialties.map((s: string) => (
                      <View key={s} style={styles.specialtyTag}>
                        <Text style={styles.specialtyText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════
// قسم المواعيد
// ══════════════════════════════════════════════════════
function AppointmentsTab({ auth }: { auth: any }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  // نموذج الحجز
  const [facilityName, setFacilityName] = useState("");
  const [aptDate, setAptDate]     = useState("");
  const [aptTime, setAptTime]     = useState("");
  const [aptPhone, setAptPhone]   = useState(auth.user?.phone || "");
  const [aptNotes, setAptNotes]   = useState("");
  const [booking, setBooking]     = useState(false);
  // الدفع
  const [payMethod, setPayMethod]   = useState<"cash" | "transfer" | "">("");
  const [proofUri,  setProofUri]    = useState<string | null>(null);
  const [proofUrl,  setProofUrl]    = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [uploadPct, setUploadPct]   = useState(0);

  const base = getApiUrl();

  const loadAppointments = async () => {
    if (!auth.token || !base) { setLoading(false); return; }
    try {
      const res = await fetchWithTimeout(`${base}/api/appointments/mine`, { headers: { Authorization: `Bearer ${auth.token}` } });
      if (res.ok) { const d = await res.json() as any; setAppointments(d.appointments || []); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadAppointments(); }, []);

  const pickProofImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("صلاحية مطلوبة", "يرجى السماح بالوصول إلى الصور"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1.0, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
      setProofUrl(null);
      if (Platform.OS !== "web") Haptics.selectionAsync();
    }
  };

  const uploadProof = async (): Promise<string | null> => {
    if (!proofUri || !auth.user) return null;
    setUploading(true); setUploadPct(0);
    try {
      const url = await uploadPaymentProof(String(auth.user.id), proofUri, p => setUploadPct(p.percent));
      setProofUrl(url);
      return url;
    } catch { Alert.alert("خطأ", "تعذّر رفع الإشعار، تحقق من اتصالك"); return null; }
    finally { setUploading(false); }
  };

  const bookAppointment = async () => {
    if (!facilityName.trim() || !aptDate.trim() || !aptTime) {
      Alert.alert("خطأ", "يرجى ملء اسم المنشأة والتاريخ والوقت"); return;
    }
    if (!payMethod) { Alert.alert("خطأ", "يرجى اختيار طريقة الدفع"); return; }
    if (payMethod === "transfer" && !proofUri) {
      Alert.alert("خطأ", "يرجى رفع صورة إشعار التحويل"); return;
    }
    if (!base) return;
    setBooking(true);
    try {
      let finalProofUrl = proofUrl;
      if (payMethod === "transfer" && proofUri && !proofUrl) {
        finalProofUrl = await uploadProof();
        if (!finalProofUrl) { setBooking(false); return; }
      }
      const res = await fetchWithTimeout(`${base}/api/appointments/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          target_type: "facility", target_id: "manual",
          facility_name: facilityName.trim(), appointment_date: aptDate.trim(),
          appointment_time: aptTime, user_phone: aptPhone.trim(), notes: aptNotes.trim(),
          payment_method: payMethod, payment_proof_url: finalProofUrl || undefined,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowBook(false);
        setFacilityName(""); setAptDate(""); setAptTime(""); setAptNotes("");
        setPayMethod(""); setProofUri(null); setProofUrl(null);
        loadAppointments();
      } else {
        const err = await res.json() as any;
        Alert.alert("خطأ", err.error || "تعذّر الحجز");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setBooking(false); }
  };

  const cancelAppointment = async (id: number) => {
    if (!base) return;
    Alert.alert("إلغاء الموعد", "هل تريد إلغاء هذا الموعد؟", [
      { text: "لا", style: "cancel" },
      { text: "إلغاء الموعد", style: "destructive", onPress: async () => {
        await fetchWithTimeout(`${base}/api/appointments/${id}/cancel`, {
          method: "PATCH", headers: { Authorization: `Bearer ${auth.token}` },
        });
        loadAppointments();
      }},
    ]);
  };

  const statusColor = (s: string) =>
    s === "pending" ? Colors.accent : s === "cancelled" ? Colors.danger : Colors.primary;
  const statusLabel = (s: string) =>
    s === "pending" ? "قيد المراجعة" : s === "cancelled" ? "ملغى" : "مؤكد";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* زر حجز جديد */}
        <TouchableOpacity onPress={() => setShowBook(true)} activeOpacity={0.85}>
          <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={aptSty.bookBtn}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={aptSty.bookBtnText}>حجز موعد جديد</Text>
            <Ionicons name="add" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* قائمة المواعيد */}
        <View style={aptSty.sectionHeader}>
          <Text style={aptSty.sectionTitle}>مواعيدي</Text>
          <MaterialCommunityIcons name="calendar-clock" size={18} color={Colors.primary} />
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : appointments.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>لا توجد مواعيد بعد</Text>
          </View>
        ) : (
          appointments.map((apt, i) => (
            <Animated.View key={apt.id} entering={FadeInDown.delay(i * 50).springify()}>
              <View style={aptSty.card}>
                <View style={aptSty.cardTop}>
                  <TouchableOpacity
                    onPress={() => apt.status !== "cancelled" && cancelAppointment(apt.id)}
                    disabled={apt.status === "cancelled"}
                    hitSlop={8}
                  >
                    <Ionicons name={apt.status === "cancelled" ? "close-circle" : "close-circle-outline"} size={20} color={Colors.danger} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 3 }}>
                    <Text style={aptSty.cardName}>{apt.facility_name || "منشأة طبية"}</Text>
                    <View style={aptSty.cardMeta}>
                      <Text style={aptSty.cardMetaText}>{apt.appointment_time}</Text>
                      <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                      <Text style={aptSty.cardMetaText}>{apt.appointment_date}</Text>
                      <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                    </View>
                  </View>
                  <View style={[aptSty.statusBadge, { backgroundColor: statusColor(apt.status) + "18", borderColor: statusColor(apt.status) + "40" }]}>
                    <Text style={[aptSty.statusText, { color: statusColor(apt.status) }]}>{statusLabel(apt.status)}</Text>
                  </View>
                </View>
                {apt.notes ? (
                  <View style={aptSty.notesRow}>
                    <Text style={aptSty.notesText} numberOfLines={2}>{apt.notes}</Text>
                    <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ))
        )}
      </ScrollView>

      {/* نافذة الحجز */}
      <Modal visible={showBook} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBook(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={aptSty.sheetHeader}>
            <TouchableOpacity onPress={() => setShowBook(false)}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={aptSty.sheetTitle}>حجز موعد جديد</Text>
            <MaterialCommunityIcons name="calendar-plus" size={22} color={Colors.primary} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {/* اسم المنشأة */}
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>المنشأة الطبية <Text style={{ color: Colors.danger }}>*</Text></Text>
              <TextInput style={aptSty.fieldInput} value={facilityName} onChangeText={setFacilityName}
                placeholder="اسم المستشفى أو العيادة" placeholderTextColor={Colors.textMuted} textAlign="right" />
            </View>
            {/* التاريخ */}
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>التاريخ <Text style={{ color: Colors.danger }}>*</Text></Text>
              <TextInput style={aptSty.fieldInput} value={aptDate} onChangeText={setAptDate}
                placeholder="YYYY-MM-DD مثال: 2026-04-15" placeholderTextColor={Colors.textMuted} textAlign="right"
                keyboardType="numeric" />
            </View>
            {/* الوقت */}
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>الوقت <Text style={{ color: Colors.danger }}>*</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
                {APT_TIMES.map(t => (
                  <TouchableOpacity key={t} onPress={() => setAptTime(t)} style={[aptSty.timeChip, aptTime === t && aptSty.timeChipActive]}>
                    <Text style={[aptSty.timeChipText, aptTime === t && { color: "#fff" }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* رقم الهاتف */}
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>رقم هاتفك للتأكيد</Text>
              <TextInput style={aptSty.fieldInput} value={aptPhone} onChangeText={setAptPhone}
                placeholder="+249XXXXXXXXX" placeholderTextColor={Colors.textMuted}
                textAlign="right" keyboardType="phone-pad" />
            </View>
            {/* ملاحظات */}
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>ملاحظات إضافية</Text>
              <TextInput style={[aptSty.fieldInput, { minHeight: 80, textAlignVertical: "top", paddingTop: 12 }]}
                value={aptNotes} onChangeText={setAptNotes}
                placeholder="أي تفاصيل إضافية..." placeholderTextColor={Colors.textMuted}
                textAlign="right" multiline />
            </View>

            {/* ══ طريقة الدفع ══ */}
            <View style={aptSty.paySection}>
              <View style={aptSty.payHeader}>
                <MaterialCommunityIcons name="cash-multiple" size={17} color={Colors.accent} />
                <Text style={aptSty.paySectionTitle}>طريقة الدفع</Text>
              </View>
              <View style={aptSty.payMethods}>
                {/* كاش */}
                <TouchableOpacity
                  style={[aptSty.payMethodBtn, payMethod === "cash" && aptSty.payMethodBtnActive]}
                  onPress={() => { setPayMethod("cash"); setProofUri(null); setProofUrl(null); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="cash" size={22}
                    color={payMethod === "cash" ? Colors.primary : Colors.textMuted} />
                  <Text style={[aptSty.payMethodLabel, payMethod === "cash" && { color: Colors.primary }]}>
                    نقداً
                  </Text>
                  {payMethod === "cash" && (
                    <View style={aptSty.payMethodCheck}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
                {/* تحويل */}
                <TouchableOpacity
                  style={[aptSty.payMethodBtn, payMethod === "transfer" && aptSty.payMethodBtnActiveTransfer]}
                  onPress={() => setPayMethod("transfer")}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="bank-transfer" size={22}
                    color={payMethod === "transfer" ? Colors.accent : Colors.textMuted} />
                  <Text style={[aptSty.payMethodLabel, payMethod === "transfer" && { color: Colors.accent }]}>
                    تحويل بنكي
                  </Text>
                  {payMethod === "transfer" && (
                    <View style={aptSty.payMethodCheck}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* رفع إشعار التحويل */}
              {payMethod === "transfer" && (
                <Animated.View entering={FadeInDown.springify()} style={aptSty.proofBox}>
                  <View style={aptSty.proofBoxHeader}>
                    <Ionicons name="document-attach-outline" size={15} color={Colors.accent} />
                    <Text style={aptSty.proofBoxTitle}>إشعار التحويل <Text style={{ color: Colors.danger }}>*</Text></Text>
                  </View>
                  <Text style={aptSty.proofBoxSub}>الرجاء رفع صورة إشعار تحويل المبلغ</Text>

                  <TouchableOpacity style={aptSty.proofPicker} onPress={pickProofImage} activeOpacity={0.8}>
                    {proofUri
                      ? <Image source={{ uri: proofUri }} style={aptSty.proofThumb} />
                      : <>
                          <Ionicons name="cloud-upload-outline" size={28} color={Colors.textMuted} />
                          <Text style={aptSty.proofPickerText}>اضغط لاختيار الصورة</Text>
                        </>
                    }
                  </TouchableOpacity>

                  {proofUri && !proofUrl && (
                    <TouchableOpacity
                      style={[aptSty.uploadBtn, uploading && { opacity: 0.6 }]}
                      onPress={uploadProof} disabled={uploading} activeOpacity={0.8}
                    >
                      {uploading
                        ? <>
                            <ActivityIndicator size="small" color={Colors.accent} />
                            <Text style={aptSty.uploadBtnText}>جارٍ الرفع {Math.round(uploadPct)}%</Text>
                          </>
                        : <>
                            <Ionicons name="cloud-upload-outline" size={16} color={Colors.accent} />
                            <Text style={aptSty.uploadBtnText}>رفع الإشعار</Text>
                          </>
                      }
                    </TouchableOpacity>
                  )}

                  {proofUrl && (
                    <View style={aptSty.uploadDone}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
                      <Text style={aptSty.uploadDoneText}>تم رفع الإشعار بنجاح</Text>
                    </View>
                  )}
                </Animated.View>
              )}
            </View>

            {/* زر الإرسال */}
            <TouchableOpacity onPress={bookAppointment} disabled={booking || uploading} activeOpacity={0.85}>
              <LinearGradient colors={(booking || uploading) ? [Colors.divider, Colors.divider] : [Colors.primary, Colors.primaryDim]} style={aptSty.submitBtn}>
                {booking ? <ActivityIndicator color="#fff" /> : <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={aptSty.submitBtnText}>تأكيد الحجز</Text>
                </>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// قسم الاستشارات الطبية
// ══════════════════════════════════════════════════════
function ConsultationsTab({ auth }: { auth: any }) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSpec, setFilterSpec] = useState<string>("الكل");
  const [showAsk, setShowAsk] = useState(false);
  const [selectedConsult, setSelectedConsult] = useState<Consultation | null>(null);
  // نموذج السؤال
  const [question, setQuestion]   = useState("");
  const [specialty, setSpecialty] = useState("");
  const [isAnon, setIsAnon]       = useState(false);
  const [sending, setSending]     = useState(false);
  // الردود
  const [replies, setReplies]     = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying]   = useState(false);

  const base = getApiUrl();

  const loadConsultations = async () => {
    if (!base) { setLoading(false); return; }
    try {
      const url = filterSpec !== "الكل" ? `${base}/api/medical-consultations?specialty=${encodeURIComponent(filterSpec)}` : `${base}/api/medical-consultations`;
      const res = await fetchWithTimeout(url);
      if (res.ok) { const d = await res.json() as any; setConsultations(d.consultations || []); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); loadConsultations(); }, [filterSpec]);

  const loadReplies = async (consultId: number) => {
    if (!base) return;
    try {
      const res = await fetchWithTimeout(`${base}/api/medical-consultations/${consultId}/replies`);
      if (res.ok) { const d = await res.json() as any; setReplies(d.replies || []); }
    } catch {}
  };

  const submitQuestion = async () => {
    if (!question.trim()) { Alert.alert("خطأ", "يرجى كتابة سؤالك"); return; }
    if (!base) return;
    setSending(true);
    try {
      const res = await fetchWithTimeout(`${base}/api/medical-consultations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ question: question.trim(), specialty: specialty || null, is_anonymous: isAnon }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAsk(false); setQuestion(""); setSpecialty(""); setIsAnon(false);
        loadConsultations();
      } else { const err = await res.json() as any; Alert.alert("خطأ", err.error || "تعذّر الإرسال"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSending(false); }
  };

  const submitReply = async () => {
    if (!replyText.trim() || !selectedConsult || !base) return;
    setReplying(true);
    try {
      const res = await fetchWithTimeout(`${base}/api/medical-consultations/${selectedConsult.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ body: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText("");
        loadReplies(selectedConsult.id);
        setConsultations(prev => prev.map(c => c.id === selectedConsult.id ? { ...c, replies_count: c.replies_count + 1 } : c));
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {} finally { setReplying(false); }
  };

  const openConsult = (c: Consultation) => {
    setSelectedConsult(c);
    setReplies([]);
    loadReplies(c.id);
  };

  const SPEC_FILTERS = ["الكل", ...SPECIALTIES.slice(0, 6)];

  return (
    <View style={{ flex: 1 }}>
      {/* فلاتر التخصص */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8, flexDirection: "row-reverse" }}>
        {SPEC_FILTERS.map(s => (
          <TouchableOpacity key={s} onPress={() => setFilterSpec(s)} style={[cSty.chip, filterSpec === s && cSty.chipActive]}>
            <Text style={[cSty.chipText, filterSpec === s && { color: "#fff" }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* زر طرح سؤال */}
        <TouchableOpacity onPress={() => setShowAsk(true)} activeOpacity={0.85}>
          <LinearGradient colors={["#2E7D9A", "#1A4F6B"]} style={cSty.askBtn}>
            <MaterialCommunityIcons name="comment-question-outline" size={20} color="#fff" />
            <Text style={cSty.askBtnText}>اطرح سؤالاً طبياً</Text>
            <Ionicons name="add" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : consultations.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="comment-question-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>لا توجد استشارات بعد</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" }}>كن أول من يطرح سؤالاً</Text>
          </View>
        ) : (
          consultations.map((c, i) => (
            <Animated.View key={c.id} entering={FadeInDown.delay(i * 50).springify()}>
              <TouchableOpacity style={cSty.card} onPress={() => openConsult(c)} activeOpacity={0.82}>
                <View style={cSty.cardTop}>
                  <View style={cSty.replyCount}>
                    <Text style={cSty.replyCountNum}>{c.replies_count}</Text>
                    <Text style={cSty.replyCountLabel}>رد</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 4 }}>
                    {c.specialty && (
                      <View style={cSty.specBadge}>
                        <Text style={cSty.specBadgeText}>{c.specialty}</Text>
                      </View>
                    )}
                    <Text style={cSty.question} numberOfLines={3}>{c.question}</Text>
                    <Text style={cSty.meta}>{c.is_anonymous ? "مجهول" : c.user_name} · {new Date(c.created_at).toLocaleDateString("ar-SA")}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        )}
      </ScrollView>

      {/* نافذة طرح السؤال */}
      <Modal visible={showAsk} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAsk(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={aptSty.sheetHeader}>
            <TouchableOpacity onPress={() => setShowAsk(false)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
            <Text style={aptSty.sheetTitle}>استشارة طبية</Text>
            <MaterialCommunityIcons name="comment-question-outline" size={22} color="#2E7D9A" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>التخصص المطلوب (اختياري)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse", paddingVertical: 4 }}>
                {SPECIALTIES.map(s => (
                  <TouchableOpacity key={s} onPress={() => setSpecialty(s === specialty ? "" : s)} style={[aptSty.timeChip, specialty === s && aptSty.timeChipActive]}>
                    <Text style={[aptSty.timeChipText, specialty === s && { color: "#fff" }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={aptSty.field}>
              <Text style={aptSty.fieldLabel}>سؤالك <Text style={{ color: Colors.danger }}>*</Text></Text>
              <TextInput style={[aptSty.fieldInput, { minHeight: 120, textAlignVertical: "top", paddingTop: 12 }]}
                value={question} onChangeText={setQuestion}
                placeholder="اكتب سؤالك الطبي بوضوح..." placeholderTextColor={Colors.textMuted}
                textAlign="right" multiline />
            </View>
            <View style={[aptSty.field, { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }]}>
              <Switch value={isAnon} onValueChange={setIsAnon}
                trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
                thumbColor={isAnon ? Colors.primary : Colors.textMuted} />
              <Text style={aptSty.fieldLabel}>النشر بشكل مجهول</Text>
            </View>
            <TouchableOpacity onPress={submitQuestion} disabled={sending} activeOpacity={0.85}>
              <LinearGradient colors={sending ? [Colors.divider, Colors.divider] : ["#2E7D9A", "#1A4F6B"]} style={aptSty.submitBtn}>
                {sending ? <ActivityIndicator color="#fff" /> : <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={aptSty.submitBtnText}>إرسال الاستشارة</Text>
                </>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* نافذة الاستشارة + الردود */}
      <Modal visible={!!selectedConsult} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedConsult(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={aptSty.sheetHeader}>
            <TouchableOpacity onPress={() => setSelectedConsult(null)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity>
            <Text style={aptSty.sheetTitle}>الاستشارة والردود</Text>
            <MaterialCommunityIcons name="forum-outline" size={22} color="#2E7D9A" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
            {selectedConsult && (
              <View style={cSty.consultBox}>
                {selectedConsult.specialty && (
                  <View style={cSty.specBadge}><Text style={cSty.specBadgeText}>{selectedConsult.specialty}</Text></View>
                )}
                <Text style={cSty.consultQuestion}>{selectedConsult.question}</Text>
                <Text style={cSty.meta}>{selectedConsult.is_anonymous ? "مجهول" : selectedConsult.user_name}</Text>
              </View>
            )}
            <Text style={cSty.repliesTitle}>الردود ({replies.length})</Text>
            {replies.length === 0 && (
              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", padding: 20 }}>لا توجد ردود بعد. كن أول من يجيب!</Text>
            )}
            {replies.map((r, i) => (
              <Animated.View key={r.id} entering={FadeInDown.delay(i * 40).springify()}>
                <View style={[cSty.replyCard, r.is_specialist && cSty.replyCardSpec]}>
                  {r.is_specialist && (
                    <View style={cSty.specRibbon}>
                      <MaterialCommunityIcons name="stethoscope" size={12} color="#fff" />
                      <Text style={cSty.specRibbonText}>{r.specialist_title || "متخصص"}</Text>
                    </View>
                  )}
                  <Text style={cSty.replyBody}>{r.body}</Text>
                  <Text style={cSty.replyMeta}>{r.user_name} · {new Date(r.created_at).toLocaleDateString("ar-SA")}</Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
          {/* حقل الرد */}
          <View style={cSty.replyBar}>
            <TouchableOpacity onPress={submitReply} disabled={replying || !replyText.trim()} style={[cSty.sendBtn, (!replyText.trim() || replying) && { opacity: 0.4 }]}>
              {replying ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
            <TextInput style={cSty.replyInput} value={replyText} onChangeText={setReplyText}
              placeholder="اكتب ردك..." placeholderTextColor={Colors.textMuted}
              textAlign="right" multiline />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// قسم الأخصائيين
// ══════════════════════════════════════════════════════
function SpecialistsTab() {
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterSpec, setFilterSpec]   = useState("الكل");
  const [selected, setSelected]       = useState<Specialist | null>(null);

  const base = getApiUrl();

  useEffect(() => {
    (async () => {
      if (!base) { setLoading(false); return; }
      try {
        const res = await fetchWithTimeout(`${base}/api/specialists`);
        if (res.ok) { const d = await res.json() as any; setSpecialists(d.specialists || []); }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const specs = ["الكل", ...Array.from(new Set(specialists.map(s => s.specialty)))];
  const filtered = filterSpec === "الكل" ? specialists : specialists.filter(s => s.specialty === filterSpec);

  return (
    <View style={{ flex: 1 }}>
      {/* فلاتر */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8, flexDirection: "row-reverse" }}>
        {specs.map(s => (
          <TouchableOpacity key={s} onPress={() => setFilterSpec(s)} style={[cSty.chip, filterSpec === s && cSty.chipActive]}>
            <Text style={[cSty.chipText, filterSpec === s && { color: "#fff" }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={[styles.emptyState, { marginTop: 60 }]}>
          <MaterialCommunityIcons name="stethoscope" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyText}>لا يوجد أخصائيون مسجلون بعد</Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 30 }}>
            سيتم إضافة دليل الأخصائيين قريباً
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
          {filtered.map((sp, i) => {
            const days: string[] = JSON.parse(sp.available_days || "[]");
            return (
              <Animated.View key={sp.id} entering={FadeInDown.delay(i * 60).springify()}>
                <TouchableOpacity style={spSty.card} onPress={() => setSelected(sp)} activeOpacity={0.85}>
                  {/* أيقونة الطبيب */}
                  <View style={spSty.cardLeft}>
                    <View style={spSty.avatar}>
                      <MaterialCommunityIcons name="account-circle" size={48} color={Colors.primary} />
                    </View>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 5 }}>
                    <Text style={spSty.name}>{sp.name}</Text>
                    <View style={spSty.specRow}>
                      <MaterialCommunityIcons name="stethoscope" size={13} color="#2E7D9A" />
                      <Text style={spSty.specLabel}>{sp.specialty}</Text>
                    </View>
                    {sp.clinic && (
                      <View style={spSty.metaRow}>
                        <Ionicons name="business-outline" size={13} color={Colors.textMuted} />
                        <Text style={spSty.metaText} numberOfLines={1}>{sp.clinic}</Text>
                      </View>
                    )}
                    {sp.fees && (
                      <View style={spSty.metaRow}>
                        <Ionicons name="cash-outline" size={13} color={Colors.accent} />
                        <Text style={[spSty.metaText, { color: Colors.accent }]}>{sp.fees}</Text>
                      </View>
                    )}
                    {days.length > 0 && (
                      <View style={spSty.daysRow}>
                        {days.slice(0, 3).map(d => (
                          <View key={d} style={spSty.dayChip}><Text style={spSty.dayText}>{d}</Text></View>
                        ))}
                        {days.length > 3 && <Text style={spSty.dayText}>+{days.length - 3}</Text>}
                      </View>
                    )}
                  </View>
                  <View style={spSty.callCol}>
                    {sp.phone && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${sp.phone}`)} style={spSty.callBtn}>
                        <Ionicons name="call" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <Ionicons name="chevron-back" size={16} color={Colors.textMuted} style={{ marginTop: 8 }} />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* نافذة تفاصيل الأخصائي */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={{ flex: 1, backgroundColor: Colors.bg }}>
            <LinearGradient colors={["#0B2B18", Colors.bg]} style={spSty.detailHero}>
              <TouchableOpacity onPress={() => setSelected(null)} style={{ alignSelf: "flex-end", marginBottom: 16 }}>
                <Ionicons name="close-circle" size={26} color={Colors.textSecondary} />
              </TouchableOpacity>
              <View style={spSty.detailAvatar}>
                <MaterialCommunityIcons name="account-circle" size={72} color={Colors.primary} />
              </View>
              <Text style={spSty.detailName}>{selected.name}</Text>
              <View style={[spSty.specRow, { justifyContent: "center" }]}>
                <MaterialCommunityIcons name="stethoscope" size={15} color="#2E7D9A" />
                <Text style={[spSty.specLabel, { fontSize: 14 }]}>{selected.specialty}</Text>
              </View>
            </LinearGradient>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              {selected.bio && (
                <View style={spSty.detailSection}>
                  <Text style={spSty.detailSectionTitle}>نبذة</Text>
                  <Text style={spSty.detailText}>{selected.bio}</Text>
                </View>
              )}
              {selected.clinic && (
                <View style={spSty.detailRow}>
                  <Text style={spSty.detailVal}>{selected.clinic}</Text>
                  <Ionicons name="business-outline" size={16} color={Colors.textMuted} />
                  <Text style={spSty.detailKey}>العيادة</Text>
                </View>
              )}
              {selected.fees && (
                <View style={spSty.detailRow}>
                  <Text style={[spSty.detailVal, { color: Colors.accent }]}>{selected.fees}</Text>
                  <Ionicons name="cash-outline" size={16} color={Colors.accent} />
                  <Text style={spSty.detailKey}>الأتعاب</Text>
                </View>
              )}
              {(() => { const days: string[] = JSON.parse(selected.available_days || "[]"); return days.length > 0 ? (
                <View style={spSty.detailSection}>
                  <Text style={spSty.detailSectionTitle}>أيام العمل</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                    {days.map(d => <View key={d} style={[spSty.dayChip, { paddingHorizontal: 14, paddingVertical: 6 }]}><Text style={spSty.dayText}>{d}</Text></View>)}
                  </View>
                </View>
              ) : null; })()}
              {selected.phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${selected.phone}`)} style={spSty.callFullBtn}>
                  <Ionicons name="call" size={20} color="#fff" />
                  <Text style={spSty.callFullBtnText}>اتصل لحجز موعد — {selected.phone}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════
type MedTab = "directory" | "appointments" | "consultations" | "specialists";

const TABS: { key: MedTab; label: string; icon: string }[] = [
  { key: "directory",     label: "الدليل",        icon: "hospital-building" },
  { key: "specialists",   label: "الأخصائيون",    icon: "stethoscope" },
  { key: "appointments",  label: "المواعيد",       icon: "calendar-clock" },
  { key: "consultations", label: "الاستشارات",     icon: "comment-question" },
];

export default function MedicalScreen() {
  const { t, isRTL, lang, tr } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [activeTab, setActiveTab] = useState<MedTab>("directory");

  const FILTER_OPTIONS = [
    { key: "all",      label: t("medical", "allTypes") },
    { key: "pharmacy", label: t("medical", "pharmacy") },
    { key: "hospital", label: t("medical", "hospital") },
    { key: "clinic",   label: t("medical", "clinic") },
    { key: "onCall",   label: t("medical", "onCall") },
  ];

  const load = async () => { setFacilities(await loadFacilities()); };
  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <View style={styles.container}>
      {/* الرأس */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { textAlign: isRTL ? "right" : "left" }]}>{t("medical", "title")}</Text>

        {/* شريط البحث — فقط في الدليل */}
        {activeTab === "directory" && (
          <>
            <View style={[styles.searchRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { textAlign: isRTL ? "right" : "left" }]}
                placeholder={t("medical", "search")} placeholderTextColor={Colors.textMuted}
                value={search} onChangeText={setSearch}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={[styles.filtersContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {FILTER_OPTIONS.map((opt) => (
                <AnimatedPress key={opt.key} scaleDown={0.92} onPress={() => setFilter(opt.key)}>
                  <View style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}>
                    <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>{opt.label}</Text>
                  </View>
                </AnimatedPress>
              ))}
            </ScrollView>
          </>
        )}

        {/* تبويبات القسم */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 6, paddingBottom: 2 }}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { setActiveTab(tab.key); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
              style={[tabSty.tab, activeTab === tab.key && tabSty.tabActive]}
            >
              <MaterialCommunityIcons name={tab.icon as any} size={15} color={activeTab === tab.key ? "#fff" : Colors.textMuted} />
              <Text style={[tabSty.tabLabel, activeTab === tab.key && tabSty.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* المحتوى */}
      <GuestGate
        title={tr("الخدمات الطبية", "Medical Services")}
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { name: "صيدلية الشفاء", type: "صيدلية", hours: "24 ساعة", onCall: true },
              { name: "مستشفى الحصاحيصا الحكومي", type: "مستشفى", hours: "24 ساعة", onCall: true },
              { name: "عيادة الدكتور أحمد", type: "عيادة", hours: "4م - 9م", onCall: false },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.cyber + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name={i === 0 ? "medical-bag" : i === 1 ? "hospital-building" : "stethoscope"} size={20} color={Colors.cyber} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary }}>{item.name}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>{item.type} • {item.hours}</Text>
                </View>
                {item.onCall && (
                  <View style={{ backgroundColor: Colors.primary + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.primary }}>متاح</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        }
        features={[
          { icon: "call-outline",     text: tr("اتصل بأي منشأة طبية مباشرة", "Call any medical facility directly") },
          { icon: "calendar-outline", text: tr("احجز موعداً في عيادتك", "Book appointments at clinics") },
          { icon: "star-outline",     text: tr("قيّم الخدمات وشارك تجربتك", "Rate services and share your experience") },
        ]}
      >
        {activeTab === "directory"     && <DirectoryTab search={search} filter={filter} facilities={facilities} t={t} isRTL={isRTL} tr={tr} />}
        {activeTab === "specialists"   && <SpecialistsTab />}
        {activeTab === "appointments"  && <AppointmentsTab auth={auth} />}
        {activeTab === "consultations" && <ConsultationsTab auth={auth} />}
      </GuestGate>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", marginBottom: 14 },
  searchRow: {
    flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.bg,
    borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 12,
  },
  searchIcon: { marginLeft: 4 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },
  filtersRow: { flexDirection: "row" },
  filtersContent: { flexDirection: "row-reverse", gap: 8, paddingLeft: 4 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  listContent: { padding: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
    borderWidth: 1, borderColor: Colors.divider,
  },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 },
  iconCircle: { width: 52, height: 52, borderRadius: 13, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  cardHeaderRight: { flex: 1, alignItems: "flex-end" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  onCallBadge: { backgroundColor: Colors.primary + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  onCallText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  typeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 3 },
  typeLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  actionButtons: { gap: 8, alignItems: "center" },
  callBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardDetails: { padding: 14, gap: 8 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  detailValue: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  specialtiesRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 4 },
  specialtyTag: { backgroundColor: Colors.bgDeep, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  specialtyText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
});

const tabSty = StyleSheet.create({
  tab: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  tabLabelActive: { color: "#fff" },
});

const mj = StyleSheet.create({
  wrapper: {
    borderRadius: 20, overflow: "hidden", marginBottom: 4,
    borderWidth: 1, borderColor: "#E74C6F30",
    shadowColor: "#E74C6F", shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 5,
  },
  bg: { padding: 18, gap: 14, position: "relative", overflow: "hidden" },
  dot1: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "#E74C6F08", top: -50, left: -50 },
  dot2: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "#3E9CBF06", bottom: -20, right: 20 },
  topRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  iconBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: "#E74C6F18", borderWidth: 1, borderColor: "#E74C6F30", justifyContent: "center", alignItems: "center" },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#E74C6F18", borderWidth: 1, borderColor: "#E74C6F30", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, marginBottom: 8, alignSelf: "flex-end" },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#E74C6F" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right", lineHeight: 27 },
  featuresList: { gap: 8, paddingRight: 4 },
  featureRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  featureText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  typesRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  typeChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  typeLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  joinBtnWrap: { borderRadius: 14, overflow: "hidden", marginTop: 2 },
  joinBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", paddingVertical: 15, paddingHorizontal: 20, gap: 10 },
  joinBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", flex: 1, textAlign: "center" },
  joinBtnIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  freeNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: -4 },
});

const aptSty = StyleSheet.create({
  bookBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  bookBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", flex: 1, textAlign: "center" },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, gap: 8 },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary },
  cardMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  cardMetaText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  notesRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6 },
  notesText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  field: { gap: 8 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldInput: { backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  timeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  timeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timeChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  submitBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  /* ══ الدفع ══ */
  paySection: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "30", gap: 12,
  },
  payHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  paySectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  payMethods: { flexDirection: "row-reverse", gap: 10 },
  payMethodBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider,
    backgroundColor: Colors.bg, position: "relative",
  },
  payMethodBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  payMethodBtnActiveTransfer: { borderColor: Colors.accent, backgroundColor: Colors.accent + "10" },
  payMethodLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  payMethodCheck: { position: "absolute", top: 7, left: 7 },

  proofBox: {
    backgroundColor: Colors.accent + "08", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "25", gap: 10,
  },
  proofBoxHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  proofBoxTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.accent },
  proofBoxSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  proofPicker: {
    height: 110, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed",
    borderColor: Colors.divider, backgroundColor: Colors.bg,
    justifyContent: "center", alignItems: "center", gap: 6, overflow: "hidden",
  },
  proofThumb: { width: "100%", height: 110, borderRadius: 12 },
  proofPickerText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  uploadBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.accent + "50", backgroundColor: Colors.accent + "10",
  },
  uploadBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.accent },
  uploadDone: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.accent + "15",
  },
  uploadDoneText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.accent },
});

const cSty = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  chipActive: { backgroundColor: "#2E7D9A", borderColor: "#2E7D9A" },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  askBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  askBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", flex: 1, textAlign: "center" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  specBadge: { backgroundColor: "#2E7D9A18", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: "#2E7D9A30", alignSelf: "flex-end" },
  specBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#2E7D9A" },
  question: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  replyCount: { alignItems: "center", minWidth: 44, backgroundColor: Colors.bg, borderRadius: 12, padding: 8, borderWidth: 1, borderColor: Colors.divider },
  replyCountNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },
  replyCountLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  consultBox: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.divider, gap: 10 },
  consultQuestion: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", lineHeight: 24 },
  repliesTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  replyCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider, gap: 8 },
  replyCardSpec: { borderColor: "#2E7D9A40", backgroundColor: "#2E7D9A08" },
  specRibbon: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#2E7D9A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-end" },
  specRibbonText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },
  replyBody: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  replyMeta: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  replyBar: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.cardBg },
  replyInput: { flex: 1, backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#2E7D9A", justifyContent: "center", alignItems: "center" },
});

const spSty = StyleSheet.create({
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardLeft: { alignItems: "center" },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary + "15", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "30" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  specRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  specLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#2E7D9A" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  metaText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  daysRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 5 },
  dayChip: { backgroundColor: Colors.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dayText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.primary },
  callCol: { alignItems: "center", gap: 4 },
  callBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  detailHero: { padding: 20, alignItems: "center", gap: 10 },
  detailAvatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary + "15", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: Colors.primary + "40" },
  detailName: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  detailSection: { gap: 10 },
  detailSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  detailText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  detailKey: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, width: 70, textAlign: "right" },
  detailVal: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  callFullBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: 14, marginTop: 8 },
  callFullBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
