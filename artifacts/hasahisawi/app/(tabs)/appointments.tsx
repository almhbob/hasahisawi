import { withRTLScreen } from "@/components/RTLScope";
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, FlatList,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import GuestGate from "@/components/GuestGate";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/feature-flags-context";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";
import { LoadError, LoadingBlock } from "@/components/ui/LoadState";


// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════
type FacilityCategory = "health" | "government";
type AppStatus = "pending" | "confirmed" | "cancelled";

type BookingFacility = {
  id: string;
  name: string;
  category: FacilityCategory;
  subcategory: string;
  address: string;
  phone: string;
  icon: string;
  color: string;
  services: string[];
  workDays: string;
  hours: string;
};

type Appointment = {
  id: number;
  target_id: string;
  facility_name: string | null;
  target_type: string;
  user_name: string;
  user_phone: string | null;
  appointment_date: string;
  appointment_time: string;
  notes: string | null;
  status: AppStatus;
  created_at: string;
};

// ══════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════
// الجهات تُحمَّل من الخادم (تديرها الإدارة) — لا بيانات وهمية داخل التطبيق
type ApiEntity = { id: number; category: FacilityCategory; name: string; subcategory: string | null; address: string | null; phone: string | null;
  services: string[]; work_days: string | null; hours: string | null; slots: string[]; is_active: boolean };
const ENTITY_STYLE: Record<string, { icon: string; color: string }> = {
  "مستشفى": { icon: "hospital-building", color: "#2E7D9A" }, "عيادة": { icon: "stethoscope", color: "#3B78A6" }, "مركز صحي": { icon: "heart-pulse", color: "#1F8A5B" },
  "صيدلية": { icon: "medical-bag", color: "#0E8A5F" }, "مختبر": { icon: "flask-outline", color: "#6B5B95" },
};
function toFacility(e: ApiEntity): BookingFacility {
  const st = ENTITY_STYLE[e.subcategory || ""] || (e.category === "health" ? { icon: "hospital-building", color: "#2E7D9A" } : { icon: "office-building", color: "#B7791F" });
  return { id: `e${e.id}`, name: e.name, category: e.category, subcategory: e.subcategory || (e.category === "health" ? "مرفق صحي" : "جهة"),
    address: e.address || "", phone: e.phone || "", icon: st.icon, color: st.color, services: e.services?.length ? e.services : ["مراجعة"],
    workDays: e.work_days || "", hours: e.hours || "" } as BookingFacility;
}
const CANCEL_REASONS = ["ظرف طارئ", "تحسّنت الحالة / لم أعد بحاجة للموعد", "حجزت موعداً آخر", "تعذّر الوصول أو المواصلات", "الوقت لم يعد مناسباً", "سبب آخر"];

const TIME_SLOTS = [
  "8:00 ص", "8:30 ص", "9:00 ص", "9:30 ص", "10:00 ص", "10:30 ص",
  "11:00 ص", "11:30 ص", "12:00 م", "12:30 م", "1:00 م", "1:30 م",
  "4:00 م", "4:30 م", "5:00 م", "5:30 م", "6:00 م", "6:30 م",
  "7:00 م", "7:30 م", "8:00 م",
];

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const APPTS_KEY = "appointments_v2_legacy";

function getNextDates(): { label: string; value: string }[] {
  const dates: { label: string; value: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayIdx = d.getDay();
    if (dayIdx === 5) continue; // skip Friday
    const dayName = DAYS[(dayIdx + 1) % 7] ?? DAYS[dayIdx];
    const label = i === 0 ? `اليوم - ${dayName}` : i === 1 ? `غداً - ${dayName}` : `${dayName} ${d.getDate()}/${d.getMonth() + 1}`;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push({ label, value });
  }
  return dates;
}

const STATUS_LABELS: Record<AppStatus, { label: string; color: string; icon: string }> = {
  pending: { label: "بانتظار التأكيد", color: Colors.accent, icon: "time-outline" },
  confirmed: { label: "مؤكد", color: Colors.primary, icon: "checkmark-circle-outline" },
  cancelled: { label: "ملغي", color: Colors.danger, icon: "close-circle-outline" },
};

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
type Step = "category" | "facility" | "service" | "datetime" | "info" | "confirm";

function AppointmentsScreen() {
  const { isGuest, user, token } = useAuth();
  const { gov_appointments_enabled } = useFeatureFlags();
  // Tab: book | my
  const [tab, setTab] = useState<"book" | "my">("book");

  // Booking flow
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<FacilityCategory | null>(null);
  const [facility, setFacility] = useState<BookingFacility | null>(null);
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // تُعبّأ تلقائياً من حساب حصاحيصاوي (يمكن تعديلها عند الحجز لشخص آخر)
  const accountName = user?.name || "";
  const accountPhone = (user as any)?.phone || "";
  const [patientName, setPatientName] = useState(accountName);
  const [phone, setPhone] = useState(accountPhone);
  useEffect(() => {
    if (accountName && !patientName) setPatientName(accountName);
    if (accountPhone && !phone) setPhone(accountPhone);
  }, [accountName, accountPhone]); // eslint-disable-line react-hooks/exhaustive-deps
  const [notes, setNotes] = useState("");

  // My appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptStatus, setApptStatus] = useState<"loading" | "error" | "ok">("loading");
  const [apptFilter, setApptFilter] = useState<AppStatus | "all">("all");
  const [facilities, setFacilities] = useState<BookingFacility[]>([]);
  const [entitiesState, setEntitiesState] = useState<"loading" | "ok" | "error">("loading");
  const [cancelFor, setCancelFor] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");

  const authHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const loadAppointments = async () => {
    if (!user) { setAppointments([]); setApptStatus("ok"); return; }
    setApptStatus("loading");
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/appointments/mine`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments ?? []);
        setApptStatus("ok");
      } else {
        // keep whatever we had; tell the user instead of showing "no appointments"
        setApptStatus("error");
      }
    } catch { setApptStatus("error"); }
  };

  useEffect(() => { loadAppointments(); }, []);
  const loadEntities = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/appointments/entities`);
      const d = await res.json();
      setFacilities((d.entities ?? []).map(toFacility));
      setEntitiesState("ok");
    } catch { setEntitiesState("error"); }
  }, []);
  useEffect(() => { loadEntities(); }, [loadEntities]);
  useFocusEffect(useCallback(() => { loadAppointments(); }, []));

  const resetBooking = () => {
    setStep("category"); setCategory(null); setFacility(null);
    setService(""); setDate(""); setTime("");
    setPatientName(accountName); setPhone(accountPhone); setNotes("");
  };

  const confirmBooking = async () => {
    if (!patientName.trim()) { Alert.alert("تنبيه", "يرجى إدخال الاسم الكامل"); return; }
    if (!phone.trim()) { Alert.alert("تنبيه", "يرجى إدخال رقم الهاتف"); return; }

    try {
      const fullNotes = [
        `الخدمة: ${service}`,
        patientName.trim() && patientName.trim() !== user?.name ? `المريض: ${patientName.trim()}` : null,
        notes.trim() || null,
      ].filter(Boolean).join("\n");

      const res = await fetch(`${getApiUrl()}/api/appointments/book`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          target_type:      facility!.category,
          target_id:        facility!.id,
          facility_name:    facility!.name,
          appointment_date: date,
          appointment_time: time,
          notes:            fullNotes,
          user_phone:       phone.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.error || "فشل الحجز");
      }

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadAppointments();
      resetBooking();
      setTab("my");
      Alert.alert("✅ تم الحجز!", `تم إرسال طلب موعدك في ${facility!.name}\nيوم ${date} الساعة ${time}\nسيتم التواصل معك للتأكيد`);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message || "تعذّر حفظ الموعد، تحقق من الاتصال");
    }
  };

  const cancelAppointment = (id: number) => { setCancelFor(id); setCancelReason(""); setCancelNote(""); };
  const submitCancel = async () => {
    if (!cancelFor || !cancelReason) { Alert.alert("سبب الإلغاء", "اختر سبب الإلغاء ليصل للجهة"); return; }
    const reason = cancelNote.trim() ? `${cancelReason} — ${cancelNote.trim()}` : cancelReason;
    try {
      const res = await fetch(`${getApiUrl()}/api/appointments/${cancelFor}/cancel`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ reason }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as any)?.error || "تعذّر الإلغاء");
      setAppointments(prev => prev.map(a => a.id === cancelFor ? { ...a, status: "cancelled" as AppStatus, cancel_reason: reason } as any : a));
      setCancelFor(null);
    } catch (e: any) { Alert.alert("خطأ", e?.message || "تعذّر الإلغاء"); }
  };

  const filteredAppts = appointments.filter(a => apptFilter === "all" || a.status === apptFilter);

  const healthFacilities = facilities.filter(f => f.category === "health");
  const govFacilities = facilities.filter(f => f.category === "government");

  if (isGuest) {
    return (
      <GuestGate
        title="حجز المواعيد للأعضاء فقط"
        features={[
          { icon: "calendar-outline",    text: "احجز مواعيد في المرافق الصحية" },
          { icon: "business-outline",    text: "تعامل مع الدوائر الحكومية بسهولة" },
          { icon: "notifications-outline", text: "تلقّ تذكيرات بمواعيدك" },
          { icon: "list-outline",        text: "تابع حالة طلباتك ومواعيدك" },
        ]}
      />
    );
  }

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <ModernHeader
        title="حجز المواعيد"
        subtitle="المرافق الصحية والحكومية"
        icon="calendar"
        rightSlot={
          tab === "book" && step !== "category" ? (
            <TouchableOpacity onPress={resetBooking} style={s.resetBtn}>
              <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
              <Text style={s.resetBtnText}>بداية</Text>
            </TouchableOpacity>
          ) : undefined
        }
      >
        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === "book" && s.tabBtnActive]}
            onPress={() => setTab("book")}
          >
            {tab === "book" && (
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />
            )}
            <Ionicons name="add-circle-outline" size={16} color={tab === "book" ? "#000" : "rgba(255,255,255,0.85)"} />
            <Text style={[s.tabBtnText, tab === "book" && { color: Colors.text }]}>حجز جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "my" && s.tabBtnActive]}
            onPress={() => setTab("my")}
          >
            {tab === "my" && (
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />
            )}
            <View style={{ position: "relative" }}>
              <Ionicons name="calendar-outline" size={16} color={tab === "my" ? "#000" : "rgba(255,255,255,0.85)"} />
              {appointments.filter(a => a.status === "pending").length > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{appointments.filter(a => a.status === "pending").length}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabBtnText, tab === "my" && { color: Colors.text }]}>مواعيدي</Text>
          </TouchableOpacity>
        </View>
      </ModernHeader>

      {/* ═══════════════ TAB: BOOK ═══════════════ */}
      {tab === "book" && (
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 120, padding: 16 }} showsVerticalScrollIndicator={false}>

          {/* Progress */}
          <View style={s.progressRow}>
            {(["category", "facility", "service", "datetime", "info", "confirm"] as Step[]).map((st, i) => (
              <View
                key={st}
                style={[
                  s.progressDot,
                  step === st && { backgroundColor: Colors.primary, transform: [{ scale: 1.3 }] },
                  ["category", "facility", "service", "datetime", "info", "confirm"].indexOf(step) > i
                    && { backgroundColor: Colors.primaryDim },
                ]}
              />
            ))}
          </View>

          {/* STEP 1: اختيار الفئة */}
          {step === "category" && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <Text style={s.stepTitle}>اختر نوع الخدمة</Text>

              <CategoryCard color="#2E7D9A" icon="hospital-building" title="المرافق الصحية" sub="مستشفيات · عيادات · مراكز صحية"
                count={entitiesState === "loading" ? "…" : `${healthFacilities.length} ${healthFacilities.length === 1 ? "مرفق" : "مرافق"} متاحة`}
                onPress={() => { setCategory("health"); setStep("facility"); }} />

              {gov_appointments_enabled && (
                <>
                  <CategoryCard color="#B7791F" icon="office-building" title="الجهات والمرافق المحلية" sub="محلية · سجل مدني · أراضي · قضاء"
                    count={entitiesState === "loading" ? "…" : `${govFacilities.length} ${govFacilities.length === 1 ? "جهة" : "جهات"} متاحة`}
                    onPress={() => { setCategory("government"); setStep("facility"); }} />

                  <View style={[s.infoBox, { backgroundColor: "#6B728012", borderColor: "#6B728030" }]}>
                    <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
                    <Text style={[s.infoText, { color: Colors.textSecondary }]}>حصاحيصاوي منصة مجتمعية مستقلة وغير تابعة لأي جهة حكومية. البيانات للإرشاد فقط.</Text>
                  </View>
                </>
              )}

              <View style={s.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.infoText}>بعد الحجز ستتلقى تأكيداً هاتفياً من الجهة خلال ٢٤ ساعة</Text>
              </View>
            </Animated.View>
          )}

          {/* STEP 2: اختيار المرفق */}
          {step === "facility" && category && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 12 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("category")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>اختر المرفق</Text>
              </View>
              {(category === "health" ? healthFacilities : govFacilities).length === 0 && (
                <View style={[s.infoBox, { flexDirection: "column", alignItems: "center", paddingVertical: 24 }]}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={40} color={Colors.textMuted} />
                  <Text style={[s.infoText, { textAlign: "center", fontFamily: "Cairo_700Bold", color: Colors.textPrimary }]}>لا توجد جهات متاحة للحجز بعد</Text>
                  <Text style={[s.infoText, { textAlign: "center" }]}>تُضاف المرافق المعتمدة فقط بعد التحقق منها. إن كنت تدير منشأة، قدّم طلب انضمام من الدليل الطبي.</Text>
                </View>
              )}
              {(category === "health" ? healthFacilities : govFacilities).map((f, i) => (
                <Animated.View key={f.id} entering={FadeInDown.delay(i * 60).springify()}>
                  <AnimatedPress onPress={() => { setFacility(f); setStep("service"); }}>
                    <View style={[s.facilityCard, { borderColor: f.color + "30" }]}>
                      <LinearGradient colors={[f.color + "10", "transparent"]} style={StyleSheet.absoluteFill} />
                      <View style={[s.facilityIcon, { backgroundColor: f.color + "20" }]}>
                        <MaterialCommunityIcons name={f.icon as any} size={26} color={f.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.facilityName}>{f.name}</Text>
                        <Text style={s.facilitySub}>{f.subcategory} · {f.hours}</Text>
                        <Text style={s.facilityAddress} numberOfLines={1}>📍 {f.address}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={f.color} />
                    </View>
                  </AnimatedPress>
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* STEP 3: اختيار الخدمة */}
          {step === "service" && facility && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 14 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("facility")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>اختر الخدمة</Text>
              </View>

              <View style={[s.facilityBanner, { borderColor: facility.color + "40" }]}>
                <LinearGradient colors={[facility.color + "18", "transparent"]} style={StyleSheet.absoluteFill} />
                <MaterialCommunityIcons name={facility.icon as any} size={22} color={facility.color} />
                <View>
                  <Text style={s.facilityBannerName}>{facility.name}</Text>
                  <Text style={s.facilityBannerSub}>{facility.workDays} · {facility.hours}</Text>
                </View>
              </View>

              <Text style={s.sectionLabel}>الخدمات المتاحة</Text>
              {facility.services.map((svc, i) => (
                <Animated.View key={svc} entering={FadeInDown.delay(i * 50)}>
                  <AnimatedPress onPress={() => { setService(svc); setStep("datetime"); }}>
                    <View style={[s.serviceItem, service === svc && { borderColor: Colors.primary }]}>
                      {service === svc && <LinearGradient colors={[Colors.primary + "18", "transparent"]} style={StyleSheet.absoluteFill} />}
                      <View style={s.serviceIcon}>
                        <Ionicons name="chevron-back" size={14} color={Colors.primary} />
                      </View>
                      <Text style={s.serviceText}>{svc}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                    </View>
                  </AnimatedPress>
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* STEP 4: التاريخ والوقت */}
          {step === "datetime" && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("service")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>اختر الموعد</Text>
              </View>

              <Text style={s.sectionLabel}>التاريخ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 10, paddingBottom: 4 }}>
                  {getNextDates().map((d) => (
                    <TouchableOpacity
                      key={d.value}
                      style={[s.dateChip, date === d.value && s.dateChipActive]}
                      onPress={() => setDate(d.value)}
                    >
                      {date === d.value && <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />}
                      <Text style={[s.dateChipText, date === d.value && { color: Colors.text }]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {date !== "" && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <Text style={s.sectionLabel}>الوقت</Text>
                  <View style={s.timeGrid}>
                    {TIME_SLOTS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[s.timeChip, time === t && s.timeChipActive]}
                        onPress={() => setTime(t)}
                      >
                        {time === t && <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />}
                        <Text style={[s.timeChipText, time === t && { color: Colors.text }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Animated.View>
              )}

              {date && time && (
                <Animated.View entering={FadeInUp.springify()}>
                  <TouchableOpacity onPress={() => setStep("info")}>
                    <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.nextBtn}>
                      <Text style={s.nextBtnText}>التالي — بيانات المريض</Text>
                      <Ionicons name="arrow-forward" size={18} color={Colors.text} />
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </Animated.View>
          )}

          {/* STEP 5: بيانات المريض */}
          {step === "info" && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("datetime")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>بيانات المراجع</Text>
              </View>

              {[
                { label: "الاسم الكامل *", placeholder: "أدخل اسمك الكامل", value: patientName, onChange: setPatientName, keyboard: "default" as const, icon: "person-outline" },
                { label: "رقم الهاتف *", placeholder: "09xxxxxxxx", value: phone, onChange: setPhone, keyboard: "phone-pad" as const, icon: "call-outline" },
              ].map((field) => (
                <View key={field.label} style={s.fieldBlock}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <View style={s.fieldWrap}>
                    <Ionicons name={field.icon as any} size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                    <TextInput
                      style={s.field}
                      placeholder={field.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      value={field.value}
                      onChangeText={field.onChange}
                      keyboardType={field.keyboard}
                      textAlign="right"
                    />
                  </View>
                </View>
              ))}

              <View style={s.fieldBlock}>
                <Text style={s.fieldLabel}>ملاحظات (اختياري)</Text>
                <View style={[s.fieldWrap, { alignItems: "flex-start", paddingTop: 10 }]}>
                  <TextInput
                    style={[s.field, { height: 80, textAlignVertical: "top" }]}
                    placeholder="أي ملاحظات إضافية للطاقم الطبي..."
                    placeholderTextColor={Colors.textMuted}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    textAlign="right"
                  />
                </View>
              </View>

              <TouchableOpacity onPress={() => { if (patientName && phone) setStep("confirm"); else Alert.alert("تنبيه", "يرجى ملء الحقول المطلوبة"); }}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.nextBtn}>
                  <Text style={s.nextBtnText}>التالي — مراجعة الحجز</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.text} />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* STEP 6: تأكيد */}
          {step === "confirm" && facility && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("info")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>مراجعة وتأكيد</Text>
              </View>

              <LinearGradient
                colors={[Colors.primary + "18", Colors.accent + "10"]}
                style={s.summaryCard}
              >
                <View style={s.summaryRow}><Text style={s.summaryKey}>المرفق</Text><Text style={s.summaryVal}>{facility.name}</Text></View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}><Text style={s.summaryKey}>الخدمة</Text><Text style={s.summaryVal}>{service}</Text></View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}><Text style={s.summaryKey}>التاريخ</Text><Text style={s.summaryVal}>{date}</Text></View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}><Text style={s.summaryKey}>الوقت</Text><Text style={s.summaryVal}>{time}</Text></View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}><Text style={s.summaryKey}>الاسم</Text><Text style={s.summaryVal}>{patientName}</Text></View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}><Text style={s.summaryKey}>الهاتف</Text><Text style={s.summaryVal}>{phone}</Text></View>
                {notes ? <><View style={s.summaryDivider} /><View style={s.summaryRow}><Text style={s.summaryKey}>ملاحظات</Text><Text style={s.summaryVal}>{notes}</Text></View></> : null}
              </LinearGradient>

              <View style={s.warningBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
                <Text style={s.warningText}>سيتم التواصل معك على الرقم المُدخل لتأكيد الموعد خلال ٢٤ ساعة</Text>
              </View>

              <TouchableOpacity onPress={confirmBooking}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.confirmBtn}>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.text} />
                  <Text style={s.confirmBtnText}>تأكيد الحجز</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ═══════════════ TAB: MY APPOINTMENTS ═══════════════ */}
      {tab === "my" && (
        <View style={{ flex: 1 }}>
          {/* Filter bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {([["all", "الكل"], ["pending", "بانتظار التأكيد"], ["confirmed", "مؤكدة"], ["cancelled", "ملغاة"]] as [AppStatus | "all", string][]).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[s.filterChip, apptFilter === k && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => setApptFilter(k)}
              >
                <Text style={[s.filterChipText, apptFilter === k && { color: Colors.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filteredAppts.length === 0 && apptStatus === "loading" && <LoadingBlock label="جارٍ تحميل مواعيدك…" />}
            {filteredAppts.length === 0 && apptStatus === "error" && <LoadError onRetry={loadAppointments} message="تعذّر تحميل مواعيدك" />}
            {filteredAppts.length === 0 && apptStatus === "ok" && (
              <Animated.View entering={FadeIn.duration(400)} style={s.emptyState}>
                <Ionicons name="calendar-outline" size={56} color={Colors.primary + "60"} />
                <Text style={s.emptyTitle}>لا توجد مواعيد</Text>
                <Text style={s.emptySub}>اضغط على "حجز جديد" لإضافة موعدك الأول</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={() => setTab("book")}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.emptyBtnGrad}>
                    <Text style={s.emptyBtnText}>احجز موعداً الآن</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {filteredAppts.map((appt, i) => {
              const st = STATUS_LABELS[appt.status];
              return (
                <Animated.View key={appt.id} entering={FadeInDown.delay(i * 60).springify()}>
                  <View style={[s.apptCard, { borderColor: st.color + "30" }]}>
                    <LinearGradient colors={[st.color + "0A", "transparent"]} style={StyleSheet.absoluteFill} />
                    <View style={s.apptHeader}>
                      <View style={[s.apptStatus, { backgroundColor: st.color + "20", borderColor: st.color + "40" }]}>
                        <Ionicons name={st.icon as any} size={13} color={st.color} />
                        <Text style={[s.apptStatusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <Text style={s.apptFacility}>{appt.facility_name || appt.target_id}</Text>
                    </View>
                    <View style={s.apptBody}>
                      {[
                        { icon: "medical-bag",      label: appt.notes?.split("\n")[0]?.replace("الخدمة: ", "") ?? "" },
                        { icon: "calendar-outline", label: `${appt.appointment_date} — ${appt.appointment_time}` },
                        { icon: "person-outline",   label: appt.user_name },
                        { icon: "call-outline",     label: appt.user_phone ?? "" },
                      ].map((row, ri) => (
                        <View key={ri} style={s.apptRow}>
                          <Text style={s.apptRowVal}>{row.label}</Text>
                          <Ionicons name={row.icon as any} size={14} color={Colors.textMuted} />
                        </View>
                      ))}
                    </View>
                    {appt.status === "cancelled" && !!(appt as any).cancel_reason && (
                      <View style={[s.apptRow, { backgroundColor: Colors.danger + "0D", borderRadius: 10, padding: 8, marginTop: 6 }]}>
                        <Text style={[s.apptRowVal, { color: Colors.danger }]}>سبب الإلغاء{(appt as any).cancelled_by === "admin" ? " (من الجهة)" : ""}: {(appt as any).cancel_reason}</Text>
                        <Ionicons name="information-circle-outline" size={14} color={Colors.danger} />
                      </View>
                    )}
                    {appt.status !== "cancelled" && (appt.status as string) !== "completed" && (
                      <TouchableOpacity style={s.cancelBtn} onPress={() => cancelAppointment(appt.id as number)}>
                        <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                        <Text style={s.cancelBtnText}>إلغاء الموعد</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              );
            })}
                  <OrgInviteCard />
</ScrollView>
        </View>
      )}

      {/* ورقة إلغاء الموعد مع السبب */}
      <Modal visible={cancelFor !== null} transparent animationType="slide" onRequestClose={() => setCancelFor(null)}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>إلغاء الموعد</Text>
            <Text style={s.sheetSub}>اختر السبب — يصل للجهة حتى تتيح الموعد لغيرك</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {CANCEL_REASONS.map((r) => (
                <TouchableOpacity key={r} onPress={() => setCancelReason(r)} style={[s.reasonRow, cancelReason === r && { borderColor: Colors.danger, backgroundColor: Colors.danger + "0D" }]}>
                  <Text style={[s.reasonText, cancelReason === r && { color: Colors.danger }]}>{r}</Text>
                  <Ionicons name={cancelReason === r ? "radio-button-on" : "radio-button-off"} size={20} color={cancelReason === r ? Colors.danger : Colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={cancelNote} onChangeText={setCancelNote} placeholder={cancelReason === "سبب آخر" ? "اكتب السبب" : "توضيح إضافي (اختياري)"} placeholderTextColor={Colors.textMuted}
              style={s.reasonInput} multiline maxLength={200} textAlign="right" />
            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={submitCancel} style={[s.sheetBtn, { backgroundColor: Colors.danger, opacity: cancelReason && (cancelReason !== "سبب آخر" || cancelNote.trim()) ? 1 : 0.5 }]}
                disabled={!cancelReason || (cancelReason === "سبب آخر" && !cancelNote.trim())}>
                <Text style={s.sheetBtnText}>تأكيد الإلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCancelFor(null)} style={[s.sheetBtn, { backgroundColor: Colors.divider }]}>
                <Text style={[s.sheetBtnText, { color: Colors.textPrimary }]}>تراجع</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// بطاقة نوع الخدمة — بطاقة صلبة واضحة (كانت تدرّجاً شفافاً مع ظل يرسم إطاراً رمادياً مزدوجاً على أندرويد)
function CategoryCard({ color, icon, title, sub, count, onPress }: { color: string; icon: string; title: string; sub: string; count: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.catCard, { borderColor: color + "33" }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[s.catAccent, { backgroundColor: color }]} />
      <View style={[s.catIcon, { backgroundColor: color + "14" }]}>
        <MaterialCommunityIcons name={icon as any} size={32} color={color} />
      </View>
      <View style={s.catInfo}>
        <Text style={s.catTitle}>{title}</Text>
        <Text style={s.catSub}>{sub}</Text>
        <View style={[s.catCount, { backgroundColor: color + "12" }]}>
          <Text style={[s.catCountText, { color }]}>{count}</Text>
        </View>
      </View>
      <Ionicons name="chevron-back" size={20} color={color} />
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sheetSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider },
  reasonText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  reasonInput: { marginTop: 10, minHeight: 56, borderWidth: 1, borderColor: Colors.divider, borderRadius: 14, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlignVertical: "top" },
  sheetBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Header
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: Colors.radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  resetBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  tabRow: { flexDirection: "row", gap: 10 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: Colors.radius.md, overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  tabBtnActive: { borderColor: "rgba(255,255,255,0.7)" },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.85)" },
  badge: { position: "absolute", top: -5, right: -8, backgroundColor: Colors.danger, borderRadius: Colors.radius.sm, width: 16, height: 16, justifyContent: "center", alignItems: "center" },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" },

  body: { flex: 1 },

  // Progress
  progressRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.divider },

  // Step titles
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  stepHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { width: 36, height: 36, borderRadius: Colors.radius.sm, backgroundColor: Colors.primary + "20", justifyContent: "center", alignItems: "center" },

  // Category cards
  catCard: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingStart: 20,
    borderRadius: 20, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  catAccent: { position: "absolute", top: 0, bottom: 0, right: 0, width: 4 },
  catIcon: { width: 64, height: 64, borderRadius: Colors.radius.lg, justifyContent: "center", alignItems: "center" },
  catInfo: { flex: 1, gap: 4 },
  catTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  catSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  catCount: { marginTop: 4, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 },
  catCountText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, textAlign: "right" },

  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.primary + "10", borderRadius: Colors.radius.md, padding: 14, borderWidth: 1, borderColor: Colors.primary + "30" },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  // Facility card
  facilityCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: Colors.radius.lg, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden",
    ...Colors.shadow.card,
  },
  facilityIcon: { width: 50, height: 50, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center" },
  facilityName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  facilitySub: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  facilityAddress: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },

  // Facility banner
  facilityBanner: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: Colors.radius.md, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  facilityBannerName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  facilityBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },

  // Services
  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  serviceItem: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
    borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  serviceIcon: { width: 28, height: 28, borderRadius: Colors.radius.sm - 2, backgroundColor: Colors.primary + "20", justifyContent: "center", alignItems: "center" },
  serviceText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },

  // Date
  dateChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Colors.radius.md,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  dateChipActive: { borderColor: Colors.primary },
  dateChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  // Time
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Colors.radius.sm,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  timeChipActive: { borderColor: Colors.primary },
  timeChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Next btn
  nextBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: Colors.radius.lg, paddingVertical: 16, marginTop: 8,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },

  // Fields
  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.divider, borderRadius: Colors.radius.md, backgroundColor: Colors.cardBg },
  field: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 13, paddingHorizontal: 12 },

  // Summary
  summaryCard: { borderRadius: Colors.radius.xl, padding: 18, gap: 0, borderWidth: 1, borderColor: Colors.primary + "30" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  summaryKey: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary },
  summaryVal: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", flex: 1, marginRight: 12 },
  summaryDivider: { height: 1, backgroundColor: Colors.divider },

  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.accent + "12", borderRadius: Colors.radius.md, padding: 14, borderWidth: 1, borderColor: Colors.accent + "30" },
  warningText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: Colors.radius.lg, paddingVertical: 17,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  confirmBtnText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text },

  // Filter bar
  filterBar: { maxHeight: 56 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Colors.radius.pill, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Appointment card
  apptCard: { borderRadius: Colors.radius.lg, padding: 16, borderWidth: 1, backgroundColor: Colors.cardBg, gap: 12, overflow: "hidden", ...Colors.shadow.card },
  apptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  apptFacility: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", flex: 1, marginRight: 8 },
  apptStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: Colors.radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  apptStatusText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  apptBody: { gap: 8 },
  apptRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  apptRowVal: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flex: 1, marginLeft: 8 },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: Colors.radius.sm, paddingVertical: 10, backgroundColor: Colors.danger + "12", borderWidth: 1, borderColor: Colors.danger + "30" },
  cancelBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: { marginTop: 8 },
  emptyBtnGrad: { borderRadius: Colors.radius.lg, paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
});

export default withRTLScreen(AppointmentsScreen);
