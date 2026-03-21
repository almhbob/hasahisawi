import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

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
  id: string;
  facilityId: string;
  facilityName: string;
  facilityCategory: FacilityCategory;
  service: string;
  patientName: string;
  phone: string;
  date: string;
  time: string;
  notes: string;
  status: AppStatus;
  createdAt: string;
};

// ══════════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════════
const FACILITIES: BookingFacility[] = [
  // ── صحية ──
  {
    id: "f1", name: "مستشفى حصاحيصا الحكومي",
    category: "health", subcategory: "مستشفى",
    address: "المنطقة المركزية، حصاحيصا", phone: "+249912345682",
    icon: "hospital-building", color: "#3E9CBF",
    services: ["طوارئ", "جراحة عامة", "أطفال", "نساء وتوليد", "باطنية", "أشعة وتحاليل"],
    workDays: "السبت - الخميس", hours: "24 ساعة",
  },
  {
    id: "f2", name: "مستشفى الخيرية الأهلي",
    category: "health", subcategory: "مستشفى",
    address: "حي السلام، حصاحيصا", phone: "+249912345683",
    icon: "hospital-building", color: "#3E9CBF",
    services: ["باطنية", "أطفال", "تحاليل مخبرية", "مراجعة عامة"],
    workDays: "السبت - الخميس", hours: "7ص - 5م",
  },
  {
    id: "f3", name: "عيادة الدكتور أحمد - طب عام",
    category: "health", subcategory: "عيادة",
    address: "شارع النيل، حصاحيصا", phone: "+249912345684",
    icon: "stethoscope", color: "#A855F7",
    services: ["مراجعة طب عام", "متابعة مزمن", "شهادة صحية"],
    workDays: "السبت - الخميس", hours: "4م - 9م",
  },
  {
    id: "f4", name: "عيادة الأطفال المتخصصة",
    category: "health", subcategory: "عيادة",
    address: "الحي الغربي، حصاحيصا", phone: "+249912345685",
    icon: "stethoscope", color: "#A855F7",
    services: ["متابعة أطفال", "تطعيمات", "استشارة طبية"],
    workDays: "السبت - الخميس", hours: "5م - 9م",
  },
  {
    id: "f5", name: "مركز صحة الأسرة",
    category: "health", subcategory: "مركز صحي",
    address: "حي الضحى، حصاحيصا", phone: "+249912345686",
    icon: "heart-pulse", color: "#27AE68",
    services: ["رعاية الأم والطفل", "تخطيط الأسرة", "تطعيمات", "صحة المدرسة"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
  // ── حكومية ──
  {
    id: "g1", name: "محلية حصاحيصا",
    category: "government", subcategory: "محلية",
    address: "مقر المحلية، حصاحيصا", phone: "+249912345690",
    icon: "office-building", color: "#F0A500",
    services: ["تسجيل عقارات", "رخص تشغيل", "شهادات إقامة", "تسجيل مواليد", "دفن الموتى", "خدمات عامة"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
  {
    id: "g2", name: "سجل مدني - حصاحيصا",
    category: "government", subcategory: "سجل مدني",
    address: "مبنى السجل المدني، حصاحيصا", phone: "+249912345691",
    icon: "card-account-details", color: "#F0A500",
    services: ["استخراج بطاقة شخصية", "تجديد بطاقة", "شهادة ميلاد", "شهادة زواج", "شهادة وفاة"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
  {
    id: "g3", name: "مكتب الأراضي والتخطيط",
    category: "government", subcategory: "أراضي",
    address: "مجمع الدوائر الحكومية، حصاحيصا", phone: "+249912345692",
    icon: "map-marker-radius", color: "#FF6B35",
    services: ["تسجيل قطعة", "استخراج شهادة حيازة", "رسم خرائط", "تقسيم أراضي"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
  {
    id: "g4", name: "المحكمة العامة",
    category: "government", subcategory: "قضاء",
    address: "مبنى المحكمة، حصاحيصا", phone: "+249912345693",
    icon: "scale-balance", color: "#6B7280",
    services: ["حضور جلسة", "تقديم دعوى", "طلب وثائق قانونية", "توثيق عقود"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
  {
    id: "g5", name: "مكتب الشؤون الاجتماعية",
    category: "government", subcategory: "اجتماعي",
    address: "مجمع الخدمات، حصاحيصا", phone: "+249912345694",
    icon: "account-group", color: "#27AE68",
    services: ["طلب إعانة", "تسجيل أسرة", "شهادة عوز", "خدمات ذوي الإعاقة"],
    workDays: "السبت - الخميس", hours: "8ص - 2م",
  },
];

const TIME_SLOTS = [
  "8:00 ص", "8:30 ص", "9:00 ص", "9:30 ص", "10:00 ص", "10:30 ص",
  "11:00 ص", "11:30 ص", "12:00 م", "12:30 م", "1:00 م", "1:30 م",
  "4:00 م", "4:30 م", "5:00 م", "5:30 م", "6:00 م", "6:30 م",
  "7:00 م", "7:30 م", "8:00 م",
];

const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

const APPTS_KEY = "appointments_v2";

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

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Tab: book | my
  const [tab, setTab] = useState<"book" | "my">("book");

  // Booking flow
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<FacilityCategory | null>(null);
  const [facility, setFacility] = useState<BookingFacility | null>(null);
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // My appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptFilter, setApptFilter] = useState<AppStatus | "all">("all");

  const loadAppointments = async () => {
    const raw = await AsyncStorage.getItem(APPTS_KEY);
    setAppointments(raw ? JSON.parse(raw) : []);
  };

  useEffect(() => { loadAppointments(); }, []);
  useFocusEffect(useCallback(() => { loadAppointments(); }, []));

  const resetBooking = () => {
    setStep("category"); setCategory(null); setFacility(null);
    setService(""); setDate(""); setTime("");
    setPatientName(""); setPhone(""); setNotes("");
  };

  const confirmBooking = async () => {
    if (!patientName.trim()) { Alert.alert("تنبيه", "يرجى إدخال الاسم الكامل"); return; }
    if (!phone.trim()) { Alert.alert("تنبيه", "يرجى إدخال رقم الهاتف"); return; }

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newAppt: Appointment = {
      id: Date.now().toString(),
      facilityId: facility!.id,
      facilityName: facility!.name,
      facilityCategory: facility!.category,
      service, patientName: patientName.trim(),
      phone: phone.trim(), date, time, notes: notes.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const existing = await AsyncStorage.getItem(APPTS_KEY);
    const all: Appointment[] = existing ? JSON.parse(existing) : [];
    all.unshift(newAppt);
    await AsyncStorage.setItem(APPTS_KEY, JSON.stringify(all));
    setAppointments(all);
    resetBooking();
    setTab("my");
    Alert.alert("✅ تم الحجز!", `تم إرسال طلب موعدك في ${facility!.name}\nيوم ${date} الساعة ${time}\nسيتم التواصل معك للتأكيد`);
  };

  const cancelAppointment = async (id: string) => {
    Alert.alert("إلغاء الموعد", "هل تريد إلغاء هذا الموعد؟", [
      { text: "لا", style: "cancel" },
      {
        text: "نعم، ألغِ", style: "destructive", onPress: async () => {
          const updated = appointments.map(a => a.id === id ? { ...a, status: "cancelled" as AppStatus } : a);
          setAppointments(updated);
          await AsyncStorage.setItem(APPTS_KEY, JSON.stringify(updated));
        }
      }
    ]);
  };

  const filteredAppts = appointments.filter(a => apptFilter === "all" || a.status === apptFilter);

  const healthFacilities = FACILITIES.filter(f => f.category === "health");
  const govFacilities = FACILITIES.filter(f => f.category === "government");

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[Colors.cardBg, Colors.bg]}
        style={[s.header, { paddingTop: topPad + 12 }]}
      >
        <View style={s.headerTop}>
          <LinearGradient
            colors={[Colors.primary + "25", Colors.accent + "18"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.headerIcon}
          >
            <Ionicons name="calendar" size={22} color={Colors.primary} />
          </LinearGradient>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={s.headerTitle}>حجز المواعيد</Text>
            <Text style={s.headerSub}>المرافق الصحية والحكومية</Text>
          </View>
          {tab === "book" && step !== "category" && (
            <TouchableOpacity onPress={resetBooking} style={s.resetBtn}>
              <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
              <Text style={s.resetBtnText}>بداية</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tabBtn, tab === "book" && s.tabBtnActive]}
            onPress={() => setTab("book")}
          >
            {tab === "book" && (
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />
            )}
            <Ionicons name="add-circle-outline" size={16} color={tab === "book" ? "#000" : Colors.textSecondary} />
            <Text style={[s.tabBtnText, tab === "book" && { color: "#000" }]}>حجز جديد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === "my" && s.tabBtnActive]}
            onPress={() => setTab("my")}
          >
            {tab === "my" && (
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={StyleSheet.absoluteFill} />
            )}
            <View style={{ position: "relative" }}>
              <Ionicons name="calendar-outline" size={16} color={tab === "my" ? "#000" : Colors.textSecondary} />
              {appointments.filter(a => a.status === "pending").length > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{appointments.filter(a => a.status === "pending").length}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabBtnText, tab === "my" && { color: "#000" }]}>مواعيدي</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

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

              <AnimatedPress onPress={() => { setCategory("health"); setStep("facility"); }}>
                <LinearGradient
                  colors={["#3E9CBF18", "#3E9CBF08"]}
                  style={[s.catCard, { borderColor: "#3E9CBF40" }]}
                >
                  <View style={[s.catIcon, { backgroundColor: "#3E9CBF20" }]}>
                    <MaterialCommunityIcons name="hospital-building" size={36} color="#3E9CBF" />
                  </View>
                  <View style={s.catInfo}>
                    <Text style={s.catTitle}>المرافق الصحية</Text>
                    <Text style={s.catSub}>مستشفيات · عيادات · مراكز صحية</Text>
                    <View style={s.catCount}>
                      <Text style={[s.catCountText, { color: "#3E9CBF" }]}>{healthFacilities.length} مرافق متاحة</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#3E9CBF" />
                </LinearGradient>
              </AnimatedPress>

              <AnimatedPress onPress={() => { setCategory("government"); setStep("facility"); }}>
                <LinearGradient
                  colors={[Colors.accent + "18", Colors.accent + "08"]}
                  style={[s.catCard, { borderColor: Colors.accent + "40" }]}
                >
                  <View style={[s.catIcon, { backgroundColor: Colors.accent + "20" }]}>
                    <MaterialCommunityIcons name="office-building" size={36} color={Colors.accent} />
                  </View>
                  <View style={s.catInfo}>
                    <Text style={s.catTitle}>الجهات الحكومية</Text>
                    <Text style={s.catSub}>محلية · سجل مدني · أراضي · قضاء</Text>
                    <View style={s.catCount}>
                      <Text style={[s.catCountText, { color: Colors.accent }]}>{govFacilities.length} جهات متاحة</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={Colors.accent} />
                </LinearGradient>
              </AnimatedPress>

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
                      <Text style={[s.dateChipText, date === d.value && { color: "#000" }]}>{d.label}</Text>
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
                        <Text style={[s.timeChipText, time === t && { color: "#000" }]}>{t}</Text>
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
                      <Ionicons name="arrow-forward" size={18} color="#000" />
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
                  <Ionicons name="arrow-forward" size={18} color="#000" />
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
                  <Ionicons name="checkmark-circle" size={22} color="#000" />
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
                <Text style={[s.filterChipText, apptFilter === k && { color: "#000" }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filteredAppts.length === 0 && (
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
                      <Text style={s.apptFacility}>{appt.facilityName}</Text>
                    </View>
                    <View style={s.apptBody}>
                      {[
                        { icon: "medical-bag", label: appt.service },
                        { icon: "calendar-outline", label: `${appt.date} — ${appt.time}` },
                        { icon: "person-outline", label: appt.patientName },
                        { icon: "call-outline", label: appt.phone },
                      ].map((row, ri) => (
                        <View key={ri} style={s.apptRow}>
                          <Text style={s.apptRowVal}>{row.label}</Text>
                          <Ionicons name={row.icon as any} size={14} color={Colors.textMuted} />
                        </View>
                      ))}
                    </View>
                    {appt.status !== "cancelled" && (
                      <TouchableOpacity style={s.cancelBtn} onPress={() => cancelAppointment(appt.id)}>
                        <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                        <Text style={s.cancelBtnText}>إلغاء الموعد</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "40" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.accent + "20", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  resetBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.accent },
  tabRow: { flexDirection: "row", gap: 10, paddingBottom: 16 },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 11, borderRadius: 14, overflow: "hidden",
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  tabBtnActive: { borderColor: Colors.primary + "60" },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  badge: { position: "absolute", top: -5, right: -8, backgroundColor: Colors.danger, borderRadius: 8, width: 16, height: 16, justifyContent: "center", alignItems: "center" },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" },

  body: { flex: 1 },

  // Progress
  progressRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.divider },

  // Step titles
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  stepHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "20", justifyContent: "center", alignItems: "center" },

  // Category cards
  catCard: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 18,
    borderRadius: 20, borderWidth: 1, overflow: "hidden",
  },
  catIcon: { width: 64, height: 64, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  catInfo: { flex: 1, gap: 4 },
  catTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  catSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  catCount: { marginTop: 4 },
  catCountText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right" },

  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + "30" },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  // Facility card
  facilityCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 16, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  facilityIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  facilityName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  facilitySub: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  facilityAddress: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  // Facility banner
  facilityBanner: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  facilityBannerName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  facilityBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },

  // Services
  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  serviceItem: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  serviceIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + "20", justifyContent: "center", alignItems: "center" },
  serviceText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },

  // Date
  dateChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  dateChipActive: { borderColor: Colors.primary },
  dateChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  // Time
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  timeChipActive: { borderColor: Colors.primary },
  timeChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Next btn
  nextBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 16, marginTop: 8,
  },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#000" },

  // Fields
  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14, backgroundColor: Colors.cardBg },
  field: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 13, paddingHorizontal: 12 },

  // Summary
  summaryCard: { borderRadius: 20, padding: 18, gap: 0, borderWidth: 1, borderColor: Colors.primary + "30" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  summaryKey: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary },
  summaryVal: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", flex: 1, marginRight: 12 },
  summaryDivider: { height: 1, backgroundColor: Colors.divider },

  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.accent + "12", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.accent + "30" },
  warningText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 16, paddingVertical: 17,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  confirmBtnText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#000" },

  // Filter bar
  filterBar: { maxHeight: 56 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Appointment card
  apptCard: { borderRadius: 18, padding: 16, borderWidth: 1, backgroundColor: Colors.cardBg, gap: 12, overflow: "hidden" },
  apptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  apptFacility: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", flex: 1, marginRight: 8 },
  apptStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  apptStatusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  apptBody: { gap: 8 },
  apptRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  apptRowVal: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flex: 1, marginLeft: 8 },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, backgroundColor: Colors.danger + "12", borderWidth: 1, borderColor: Colors.danger + "30" },
  cancelBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger },

  // Empty state
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: { marginTop: 8 },
  emptyBtnGrad: { borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#000" },
});
