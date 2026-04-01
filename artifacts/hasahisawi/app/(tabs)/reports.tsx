import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";
import { getApiUrl } from "@/lib/query-client";

// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
type ReportStatus = "pending" | "received" | "inProgress" | "resolved";

type Agency = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  icon: string;
  color: string;
  commonIssues: string[];
  workHours: string;
  emergency: boolean;
};

type Report = {
  id: string;
  agencyId: string;
  agencyName: string;
  agencyColor: string;
  issue: string;
  description: string;
  location: string;
  reporterName: string;
  phone: string;
  status: ReportStatus;
  createdAt: string;
  urgent: boolean;
};

// ══════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════
const AGENCIES: Agency[] = [
  {
    id: "ag1",
    name: "هيئة مياه ولاية الجزيرة",
    shortName: "هيئة المياه",
    category: "مياه",
    description: "الجهة المسؤولة عن توفير وإدارة شبكة مياه الشرب في مدينة حصاحيصا ومحيطها",
    phone: "+249912300100",
    whatsapp: "+249912300100",
    icon: "water",
    color: "#3E9CBF",
    commonIssues: ["انقطاع المياه", "كسر في الأنابيب", "تسرب المياه", "تلوث المياه", "ضعف الضغط", "شبكة جديدة"],
    workHours: "7ص - 3م",
    emergency: true,
  },
  {
    id: "ag2",
    name: "شركة كهرباء السودان — حصاحيصا",
    shortName: "الكهرباء",
    category: "كهرباء",
    description: "توفير وصيانة شبكة الكهرباء، معالجة انقطاع التيار والأعطال الكهربائية في المدينة",
    phone: "+249912300200",
    whatsapp: "+249912300200",
    icon: "lightning-bolt",
    color: "#F0A500",
    commonIssues: ["انقطاع الكهرباء", "عطل في الخطوط", "خطر صعق كهربائي", "كابل مكشوف", "عمود مكسور", "مشكلة عداد"],
    workHours: "24 ساعة",
    emergency: true,
  },
  {
    id: "ag3",
    name: "إدارة البيئة والصحة البيئية",
    shortName: "البيئة",
    category: "بيئة",
    description: "الإشراف على النظافة العامة، إدارة النفايات، مكافحة التلوث البيئي وحماية الصحة العامة",
    phone: "+249912300300",
    icon: "leaf",
    color: "#27AE68",
    commonIssues: ["مكب نفايات مخالف", "تلوث مجرى مائي", "رش مبيدات حشرية", "روائح كريهة", "مصنع ملوث", "حرق نفايات"],
    workHours: "7ص - 3م",
    emergency: false,
  },
  {
    id: "ag4",
    name: "هيئة الطرق والجسور",
    shortName: "الطرق",
    category: "طرق",
    description: "صيانة وإنشاء الطرق والجسور، معالجة الحفر والتشققات وأعطال الإنارة في حصاحيصا",
    phone: "+249912300400",
    icon: "road-variant",
    color: "#FF6B35",
    commonIssues: ["حفر في الطريق", "طريق مقطوع", "إنارة معطلة", "علامة مرورية مكسورة", "جسر تالف", "فيضان طريق"],
    workHours: "7ص - 3م",
    emergency: false,
  },
  {
    id: "ag5",
    name: "محلية حصاحيصا",
    shortName: "المحلية",
    category: "محلية",
    description: "الجهة الإدارية المحلية المسؤولة عن تنظيم المدينة وخدماتها العامة ورخص البناء والنشاط التجاري",
    phone: "+249912300500",
    whatsapp: "+249912300500",
    icon: "office-building",
    color: "#A855F7",
    commonIssues: ["بناء مخالف", "نشاط تجاري بلا رخصة", "تعدٍ على أملاك عامة", "سوق عشوائي", "مخالفة بيئية", "إزعاج عام"],
    workHours: "8ص - 2م",
    emergency: false,
  },
  {
    id: "ag6",
    name: "الصحة العامة — ولاية الجزيرة",
    shortName: "الصحة العامة",
    category: "صحة",
    description: "مكافحة الأمراض المعدية، الرقابة على المطاعم والغذاء، حملات التطعيم والتوعية الصحية",
    phone: "+249912300600",
    icon: "shield-cross",
    color: "#FF4FA3",
    commonIssues: ["مطعم غير صحي", "بؤرة وباء محتملة", "غذاء فاسد للبيع", "مياه ملوثة", "صرف صحي مكشوف", "تجمع بعوض"],
    workHours: "7ص - 3م",
    emergency: true,
  },
  {
    id: "ag7",
    name: "قوة الشرطة — مركز حصاحيصا",
    shortName: "الشرطة",
    category: "أمن",
    description: "الحفاظ على الأمن العام، استقبال البلاغات الجنائية، التحقيق في الشكاوى الأمنية",
    phone: "999",
    icon: "shield-account",
    color: "#3B82F6",
    commonIssues: ["جريمة سرقة", "تهديد وإيذاء", "حادث مروري", "شجار عام", "نزاع أرض", "ضياع شخص"],
    workHours: "24 ساعة",
    emergency: true,
  },
  {
    id: "ag8",
    name: "الدفاع المدني والإطفاء",
    shortName: "الإطفاء",
    category: "طوارئ",
    description: "الاستجابة لحوادث الحرائق والكوارث، الإنقاذ في حالات الطوارئ وانهيارات المباني",
    phone: "998",
    icon: "fire-truck",
    color: "#EF4444",
    commonIssues: ["حريق منزلي", "حريق تجاري", "انهيار مبنى", "حادث خطير", "إنقاذ شخص محاصر", "تسرب غاز"],
    workHours: "24 ساعة",
    emergency: true,
  },
  {
    id: "ag9",
    name: "الصرف الصحي والصحة العامة",
    shortName: "الصرف الصحي",
    category: "صرف صحي",
    description: "صيانة شبكات الصرف الصحي، معالجة طفح المجاري والمشاكل الصحية المتعلقة بها",
    phone: "+249912300900",
    icon: "pipe-leak",
    color: "#8B5CF6",
    commonIssues: ["طفح مجاري", "رائحة مجاري", "شبكة مسدودة", "انسداد بالوعة", "طفح في شارع عام", "مجرى ملوث"],
    workHours: "7ص - 3م",
    emergency: true,
  },
  {
    id: "ag10",
    name: "وحدة الإسكان والتخطيط العمراني",
    shortName: "الإسكان",
    category: "عمران",
    description: "التخطيط العمراني، الرقابة على البناء، توزيع الأراضي ومعالجة مخالفات البناء",
    phone: "+249912301000",
    icon: "home-city",
    color: "#F59E0B",
    commonIssues: ["مخالفة بناء", "بناء بلا ترخيص", "تعدٍ على حد أرض", "نزاع ملكية", "تشوه بصري", "هدم مخالف"],
    workHours: "8ص - 2م",
    emergency: false,
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  "مياه": "water",
  "كهرباء": "lightning-bolt",
  "بيئة": "leaf",
  "طرق": "road-variant",
  "محلية": "office-building",
  "صحة": "shield-cross",
  "أمن": "shield-account",
  "طوارئ": "fire-truck",
  "صرف صحي": "pipe-leak",
  "عمران": "home-city",
};

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; icon: string }> = {
  pending:    { label: "قيد الإرسال",    color: Colors.textMuted, icon: "time-outline" },
  received:   { label: "وصل للجهة",     color: Colors.accent,   icon: "checkmark-outline" },
  inProgress: { label: "جاري المعالجة", color: "#3E9CBF",       icon: "construct-outline" },
  resolved:   { label: "تم الحل",       color: Colors.primary,  icon: "checkmark-circle-outline" },
};

const REPORTS_KEY = "citizen_reports_v1";

// ══════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════
type Tab = "report" | "myReports" | "feedback";
type FeedbackType = "suggestion" | "complaint" | "general";
type FeedbackStatus = "new" | "read" | "replied";
type FeedbackItem = {
  id: number;
  type: FeedbackType;
  title: string;
  body: string;
  sender_name: string;
  phone?: string;
  category: string;
  status: FeedbackStatus;
  admin_reply?: string;
  created_at: string;
};

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { isRTL, tr } = useLang();
  const auth = useAuth();

  const [tab, setTab] = useState<Tab>("report");
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [selectedIssue, setSelectedIssue] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [phone, setPhone] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [step, setStep] = useState<"agency" | "details" | "confirm">("agency");
  const [searchAgency, setSearchAgency] = useState("");

  // مقترحات وشكاوى
  const [fbType, setFbType] = useState<FeedbackType>("suggestion");
  const [fbTitle, setFbTitle] = useState("");
  const [fbBody, setFbBody] = useState("");
  const [fbName, setFbName] = useState("");
  const [fbPhone, setFbPhone] = useState("");
  const [fbCategory, setFbCategory] = useState("عام");
  const [fbList, setFbList] = useState<FeedbackItem[]>([]);
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSent, setFbSent] = useState(false);

  const loadReports = async () => {
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      const url = auth.token ? `${base}/api/reports` : `${base}/api/reports?phone=${encodeURIComponent(phone)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const mapped: Report[] = data.map((r: any) => ({
          id: String(r.id),
          agencyId: r.agency_id,
          agencyName: r.agency_name,
          agencyColor: r.agency_color || "#27AE68",
          issue: r.issue,
          description: r.description || "",
          location: r.location,
          reporterName: r.reporter_name,
          phone: r.phone,
          status: r.status as ReportStatus,
          createdAt: r.created_at,
          urgent: r.urgent,
        }));
        setReports(mapped);
        return;
      }
    } catch {}
    // Fallback to AsyncStorage
    const raw = await AsyncStorage.getItem(REPORTS_KEY);
    setReports(raw ? JSON.parse(raw) : []);
  };

  const loadFeedback = async () => {
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      const phoneQ = !auth.token && fbPhone ? `?phone=${encodeURIComponent(fbPhone)}` : "";
      const res = await fetch(`${base}/api/feedback/mine${phoneQ}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFbList(data);
      }
    } catch {}
  };

  useEffect(() => {
    loadReports();
    if (auth.user) {
      setReporterName(auth.user.name || "");
      setFbName(auth.user.name || "");
    }
  }, [auth.user]);
  useFocusEffect(useCallback(() => { loadReports(); loadFeedback(); }, [auth.token]));

  const categories = ["الكل", ...Array.from(new Set(AGENCIES.map(a => a.category)))];

  const filteredAgencies = AGENCIES.filter(a => {
    const matchCat = categoryFilter === "الكل" || a.category === categoryFilter;
    const matchSearch = searchAgency === "" || a.name.includes(searchAgency) || a.shortName.includes(searchAgency) || a.category.includes(searchAgency);
    return matchCat && matchSearch;
  });

  const resetForm = () => {
    setSelectedAgency(null); setSelectedIssue(""); setDescription("");
    setLocation(""); setReporterName(""); setPhone(""); setUrgent(false);
    setStep("agency"); setSearchAgency(""); setCategoryFilter("الكل");
  };

  const submitReport = async () => {
    if (!reporterName.trim()) { Alert.alert("تنبيه", "يرجى إدخال اسمك"); return; }
    if (!phone.trim()) { Alert.alert("تنبيه", "يرجى إدخال رقم هاتفك"); return; }
    if (!location.trim()) { Alert.alert("تنبيه", "يرجى تحديد الموقع"); return; }

    setSubmitting(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;

      const body = {
        agency_id: selectedAgency!.id,
        agency_name: selectedAgency!.name,
        agency_color: selectedAgency!.color,
        issue: selectedIssue,
        description: description.trim() || undefined,
        location: location.trim(),
        reporter_name: reporterName.trim(),
        phone: phone.trim(),
        urgent,
      };

      const res = await fetch(`${base}/api/reports`, { method: "POST", headers, body: JSON.stringify(body) });

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadReports();
        resetForm();
        setTab("myReports");
        Alert.alert(
          "✅ تم إرسال البلاغ",
          `بلاغك بخصوص "${selectedIssue}" وصل للجهة المختصة\nسيتم التواصل معك على رقم ${phone.trim()} خلال 24-48 ساعة`,
        );
        return;
      }
    } catch {}

    // Fallback: save locally
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newReport: Report = {
      id: Date.now().toString(),
      agencyId: selectedAgency!.id,
      agencyName: selectedAgency!.name,
      agencyColor: selectedAgency!.color,
      issue: selectedIssue,
      description: description.trim(),
      location: location.trim(),
      reporterName: reporterName.trim(),
      phone: phone.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      urgent,
    };
    const existing = await AsyncStorage.getItem(REPORTS_KEY);
    const all: Report[] = existing ? JSON.parse(existing) : [];
    all.unshift(newReport);
    await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(all));
    setReports(all);
    resetForm();
    setTab("myReports");
    Alert.alert("✅ تم إرسال البلاغ", `بلاغك بخصوص "${selectedIssue}" تم حفظه محلياً`);
    setSubmitting(false);
  };

  const submitFeedback = async () => {
    if (!fbName.trim()) { Alert.alert("تنبيه", "يرجى إدخال اسمك"); return; }
    if (!fbTitle.trim()) { Alert.alert("تنبيه", "يرجى كتابة عنوان"); return; }
    if (!fbBody.trim()) { Alert.alert("تنبيه", "يرجى كتابة التفاصيل"); return; }

    setFbSubmitting(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;

      const res = await fetch(`${base}/api/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: fbType,
          title: fbTitle.trim(),
          body: fbBody.trim(),
          sender_name: fbName.trim(),
          phone: fbPhone.trim() || undefined,
          category: fbCategory,
        }),
      });

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFbTitle(""); setFbBody(""); setFbCategory("عام");
        setFbSent(true);
        await loadFeedback();
        Alert.alert("✅ شكراً لك!", "وصل اقتراحك/شكواك للإدارة وسيُرَد عليك قريباً");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال البلاغ، يرجى المحاولة لاحقاً");
      }
    } catch {
      Alert.alert("خطأ في الاتصال", "تأكد من اتصالك بالإنترنت وحاول مجدداً");
    } finally {
      setFbSubmitting(false);
    }
  };

  const handleDirectContact = (agency: Agency) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(`تواصل مع ${agency.shortName}`, agency.phone, [
      { text: "إلغاء", style: "cancel" },
      agency.whatsapp ? { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${agency.whatsapp!.replace(/\D/g, "")}`) } : null,
      { text: "اتصال مباشر", onPress: () => Linking.openURL(`tel:${agency.phone}`) },
    ].filter(Boolean) as any);
  };

  const pendingCount = reports.filter(r => r.status === "pending").length;
  const filteredReports = reports.filter(r => statusFilter === "all" || r.status === statusFilter);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <LinearGradient colors={[Colors.cardBg, Colors.bg]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerTop}>
          <LinearGradient colors={[Colors.danger + "25", Colors.accent + "18"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.headerIcon}>
            <MaterialCommunityIcons name="bullhorn" size={22} color={Colors.danger} />
          </LinearGradient>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={s.headerTitle}>التبليغ السريع</Text>
            <Text style={s.headerSub}>اربط مشكلتك بالجهة المختصة</Text>
          </View>
          {step !== "agency" && tab === "report" && (
            <TouchableOpacity onPress={resetForm} style={s.resetBtn}>
              <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
              <Text style={s.resetText}>بداية</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {([
            ["report",    "إرسال بلاغ",       "megaphone-outline"],
            ["myReports", "بلاغاتي",           "list-outline"],
            ["feedback",  "مقترحات وشكاوى",   "chatbubble-ellipses-outline"],
          ] as [Tab, string, string][]).map(([k, label, icon]) => (
            <TouchableOpacity key={k} style={[s.tabBtn, tab === k && s.tabBtnActive]} onPress={() => setTab(k)}>
              {tab === k && <LinearGradient colors={[Colors.danger, Colors.danger + "CC"]} style={StyleSheet.absoluteFill} />}
              <View style={{ position: "relative" }}>
                <Ionicons name={icon as any} size={16} color={tab === k ? "#fff" : Colors.textSecondary} />
                {k === "myReports" && pendingCount > 0 && (
                  <View style={s.badge}><Text style={s.badgeText}>{pendingCount}</Text></View>
                )}
              </View>
              <Text style={[s.tabBtnText, tab === k && { color: "#fff" }]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ════════ GUEST GATE ════════ */}
      {auth.isGuest ? (
        <GuestGate
          title={tr("التبليغ السريع", "Quick Reporting")}
          preview={
            <View style={{ padding: 16, gap: 12 }}>
              {[
                { icon: "water-outline", label: "انقطاع المياه", agency: "مياه حصاحيصا", color: "#3B82F6" },
                { icon: "flash-outline", label: "عطل كهربائي", agency: "الكهرباء الوطنية", color: "#F59E0B" },
                { icon: "leaf-outline", label: "مشكلة بيئية", agency: "البلدية", color: "#10B981" },
              ].map((item, i) => (
                <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: item.color + "20", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary }}>{item.label}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>{item.agency}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                </View>
              ))}
            </View>
          }
          features={[
            { icon: "megaphone-outline",  text: tr("أرسل بلاغات لجهات المدينة مباشرة", "Report issues directly to city agencies") },
            { icon: "time-outline",       text: tr("تابع حالة بلاغاتك لحظة بلحظة", "Track your reports in real time") },
            { icon: "checkmark-circle-outline", text: tr("احصل على إشعار عند حل المشكلة", "Get notified when your issue is resolved") },
          ]}
        />
      ) : null}

      {/* ════════ TAB: REPORT ════════ */}
      {!auth.isGuest && tab === "report" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }} showsVerticalScrollIndicator={false}>

          {/* Progress */}
          <View style={s.progressRow}>
            {(["agency", "details", "confirm"] as const).map((st, i) => {
              const active = ["agency", "details", "confirm"].indexOf(step) >= i;
              return (
                <React.Fragment key={st}>
                  <View style={[s.progressStep, active && { backgroundColor: Colors.danger }]}>
                    {active ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={s.progressStepNum}>{i + 1}</Text>}
                  </View>
                  {i < 2 && <View style={[s.progressLine, active && ["agency", "details", "confirm"].indexOf(step) > i && { backgroundColor: Colors.danger }]} />}
                </React.Fragment>
              );
            })}
          </View>

          {/* ── STEP 1: اختيار الجهة ── */}
          {step === "agency" && (
            <Animated.View entering={FadeIn.duration(300)} style={{ gap: 14 }}>
              <Text style={s.stepTitle}>اختر الجهة المختصة</Text>

              {/* Emergency strip */}
              <LinearGradient colors={[Colors.danger + "18", Colors.danger + "08"]} style={s.emergencyStrip}>
                <MaterialCommunityIcons name="alert-circle" size={20} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={s.emergencyTitle}>حالات الطوارئ الفورية</Text>
                  <Text style={s.emergencySub}>للحرائق: 998 · للأمن: 999</Text>
                </View>
                <TouchableOpacity onPress={() => Linking.openURL("tel:999")} style={[s.emergencyCallBtn, { backgroundColor: "#3B82F6" }]}>
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={s.emergencyCallText}>999</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL("tel:998")} style={[s.emergencyCallBtn, { backgroundColor: "#EF4444" }]}>
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={s.emergencyCallText}>998</Text>
                </TouchableOpacity>
              </LinearGradient>

              {/* Search */}
              <View style={s.searchRow}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput
                  style={s.searchInput}
                  placeholder="ابحث عن جهة..."
                  placeholderTextColor={Colors.textMuted}
                  value={searchAgency}
                  onChangeText={setSearchAgency}
                  textAlign="right"
                />
              </View>

              {/* Category filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.catChip, categoryFilter === cat && { backgroundColor: Colors.danger, borderColor: Colors.danger }]}
                    onPress={() => setCategoryFilter(cat)}
                  >
                    {cat !== "الكل" && <MaterialCommunityIcons name={CATEGORY_ICONS[cat] as any ?? "help-circle"} size={13} color={categoryFilter === cat ? "#fff" : Colors.textSecondary} />}
                    <Text style={[s.catChipText, categoryFilter === cat && { color: "#fff" }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Agency cards */}
              {filteredAgencies.map((agency, i) => (
                <Animated.View key={agency.id} entering={FadeInDown.delay(i * 50).springify()}>
                  <AnimatedPress onPress={() => { setSelectedAgency(agency); setSelectedIssue(""); setStep("details"); }}>
                    <View style={[s.agencyCard, { borderColor: agency.color + "35" }]}>
                      <LinearGradient colors={[agency.color + "10", "transparent"]} style={StyleSheet.absoluteFill} />

                      {agency.emergency && (
                        <View style={s.urgentTag}>
                          <MaterialCommunityIcons name="alert-circle" size={11} color={Colors.danger} />
                          <Text style={s.urgentTagText}>طوارئ</Text>
                        </View>
                      )}

                      <View style={s.agencyCardInner}>
                        <View style={[s.agencyIcon, { backgroundColor: agency.color + "20" }]}>
                          <MaterialCommunityIcons name={agency.icon as any} size={28} color={agency.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.agencyName}>{agency.name}</Text>
                          <Text style={s.agencyDesc} numberOfLines={2}>{agency.description}</Text>
                          <View style={s.agencyMeta}>
                            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                            <Text style={s.agencyMetaText}>{agency.workHours}</Text>
                            <View style={[s.catDot, { backgroundColor: agency.color }]} />
                            <Text style={[s.agencyMetaText, { color: agency.color }]}>{agency.category}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={s.agencyActions}>
                        <TouchableOpacity
                          style={[s.directCallBtn, { borderColor: agency.color + "50" }]}
                          onPress={(e) => { e.stopPropagation?.(); handleDirectContact(agency); }}
                        >
                          <Ionicons name="call-outline" size={14} color={agency.color} />
                          <Text style={[s.directCallText, { color: agency.color }]}>{agency.phone}</Text>
                        </TouchableOpacity>
                        <View style={[s.reportNowBtn, { backgroundColor: agency.color + "18", borderColor: agency.color + "40" }]}>
                          <Text style={[s.reportNowText, { color: agency.color }]}>بلّغ</Text>
                          <Ionicons name="chevron-forward" size={14} color={agency.color} />
                        </View>
                      </View>
                    </View>
                  </AnimatedPress>
                </Animated.View>
              ))}
            </Animated.View>
          )}

          {/* ── STEP 2: تفاصيل البلاغ ── */}
          {step === "details" && selectedAgency && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("agency")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.danger} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>تفاصيل البلاغ</Text>
              </View>

              {/* Agency banner */}
              <View style={[s.agencyBanner, { borderColor: selectedAgency.color + "40" }]}>
                <LinearGradient colors={[selectedAgency.color + "15", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={[s.agencyBannerIcon, { backgroundColor: selectedAgency.color + "20" }]}>
                  <MaterialCommunityIcons name={selectedAgency.icon as any} size={22} color={selectedAgency.color} />
                </View>
                <View>
                  <Text style={s.agencyBannerName}>{selectedAgency.name}</Text>
                  <Text style={s.agencyBannerHours}>{selectedAgency.workHours}</Text>
                </View>
              </View>

              {/* Select issue */}
              <Text style={s.sectionLabel}>نوع المشكلة</Text>
              <View style={s.issuesGrid}>
                {selectedAgency.commonIssues.map(issue => (
                  <TouchableOpacity
                    key={issue}
                    style={[s.issueChip, selectedIssue === issue && { backgroundColor: selectedAgency.color, borderColor: selectedAgency.color }]}
                    onPress={() => setSelectedIssue(issue)}
                  >
                    <Text style={[s.issueChipText, selectedIssue === issue && { color: "#000" }]}>{issue}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[s.issueChip, s.issueChipOther, selectedIssue === "أخرى" && { backgroundColor: selectedAgency.color, borderColor: selectedAgency.color }]}
                  onPress={() => setSelectedIssue("أخرى")}
                >
                  <Text style={[s.issueChipText, selectedIssue === "أخرى" && { color: "#000" }]}>أخرى...</Text>
                </TouchableOpacity>
              </View>

              {/* Description */}
              <View style={s.fieldBlock}>
                <Text style={s.fieldLabel}>وصف المشكلة (اختياري)</Text>
                <TextInput
                  style={[s.fieldInput, { height: 90, textAlignVertical: "top" }]}
                  placeholder={`اشرح المشكلة بتفصيل أكثر...`}
                  placeholderTextColor={Colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlign="right"
                />
              </View>

              {/* Location */}
              <View style={s.fieldBlock}>
                <Text style={s.fieldLabel}>الموقع *</Text>
                <View style={s.fieldWithIcon}>
                  <Ionicons name="location-outline" size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                  <TextInput
                    style={s.fieldInner}
                    placeholder="مثال: شارع السوق، أمام محطة الوقود"
                    placeholderTextColor={Colors.textMuted}
                    value={location}
                    onChangeText={setLocation}
                    textAlign="right"
                  />
                </View>
              </View>

              {/* Urgency toggle */}
              <TouchableOpacity
                style={[s.urgentToggle, urgent && { borderColor: Colors.danger + "60", backgroundColor: Colors.danger + "10" }]}
                onPress={() => { setUrgent(!urgent); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <MaterialCommunityIcons name={urgent ? "alert-circle" : "alert-circle-outline"} size={22} color={urgent ? Colors.danger : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.urgentToggleTitle, urgent && { color: Colors.danger }]}>بلاغ عاجل</Text>
                  <Text style={s.urgentToggleSub}>خطر فوري يهدد السلامة العامة</Text>
                </View>
                <View style={[s.toggle, urgent && { backgroundColor: Colors.danger }]}>
                  <View style={[s.toggleThumb, urgent && { transform: [{ translateX: 20 }] }]} />
                </View>
              </TouchableOpacity>

              {selectedIssue ? (
                <Animated.View entering={FadeInUp.springify()}>
                  <TouchableOpacity onPress={() => setStep("confirm")}>
                    <LinearGradient colors={[Colors.danger, Colors.danger + "CC"]} style={s.nextBtn}>
                      <Text style={s.nextBtnText}>التالي — بياناتك</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <View style={s.selectIssueTip}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                  <Text style={s.selectIssueTipText}>يرجى اختيار نوع المشكلة أولاً</Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* ── STEP 3: بيانات المُبلِّغ والتأكيد ── */}
          {step === "confirm" && selectedAgency && (
            <Animated.View entering={FadeInDown.springify()} style={{ gap: 16 }}>
              <View style={s.stepHeaderRow}>
                <TouchableOpacity onPress={() => setStep("details")} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={18} color={Colors.danger} />
                </TouchableOpacity>
                <Text style={s.stepTitle}>بياناتك</Text>
              </View>

              {/* Summary */}
              <LinearGradient colors={[selectedAgency.color + "18", Colors.danger + "08"]} style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryVal}>{selectedAgency.name}</Text>
                  <Text style={s.summaryKey}>الجهة</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}>
                  <Text style={s.summaryVal}>{selectedIssue}</Text>
                  <Text style={s.summaryKey}>المشكلة</Text>
                </View>
                {location ? <><View style={s.summaryDivider} /><View style={s.summaryRow}><Text style={s.summaryVal}>{location}</Text><Text style={s.summaryKey}>الموقع</Text></View></> : null}
                {urgent && <><View style={s.summaryDivider} /><View style={s.summaryRow}><Text style={[s.summaryVal, { color: Colors.danger }]}>⚠️ بلاغ عاجل</Text><Text style={s.summaryKey}>الأولوية</Text></View></>}
              </LinearGradient>

              {/* Reporter info */}
              {[
                { label: "اسمك الكامل *", ph: "أدخل اسمك", val: reporterName, set: setReporterName, kb: "default" as const, icon: "person-outline" },
                { label: "رقم هاتفك *", ph: "09xxxxxxxx", val: phone, set: setPhone, kb: "phone-pad" as const, icon: "call-outline" },
              ].map(f => (
                <View key={f.label} style={s.fieldBlock}>
                  <Text style={s.fieldLabel}>{f.label}</Text>
                  <View style={s.fieldWithIcon}>
                    <Ionicons name={f.icon as any} size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                    <TextInput
                      style={s.fieldInner}
                      placeholder={f.ph}
                      placeholderTextColor={Colors.textMuted}
                      value={f.val}
                      onChangeText={f.set}
                      keyboardType={f.kb}
                      textAlign="right"
                    />
                  </View>
                </View>
              ))}

              <View style={s.privacyNote}>
                <Ionicons name="lock-closed-outline" size={15} color={Colors.textMuted} />
                <Text style={s.privacyNoteText}>بياناتك محفوظة ولن تُشارَك إلا مع الجهة المختصة فقط</Text>
              </View>

              <TouchableOpacity onPress={submitReport} disabled={submitting}>
                <LinearGradient colors={[Colors.danger, Colors.danger + "CC"]} style={[s.submitBtn, submitting && { opacity: 0.7 }]}>
                  <MaterialCommunityIcons name="bullhorn" size={20} color="#fff" />
                  <Text style={s.submitBtnText}>{submitting ? "جارٍ الإرسال..." : "إرسال البلاغ"}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ════════ TAB: MY REPORTS ════════ */}
      {!auth.isGuest && tab === "myReports" && (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {([["all", "الكل"], ["pending", "مُرسَل"], ["received", "وصل"], ["inProgress", "جارٍ"], ["resolved", "تم الحل"]] as [ReportStatus | "all", string][]).map(([k, label]) => {
              const cfg = k !== "all" ? STATUS_CONFIG[k] : null;
              return (
                <TouchableOpacity
                  key={k}
                  style={[s.filterChip, statusFilter === k && { backgroundColor: cfg?.color ?? Colors.danger, borderColor: cfg?.color ?? Colors.danger }]}
                  onPress={() => setStatusFilter(k)}
                >
                  <Text style={[s.filterChipText, statusFilter === k && { color: "#000" }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filteredReports.length === 0 && (
              <Animated.View entering={FadeIn.duration(400)} style={s.emptyState}>
                <MaterialCommunityIcons name="bullhorn-outline" size={56} color={Colors.danger + "60"} />
                <Text style={s.emptyTitle}>لا توجد بلاغات</Text>
                <Text style={s.emptySub}>أرسل بلاغك الأول للجهة المختصة</Text>
                <TouchableOpacity onPress={() => { resetForm(); setTab("report"); }}>
                  <LinearGradient colors={[Colors.danger, Colors.danger + "CC"]} style={s.emptyBtn}>
                    <Text style={s.emptyBtnText}>أرسل بلاغ الآن</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {filteredReports.map((report, i) => {
              const st = STATUS_CONFIG[report.status];
              return (
                <Animated.View key={report.id} entering={FadeInDown.delay(i * 60).springify()}>
                  <View style={[s.reportCard, { borderColor: report.agencyColor + "30" }]}>
                    <LinearGradient colors={[report.agencyColor + "08", "transparent"]} style={StyleSheet.absoluteFill} />

                    <View style={s.reportHeader}>
                      <View style={[s.reportStatus, { backgroundColor: st.color + "18", borderColor: st.color + "40" }]}>
                        <Ionicons name={st.icon as any} size={12} color={st.color} />
                        <Text style={[s.reportStatusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      {report.urgent && (
                        <View style={s.urgentBadge}>
                          <MaterialCommunityIcons name="alert-circle" size={11} color={Colors.danger} />
                          <Text style={s.urgentBadgeText}>عاجل</Text>
                        </View>
                      )}
                    </View>

                    <Text style={s.reportAgency}>{report.agencyName}</Text>
                    <Text style={s.reportIssue}>{report.issue}</Text>

                    {[
                      { icon: "location-outline", val: report.location },
                      { icon: "person-outline",   val: report.reporterName },
                      { icon: "time-outline",     val: formatDate(report.createdAt) },
                    ].map((row, ri) => (
                      <View key={ri} style={s.reportRow}>
                        <Text style={s.reportRowVal}>{row.val}</Text>
                        <Ionicons name={row.icon as any} size={14} color={Colors.textMuted} />
                      </View>
                    ))}

                    {report.description ? (
                      <Text style={s.reportDesc}>{report.description}</Text>
                    ) : null}
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ════════ TAB: FEEDBACK ════════ */}
      {!auth.isGuest && tab === "feedback" && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 20 }} showsVerticalScrollIndicator={false}>

          {/* نوع المقترح */}
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 14 }}>
            <Text style={s.stepTitle}>مقترح أو شكوى؟</Text>

            {/* نوع */}
            <View style={fb.typeRow}>
              {([
                ["suggestion", "مقترح",  "lightbulb-outline",      "#F0A500"],
                ["complaint",  "شكوى",   "warning-outline",         Colors.danger],
                ["general",    "استفسار","help-circle-outline",     "#3E9CBF"],
              ] as [FeedbackType, string, string, string][]).map(([key, label, icon, color]) => (
                <TouchableOpacity
                  key={key}
                  style={[fb.typeBtn, fbType === key && { borderColor: color, backgroundColor: color + "18" }]}
                  onPress={() => setFbType(key)}
                >
                  <Ionicons name={icon as any} size={22} color={fbType === key ? color : Colors.textMuted} />
                  <Text style={[fb.typeBtnText, fbType === key && { color }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* الفئة */}
            <View style={{ gap: 6 }}>
              <Text style={s.fieldLabel}>الفئة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
                {["عام", "الخدمات", "البنية التحتية", "التعليم", "الصحة", "الأمن", "البيئة", "النظافة", "الطرق"].map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.catChip, fbCategory === cat && { borderColor: Colors.danger, backgroundColor: Colors.danger + "15" }]}
                    onPress={() => setFbCategory(cat)}
                  >
                    <Text style={[s.catChipText, fbCategory === cat && { color: Colors.danger }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* حقل الاسم */}
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>اسمك الكامل *</Text>
              <View style={s.fieldWithIcon}>
                <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                <TextInput
                  style={s.fieldInner}
                  placeholder="أدخل اسمك"
                  placeholderTextColor={Colors.textMuted}
                  value={fbName}
                  onChangeText={setFbName}
                  textAlign="right"
                />
              </View>
            </View>

            {/* حقل الهاتف (اختياري) */}
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>رقم هاتفك (اختياري — للرد عليك)</Text>
              <View style={s.fieldWithIcon}>
                <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                <TextInput
                  style={s.fieldInner}
                  placeholder="09xxxxxxxx"
                  placeholderTextColor={Colors.textMuted}
                  value={fbPhone}
                  onChangeText={setFbPhone}
                  keyboardType="phone-pad"
                  textAlign="right"
                />
              </View>
            </View>

            {/* العنوان */}
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>العنوان *</Text>
              <View style={s.fieldWithIcon}>
                <Ionicons name="create-outline" size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
                <TextInput
                  style={s.fieldInner}
                  placeholder="عنوان مختصر..."
                  placeholderTextColor={Colors.textMuted}
                  value={fbTitle}
                  onChangeText={setFbTitle}
                  maxLength={200}
                  textAlign="right"
                />
              </View>
            </View>

            {/* التفاصيل */}
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>التفاصيل *</Text>
              <TextInput
                style={[s.fieldArea]}
                placeholder="اشرح مقترحك أو شكواك بتفصيل..."
                placeholderTextColor={Colors.textMuted}
                value={fbBody}
                onChangeText={setFbBody}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                textAlign="right"
              />
            </View>

            {/* زر الإرسال */}
            <TouchableOpacity onPress={submitFeedback} disabled={fbSubmitting}>
              <LinearGradient
                colors={fbType === "complaint" ? [Colors.danger, Colors.danger + "CC"] : fbType === "suggestion" ? ["#F0A500", "#E69500"] : ["#3E9CBF", "#359AB0"]}
                style={s.submitBtn}
              >
                <Ionicons name={fbType === "complaint" ? "warning-outline" : fbType === "suggestion" ? "lightbulb-outline" : "help-circle-outline"} size={20} color="#fff" />
                <Text style={s.submitBtnText}>
                  {fbSubmitting ? "جارٍ الإرسال..." : fbType === "suggestion" ? "إرسال المقترح" : fbType === "complaint" ? "إرسال الشكوى" : "إرسال الاستفسار"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* قائمة مقترحاتي */}
            {fbList.length > 0 && (
              <View style={{ gap: 10, marginTop: 8 }}>
                <Text style={[s.stepTitle, { fontSize: 16 }]}>مقترحاتي وشكاواي</Text>
                {fbList.map((item, i) => {
                  const typeColor = item.type === "complaint" ? Colors.danger : item.type === "suggestion" ? "#F0A500" : "#3E9CBF";
                  const typeLabel = item.type === "complaint" ? "شكوى" : item.type === "suggestion" ? "مقترح" : "استفسار";
                  const statusLabel = item.status === "replied" ? "تم الرد" : item.status === "read" ? "قُرئ" : "جديد";
                  const statusColor = item.status === "replied" ? Colors.primary : item.status === "read" ? Colors.accent : Colors.textMuted;
                  return (
                    <Animated.View key={item.id} entering={FadeInDown.delay(i * 50).springify()}>
                      <View style={[fb.card, { borderColor: typeColor + "30" }]}>
                        <LinearGradient colors={[typeColor + "08", "transparent"]} style={StyleSheet.absoluteFill} />
                        <View style={fb.cardHeader}>
                          <View style={[fb.typePill, { borderColor: typeColor + "40", backgroundColor: typeColor + "15" }]}>
                            <Text style={[fb.typePillText, { color: typeColor }]}>{typeLabel}</Text>
                          </View>
                          <View style={[fb.typePill, { borderColor: statusColor + "40", backgroundColor: statusColor + "15" }]}>
                            <Text style={[fb.typePillText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                          <Text style={fb.dateText}>{new Date(item.created_at).toLocaleDateString("ar-SD")}</Text>
                        </View>
                        <Text style={fb.cardTitle}>{item.title}</Text>
                        <Text style={fb.cardBody} numberOfLines={3}>{item.body}</Text>
                        {item.admin_reply ? (
                          <View style={fb.replyBox}>
                            <View style={fb.replyHeader}>
                              <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
                              <Text style={fb.replyLabel}>رد الإدارة</Text>
                            </View>
                            <Text style={fb.replyText}>{item.admin_reply}</Text>
                          </View>
                        ) : null}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}

            {fbList.length === 0 && fbSent === false && (
              <View style={[s.emptyState, { paddingTop: 20 }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.danger + "50"} />
                <Text style={s.emptySub}>لم تُرسل أي مقترح أو شكوى بعد</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.danger + "40" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.accent + "20", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  resetText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.accent },

  tabRow: { flexDirection: "row", gap: 10, paddingBottom: 16 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 14, overflow: "hidden", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tabBtnActive: { borderColor: Colors.danger + "60" },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  badge: { position: "absolute", top: -5, right: -8, backgroundColor: Colors.danger, borderRadius: 8, width: 16, height: 16, justifyContent: "center", alignItems: "center" },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" },

  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 8 },
  progressStep: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: Colors.divider, justifyContent: "center", alignItems: "center" },
  progressStepNum: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  progressLine: { flex: 1, height: 2, backgroundColor: Colors.divider, maxWidth: 80 },

  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  stepHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.danger + "18", justifyContent: "center", alignItems: "center" },

  // Emergency strip
  emergencyStrip: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.danger + "40" },
  emergencyTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.danger, textAlign: "right" },
  emergencySub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  emergencyCallBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  emergencyCallText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // Search
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 12 },

  // Category chips
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Agency card
  agencyCard: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, borderWidth: 1, gap: 12, overflow: "hidden" },
  urgentTag: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", backgroundColor: Colors.danger + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: Colors.danger + "30" },
  urgentTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.danger },
  agencyCardInner: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  agencyIcon: { width: 54, height: 54, borderRadius: 15, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  agencyName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  agencyDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20, marginTop: 4 },
  agencyMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  agencyMetaText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  catDot: { width: 4, height: 4, borderRadius: 2 },
  agencyActions: { flexDirection: "row", gap: 10 },
  directCallBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 9, borderWidth: 1 },
  directCallText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  reportNowBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, paddingVertical: 9, borderWidth: 1 },
  reportNowText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  // Agency banner
  agencyBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: Colors.cardBg, overflow: "hidden" },
  agencyBannerIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  agencyBannerName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  agencyBannerHours: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },

  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },

  // Issues grid
  issuesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  issueChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  issueChipOther: { borderStyle: "dashed" },
  issueChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Fields
  fieldBlock: { gap: 7 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldWithIcon: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14, backgroundColor: Colors.cardBg },
  fieldInner: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 13, paddingHorizontal: 10 },
  fieldInput: { borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 14, backgroundColor: Colors.cardBg, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },

  // Urgent toggle
  urgentToggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  urgentToggleTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  urgentToggleSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.divider, justifyContent: "center", paddingHorizontal: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },

  selectIssueTip: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  selectIssueTipText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // Summary card
  summaryCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.divider },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  summaryKey: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  summaryVal: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right", marginRight: 12 },
  summaryDivider: { height: 1, backgroundColor: Colors.divider },

  privacyNote: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  privacyNoteText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },

  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 17, shadowColor: Colors.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },

  // Filter bar
  filterBar: { maxHeight: 56 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  // Report card
  reportCard: { borderRadius: 18, padding: 16, borderWidth: 1, backgroundColor: Colors.cardBg, gap: 8, overflow: "hidden" },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  reportStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  reportStatusText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  urgentBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.danger + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: Colors.danger + "30" },
  urgentBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.danger },
  reportAgency: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  reportIssue: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "right" },
  reportRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportRowVal: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", marginLeft: 8 },
  reportDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", backgroundColor: Colors.bg, borderRadius: 10, padding: 10, lineHeight: 22 },

  // Empty
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary },
  emptyBtn: { borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 6 },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // Textarea
  fieldArea: {
    backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 15,
    padding: 14, minHeight: 120, lineHeight: 24,
  },
});

// ── styles مقترحات وشكاوى ──
const fb = StyleSheet.create({
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 16, borderWidth: 1.5,
    borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  typeBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14,
    borderWidth: 1, gap: 8, overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  typePill: {
    flexDirection: "row", alignItems: "center", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1,
  },
  typePillText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  dateText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginLeft: "auto" as any },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  cardBody: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },

  replyBox: {
    backgroundColor: Colors.primary + "12", borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary + "30", padding: 12, gap: 6,
  },
  replyHeader: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  replyLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  replyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
});
