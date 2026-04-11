import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator,
  KeyboardAvoidingView, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ══════════════════════════════════════════════════════
// الثوابت
// ══════════════════════════════════════════════════════
const TOKEN_KEY = "inst_portal_token";
const INST_KEY  = "inst_portal_data";

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  health:      { label: "مستشفى / عيادة",      icon: "medical-bag",       color: "#E74C6F" },
  education:   { label: "مدرسة / مركز تعليمي", icon: "school",            color: "#4CAF93" },
  government:  { label: "جهة حكومية",           icon: "office-building",   color: "#2980B9" },
  ngo:         { label: "جمعية / منظمة",        icon: "account-group",     color: "#9B59B6" },
  religious:   { label: "مسجد / مركز ديني",    icon: "mosque",            color: "#27AE60" },
  commercial:  { label: "شركة / مشروع تجاري",  icon: "domain",            color: Colors.accent },
  sport:       { label: "نادي رياضي",           icon: "basketball",        color: "#E67E22" },
  cooperative: { label: "جمعية تعاونية",        icon: "handshake",         color: "#1ABC9C" },
  media:       { label: "وسيلة إعلامية",        icon: "newspaper-variant", color: "#8E44AD" },
  other:       { label: "أخرى",                  icon: "dots-horizontal",   color: Colors.textMuted },
};

// قائمة الخدمات الكاملة (مطابقة لقائمة org-join)
const ALL_SERVICES: { id: string; label: string; icon: string; cat: string }[] = [
  { id: "s01", label: "الرعاية الصحية الأولية",         icon: "heart-pulse",              cat: "الصحة" },
  { id: "s02", label: "الطوارئ والإسعاف",               icon: "ambulance",                cat: "الصحة" },
  { id: "s03", label: "استشارات طبية",                   icon: "doctor",                   cat: "الصحة" },
  { id: "s04", label: "المختبرات والتحاليل",             icon: "test-tube",                cat: "الصحة" },
  { id: "s05", label: "التعليم الأساسي والثانوي",        icon: "school",                   cat: "التعليم" },
  { id: "s06", label: "التعليم العالي",                   icon: "university",               cat: "التعليم" },
  { id: "s07", label: "الدورات والتدريب المهني",         icon: "certificate",              cat: "التعليم" },
  { id: "s08", label: "الدروس الخصوصية",                icon: "book-open-page-variant",   cat: "التعليم" },
  { id: "s09", label: "كفالة الأيتام والأسر المحتاجة",  icon: "heart",                    cat: "اجتماعي" },
  { id: "s10", label: "توزيع المساعدات الغذائية",        icon: "food-apple",               cat: "اجتماعي" },
  { id: "s11", label: "دعم ذوي الاحتياجات الخاصة",      icon: "wheelchair-accessibility", cat: "اجتماعي" },
  { id: "s12", label: "الإرشاد الأسري والاجتماعي",      icon: "account-multiple",         cat: "اجتماعي" },
  { id: "s13", label: "استخراج الوثائق الرسمية",        icon: "file-document",            cat: "حكومي" },
  { id: "s14", label: "التسجيل والترخيص",                icon: "clipboard-check",          cat: "حكومي" },
  { id: "s15", label: "الخدمات القانونية والقضائية",    icon: "gavel",                    cat: "حكومي" },
  { id: "s16", label: "الضرائب والرسوم",                 icon: "receipt",                  cat: "حكومي" },
  { id: "s17", label: "البيع بالتجزئة والجملة",         icon: "shopping",                 cat: "تجارة" },
  { id: "s18", label: "الخدمات المصرفية والمالية",       icon: "bank",                     cat: "تجارة" },
  { id: "s19", label: "الحوالات والدفع الإلكتروني",     icon: "transfer",                 cat: "تجارة" },
  { id: "s20", label: "توفير فرص العمل",                 icon: "briefcase",                cat: "تجارة" },
  { id: "s21", label: "الخدمات الدينية والروحية",       icon: "mosque",                   cat: "ديني" },
  { id: "s22", label: "التوعية والإرشاد الديني",        icon: "book-open-outline",        cat: "ديني" },
  { id: "s23", label: "التدريب الرياضي",                 icon: "basketball",               cat: "رياضة" },
  { id: "s24", label: "الأنشطة الشبابية",                icon: "run",                      cat: "رياضة" },
  { id: "s25", label: "حماية البيئة",                    icon: "leaf",                     cat: "بيئة" },
  { id: "s26", label: "الزراعة والإرشاد الزراعي",       icon: "sprout",                   cat: "بيئة" },
  { id: "s27", label: "نشر الأخبار والمعلومات",         icon: "newspaper",                cat: "إعلام" },
  { id: "s28", label: "التوعية المجتمعية",               icon: "bullhorn",                 cat: "إعلام" },
];

type PaymentSettings = {
  cash: boolean;
  transfer: boolean;
  account_number: string;
  bank_name: string;
};

type InstData = {
  id: number;
  inst_name: string;
  inst_type: string;
  inst_category: string;
  inst_description: string;
  inst_address: string;
  inst_phone: string;
  inst_email?: string;
  rep_name: string;
  rep_title: string;
  rep_photo_url?: string;
  selected_services: string;
  services_availability: Record<string, boolean>;
  payment_settings: PaymentSettings;
  status: string;
  created_at: string;
};

// ══════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════
export default function InstPortalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [token, setToken]   = useState<string | null>(null);
  const [inst, setInst]     = useState<InstData | null>(null);
  const [loading, setLoading] = useState(true);

  // بيانات تسجيل الدخول
  const [phone, setPhone]       = useState("");
  const [natId, setNatId]       = useState("");
  const [showId, setShowId]     = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError]     = useState("");

  // حالة الخدمات
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // إعدادات الدفع
  const [paymentCash,     setPaymentCash]     = useState(true);
  const [paymentTransfer, setPaymentTransfer] = useState(false);
  const [accountNumber,   setAccountNumber]   = useState("");
  const [bankName,        setBankName]        = useState("");
  const [savingPayment,   setSavingPayment]   = useState(false);
  const [savedPayment,    setSavedPayment]    = useState(false);

  // ── تحقق من وجود جلسة مخزنة ──
  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(TOKEN_KEY);
        const d = await AsyncStorage.getItem(INST_KEY);
        if (t && d) {
          setToken(t);
          const parsed: InstData = JSON.parse(d);
          setInst(parsed);
          initAvailability(parsed);
          await refreshMyInfo(t);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const initAvailability = (data: InstData) => {
    const services: string[] = JSON.parse(data.selected_services || "[]");
    const avail: Record<string, boolean> = {};
    services.forEach(id => {
      avail[id] = data.services_availability?.[id] !== false;
    });
    setAvailability(avail);
  };

  const initPaymentSettings = (data: InstData) => {
    const ps: PaymentSettings = data.payment_settings || { cash: true, transfer: false, account_number: "", bank_name: "" };
    setPaymentCash(ps.cash !== false);
    setPaymentTransfer(!!ps.transfer);
    setAccountNumber(ps.account_number || "");
    setBankName(ps.bank_name || "");
  };

  const refreshMyInfo = async (tok: string) => {
    try {
      const base = getApiUrl();
      if (!base) return;
      const res = await fetch(`${base}/api/inst/my-info`, {
        headers: { Authorization: `InstBearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json() as { institution: InstData };
        setInst(data.institution);
        initAvailability(data.institution);
        initPaymentSettings(data.institution);
        await AsyncStorage.setItem(INST_KEY, JSON.stringify(data.institution));
      } else {
        await doLogout();
      }
    } catch {}
  };

  const savePaymentSettings = async () => {
    if (!token) return;
    if (paymentTransfer && !accountNumber.trim()) {
      Alert.alert("خطأ", "يرجى إدخال رقم الحساب البنكي لتفعيل التحويل");
      return;
    }
    setSavingPayment(true);
    try {
      const base = getApiUrl();
      if (!base) { Alert.alert("خطأ", "الخدمة غير متاحة"); return; }
      const ps: PaymentSettings = {
        cash: paymentCash, transfer: paymentTransfer,
        account_number: accountNumber.trim(), bank_name: bankName.trim(),
      };
      const res = await fetch(`${base}/api/inst/payment-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify({ payment_settings: ps }),
      });
      if (res.ok) {
        setSavedPayment(true);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setSavedPayment(false), 3000);
      } else {
        const err = await res.json() as any;
        Alert.alert("خطأ", err.error || "تعذّر الحفظ");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSavingPayment(false); }
  };

  const doLogin = async () => {
    const p = phone.trim();
    const n = natId.trim();
    if (!p || !n) { setLoginError("يرجى إدخال رقم الهاتف والرقم الوطني"); return; }
    setLoginError("");
    setLoginLoading(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const base = getApiUrl();
      if (!base) { setLoginError("الخدمة غير متاحة حالياً"); setLoginLoading(false); return; }
      const res = await fetch(`${base}/api/inst/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, national_id: n }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setLoginError(data.error || "بيانات غير صحيحة"); return; }
      setToken(data.token);
      setInst(data.institution);
      initAvailability(data.institution);
      initPaymentSettings(data.institution);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      await AsyncStorage.setItem(INST_KEY, JSON.stringify(data.institution));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setLoginError("خطأ في الاتصال، تأكد من اتصالك بالإنترنت");
    } finally {
      setLoginLoading(false);
    }
  };

  const doLogout = async () => {
    try {
      const base = getApiUrl();
      if (base && token) {
        await fetch(`${base}/api/inst/logout`, {
          method: "POST",
          headers: { Authorization: `InstBearer ${token}` },
        });
      }
    } catch {}
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(INST_KEY);
    setToken(null);
    setInst(null);
    setAvailability({});
  };

  const toggleService = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSaved(false);
    setAvailability(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const saveAvailability = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const base = getApiUrl();
      if (!base) { Alert.alert("خطأ", "الخدمة غير متاحة"); return; }
      const res = await fetch(`${base}/api/inst/services-availability`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `InstBearer ${token}` },
        body: JSON.stringify({ services_availability: availability }),
      });
      if (res.ok) {
        setSaved(true);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const err = await res.json() as any;
        Alert.alert("خطأ", err.error || "تعذّر الحفظ");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── شاشة تسجيل الدخول ──
  if (!token || !inst) {
    return <LoginScreen
      phone={phone} setPhone={setPhone}
      natId={natId} setNatId={setNatId}
      showId={showId} setShowId={setShowId}
      loginLoading={loginLoading} loginError={loginError}
      onLogin={doLogin}
      onBack={() => router.back()}
      insets={insets}
    />;
  }

  // ── لوحة التحكم ──
  const selectedServices: string[] = JSON.parse(inst.selected_services || "[]");
  const cfg = TYPE_CONFIG[inst.inst_type] || TYPE_CONFIG.other;
  const availableCount = selectedServices.filter(id => availability[id] !== false).length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* الرأس */}
      <LinearGradient
        colors={[cfg.color + "22", Colors.cardBg, Colors.bg]}
        style={[ds.header, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 12 }]}
      >
        <View style={ds.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={ds.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={ds.headerName} numberOfLines={1}>{inst.inst_name}</Text>
            <View style={[ds.typeBadge, { backgroundColor: cfg.color + "20", borderColor: cfg.color + "40" }]}>
              <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={[ds.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <View style={[ds.instIcon, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
            <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
          </View>
        </View>

        {/* إحصائيات سريعة */}
        <View style={ds.statsRow}>
          {[
            { val: selectedServices.length, label: "إجمالي الخدمات", color: Colors.cyber },
            { val: availableCount, label: "متوفرة الآن", color: Colors.primary },
            { val: selectedServices.length - availableCount, label: "غير متوفرة", color: Colors.danger },
          ].map((s, i) => (
            <View key={i} style={[ds.statCell, i < 2 && { borderRightWidth: 1, borderRightColor: Colors.divider }]}>
              <Text style={[ds.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={ds.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* بطاقة المعلومات */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <View style={ds.infoCard}>
            <View style={ds.infoCardHeader}>
              <MaterialCommunityIcons name="card-account-details-outline" size={18} color={Colors.cyber} />
              <Text style={ds.infoCardTitle}>بيانات المؤسسة</Text>
            </View>
            {[
              { icon: "account-outline",   label: "الممثل القانوني", val: `${inst.rep_name} — ${inst.rep_title}` },
              { icon: "phone-outline",     label: "هاتف المؤسسة",   val: inst.inst_phone },
              { icon: "map-marker-outline", label: "العنوان",        val: inst.inst_address },
              ...(inst.inst_email ? [{ icon: "email-outline", label: "البريد الإلكتروني", val: inst.inst_email }] : []),
            ].map((row, i) => (
              <View key={i} style={ds.infoRow}>
                <Text style={ds.infoVal} numberOfLines={1}>{row.val}</Text>
                <View style={ds.infoLabelRow}>
                  <Ionicons name={row.icon as any} size={14} color={Colors.textMuted} />
                  <Text style={ds.infoLabel}>{row.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* تنبيه الحفظ */}
        {saved && (
          <Animated.View entering={ZoomIn.springify()}>
            <View style={ds.savedBanner}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
              <Text style={ds.savedText}>تم حفظ إعدادات الخدمات بنجاح</Text>
            </View>
          </Animated.View>
        )}

        {/* إدارة الخدمات */}
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <View style={ds.servicesCard}>
            <View style={ds.servicesHeader}>
              <View style={ds.servicesHeaderLeft}>
                <View style={[ds.servicesBadge, { backgroundColor: Colors.primary + "20" }]}>
                  <Text style={[ds.servicesBadgeText, { color: Colors.primary }]}>{availableCount} / {selectedServices.length}</Text>
                </View>
              </View>
              <View style={ds.servicesHeaderRight}>
                <MaterialCommunityIcons name="cog-outline" size={18} color={Colors.primary} />
                <Text style={ds.servicesTitle}>إدارة الخدمات</Text>
              </View>
            </View>

            <Text style={ds.servicesDesc}>
              فعّل أو أوقف كل خدمة لتظهر أو تختفي من صفحتك أمام المواطنين
            </Text>

            <View style={ds.servicesDivider} />

            {selectedServices.length === 0 ? (
              <View style={ds.emptyServices}>
                <MaterialCommunityIcons name="playlist-remove" size={36} color={Colors.textMuted} />
                <Text style={ds.emptyServicesText}>لا توجد خدمات مسجّلة</Text>
              </View>
            ) : (
              <View style={ds.servicesList}>
                {selectedServices.map((svcId, idx) => {
                  const svc = ALL_SERVICES.find(s => s.id === svcId);
                  const isOn = availability[svcId] !== false;
                  if (!svc) return null;
                  return (
                    <Animated.View key={svcId} entering={FadeInDown.delay(200 + idx * 40).springify()}>
                      <TouchableOpacity
                        style={[ds.serviceRow, !isOn && ds.serviceRowOff]}
                        onPress={() => toggleService(svcId)}
                        activeOpacity={0.75}
                      >
                        <Switch
                          value={isOn}
                          onValueChange={() => toggleService(svcId)}
                          trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
                          thumbColor={isOn ? Colors.primary : Colors.textMuted}
                          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                        />
                        <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                          <Text style={[ds.serviceName, !isOn && { color: Colors.textMuted }]}>
                            {svc.label}
                          </Text>
                          <View style={[ds.serviceCatBadge, { backgroundColor: isOn ? Colors.primary + "15" : Colors.bg }]}>
                            <Text style={[ds.serviceCat, { color: isOn ? Colors.primary : Colors.textMuted }]}>
                              {svc.cat}
                            </Text>
                          </View>
                        </View>
                        <View style={[ds.serviceIconBox, {
                          backgroundColor: isOn ? Colors.primary + "15" : Colors.bg,
                          borderColor: isOn ? Colors.primary + "30" : Colors.divider,
                        }]}>
                          <MaterialCommunityIcons
                            name={svc.icon as any}
                            size={20}
                            color={isOn ? Colors.primary : Colors.textMuted}
                          />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>

        {/* ══ إعدادات الدفع ══ */}
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <View style={ps.card}>
            <View style={ps.cardHeader}>
              <MaterialCommunityIcons name="bank-transfer" size={18} color={Colors.accent} />
              <Text style={ps.cardTitle}>إعدادات الدفع</Text>
            </View>
            <Text style={ps.cardDesc}>
              حدّد طرق الدفع التي تقبلها مؤسستك من المستفيدين
            </Text>
            <View style={ps.divider} />

            {/* كاش */}
            <View style={ps.methodRow}>
              <Switch
                value={paymentCash}
                onValueChange={v => { setPaymentCash(v); setSavedPayment(false); }}
                trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
                thumbColor={paymentCash ? Colors.primary : Colors.textMuted}
              />
              <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                <Text style={ps.methodLabel}>الدفع النقدي (كاش)</Text>
                <Text style={ps.methodSub}>يدفع المستفيد نقداً عند الحضور</Text>
              </View>
              <View style={[ps.methodIcon, { backgroundColor: Colors.primary + "15" }]}>
                <MaterialCommunityIcons name="cash" size={22} color={Colors.primary} />
              </View>
            </View>

            {/* تحويل بنكي */}
            <View style={ps.methodRow}>
              <Switch
                value={paymentTransfer}
                onValueChange={v => { setPaymentTransfer(v); setSavedPayment(false); }}
                trackColor={{ false: Colors.divider, true: Colors.accent + "60" }}
                thumbColor={paymentTransfer ? Colors.accent : Colors.textMuted}
              />
              <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                <Text style={ps.methodLabel}>التحويل البنكي</Text>
                <Text style={ps.methodSub}>يحوّل المستفيد ويرفع صورة الإشعار</Text>
              </View>
              <View style={[ps.methodIcon, { backgroundColor: Colors.accent + "15" }]}>
                <MaterialCommunityIcons name="bank-transfer" size={22} color={Colors.accent} />
              </View>
            </View>

            {/* بيانات الحساب — تظهر عند تفعيل التحويل */}
            {paymentTransfer && (
              <Animated.View entering={FadeInDown.springify()} style={ps.accountBox}>
                <View style={ps.accountHeader}>
                  <MaterialCommunityIcons name="credit-card-outline" size={16} color={Colors.accent} />
                  <Text style={ps.accountHeaderText}>بيانات الحساب البنكي</Text>
                </View>
                <View style={ps.field}>
                  <Text style={ps.fieldLabel}>اسم البنك</Text>
                  <TextInput
                    style={ps.fieldInput}
                    value={bankName}
                    onChangeText={t => { setBankName(t); setSavedPayment(false); }}
                    placeholder="مثال: بنك الخرطوم"
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                  />
                </View>
                <View style={ps.field}>
                  <Text style={ps.fieldLabel}>رقم الحساب / رقم الهاتف <Text style={{ color: Colors.danger }}>*</Text></Text>
                  <TextInput
                    style={ps.fieldInput}
                    value={accountNumber}
                    onChangeText={t => { setAccountNumber(t); setSavedPayment(false); }}
                    placeholder="رقم حساب المؤسسة"
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                    keyboardType="numeric"
                  />
                </View>
                <View style={ps.noteBox}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.cyber} />
                  <Text style={ps.noteText}>
                    سيظهر هذا الرقم للمستفيدين عند اختيار التحويل ويمكنهم رفع إشعار التحويل
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* تنبيه الحفظ */}
            {savedPayment && (
              <Animated.View entering={ZoomIn.springify()} style={ds.savedBanner}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                <Text style={[ds.savedText, { color: Colors.accent }]}>تم حفظ إعدادات الدفع</Text>
              </Animated.View>
            )}

            <TouchableOpacity onPress={savePaymentSettings} disabled={savingPayment} activeOpacity={0.85}>
              <LinearGradient
                colors={savingPayment ? [Colors.divider, Colors.divider] : [Colors.accent, Colors.accent + "CC"]}
                style={ds.saveBtn}
              >
                {savingPayment
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="save-outline" size={20} color="#fff" />
                      <Text style={ds.saveBtnText}>حفظ إعدادات الدفع</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* بطاقة إدارة المستوصف — تظهر فقط للمؤسسات الصحية */}
        {inst.inst_type === "health" && (
          <Animated.View entering={FadeInDown.delay(280).springify()}>
            <TouchableOpacity
              onPress={() => router.push("/clinic-portal" as any)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={["#200810", "#1A0C12"]}
                style={cln.card}
              >
                <View style={cln.rightCol}>
                  <Text style={cln.cardTitle}>إدارة المستوصف</Text>
                  <Text style={cln.cardSub}>الخدمات · الأسعار · أوقات العمل</Text>
                  <View style={cln.tagsRow}>
                    {["إخفاء / إظهار الخدمات", "تحديد الأسعار", "أوقات الدوام"].map((t, i) => (
                      <View key={i} style={cln.tag}>
                        <Text style={cln.tagText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={cln.iconBox}>
                  <MaterialCommunityIcons name="hospital-building" size={32} color="#E74C6F" />
                  <Ionicons name="chevron-back" size={16} color="#E74C6F80" style={{ marginTop: 4 }} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* أزرار الإجراءات */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={{ gap: 10 }}>
          <TouchableOpacity onPress={saveAvailability} disabled={saving} activeOpacity={0.85}>
            <LinearGradient
              colors={saving ? [Colors.divider, Colors.divider] : [Colors.primary, Colors.primary + "CC"]}
              style={ds.saveBtn}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={ds.saveBtnText}>حفظ إعدادات الخدمات</Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={ds.logoutBtn}
            onPress={() => Alert.alert(
              "تسجيل الخروج",
              "هل تريد تسجيل الخروج من بوابة المؤسسة؟",
              [
                { text: "إلغاء", style: "cancel" },
                { text: "خروج", style: "destructive", onPress: doLogout },
              ]
            )}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            <Text style={ds.logoutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// مكوّن: شاشة تسجيل الدخول
// ══════════════════════════════════════════════════════
function LoginScreen({
  phone, setPhone, natId, setNatId,
  showId, setShowId, loginLoading, loginError,
  onLogin, onBack, insets,
}: {
  phone: string; setPhone: (v: string) => void;
  natId: string; setNatId: (v: string) => void;
  showId: boolean; setShowId: (v: boolean) => void;
  loginLoading: boolean; loginError: string;
  onLogin: () => void; onBack: () => void;
  insets: any;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* خلفية متدرجة */}
      <LinearGradient
        colors={["#0A2014", "#0B2B18", Colors.bg]}
        style={[ls.hero, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 16 }]}
      >
        <TouchableOpacity onPress={onBack} style={ls.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <Animated.View entering={FadeIn.delay(100).duration(500)} style={ls.heroContent}>
          <LinearGradient colors={[Colors.primary + "30", Colors.primary + "15"]} style={ls.logoBox}>
            <MaterialCommunityIcons name="office-building-cog" size={36} color={Colors.primary} />
          </LinearGradient>
          <Text style={ls.heroTitle}>بوابة المؤسسات</Text>
          <Text style={ls.heroSub}>ادارة خدمات مؤسستك في حصاحيصاوي</Text>
        </Animated.View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={ls.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(150).springify()} style={ls.formCard}>
          {/* عنوان النموذج */}
          <View style={ls.formHeader}>
            <View style={ls.formHeaderLine} />
            <Text style={ls.formTitle}>تسجيل دخول المؤسسة</Text>
          </View>

          <Text style={ls.formNote}>
            أدخل رقم هاتف المؤسسة أو ممثلها والرقم الوطني للممثل القانوني
          </Text>

          {/* خطأ */}
          {!!loginError && (
            <Animated.View entering={FadeIn.duration(300)} style={ls.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={ls.errorText}>{loginError}</Text>
            </Animated.View>
          )}

          {/* حقل رقم الهاتف */}
          <View style={ls.fieldBlock}>
            <Text style={ls.fieldLabel}>رقم هاتف المؤسسة / الممثل <Text style={{ color: Colors.danger }}>*</Text></Text>
            <View style={ls.fieldRow}>
              <TextInput
                style={ls.fieldInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+2499XXXXXXXX"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                textAlign="right"
                autoCapitalize="none"
              />
              <View style={ls.fieldIcon}>
                <Ionicons name="phone-portrait-outline" size={18} color={Colors.textMuted} />
              </View>
            </View>
          </View>

          {/* حقل الرقم الوطني */}
          <View style={ls.fieldBlock}>
            <Text style={ls.fieldLabel}>الرقم الوطني للممثل القانوني <Text style={{ color: Colors.danger }}>*</Text></Text>
            <View style={ls.fieldRow}>
              <TouchableOpacity onPress={() => setShowId(!showId)} style={ls.fieldEye}>
                <Ionicons name={showId ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
              </TouchableOpacity>
              <TextInput
                style={ls.fieldInput}
                value={natId}
                onChangeText={setNatId}
                placeholder="الرقم الوطني كاملاً"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showId}
                keyboardType="number-pad"
                textAlign="right"
                autoCapitalize="none"
              />
              <View style={ls.fieldIcon}>
                <Ionicons name="card-outline" size={18} color={Colors.textMuted} />
              </View>
            </View>
          </View>

          {/* زر الدخول */}
          <TouchableOpacity onPress={onLogin} disabled={loginLoading} activeOpacity={0.85} style={{ marginTop: 8 }}>
            <LinearGradient
              colors={loginLoading ? [Colors.divider, Colors.divider] : [Colors.primary, Colors.primaryDim]}
              style={ls.loginBtn}
            >
              {loginLoading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="arrow-back" size={18} color="#fff" />
                    <Text style={ls.loginBtnText}>دخول البوابة</Text>
                    <MaterialCommunityIcons name="office-building-cog" size={18} color="#fff" />
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* معلومات إضافية */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={ls.helpBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.cyber} />
          <Text style={ls.helpText}>
            بيانات الدخول هي نفس بيانات طلب الانضمام. إذا واجهت مشكلة تواصل مع إدارة المنصة.
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════
const ds = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.cardBg, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.divider,
  },
  instIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  headerName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  typeBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  typeLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },

  statsRow: { flexDirection: "row", backgroundColor: Colors.cardBg, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.divider },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statVal:  { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statLabel:{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  infoCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, gap: 10,
  },
  infoCardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 },
  infoCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  infoRow: { gap: 2 },
  infoLabelRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  infoLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  infoVal:   { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },

  savedBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary + "15", borderWidth: 1, borderColor: Colors.primary + "40",
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  savedText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },

  servicesCard: {
    backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, gap: 12,
  },
  servicesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  servicesHeaderRight: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  servicesHeaderLeft: {},
  servicesTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  servicesBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  servicesBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  servicesDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  servicesDivider: { height: 1, backgroundColor: Colors.divider },

  servicesList: { gap: 8 },
  serviceRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.primary + "25",
  },
  serviceRowOff: { borderColor: Colors.divider, opacity: 0.75 },
  serviceIconBox: {
    width: 42, height: 42, borderRadius: 11,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  serviceName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  serviceCatBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, alignSelf: "flex-end" },
  serviceCat: { fontFamily: "Cairo_400Regular", fontSize: 10 },

  emptyServices: { alignItems: "center", paddingVertical: 24, gap: 10 },
  emptyServicesText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },

  saveBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  logoutBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.danger + "40", backgroundColor: Colors.danger + "08",
  },
  logoutText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.danger },
});

const ls = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 32 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.cardBg + "80", justifyContent: "center",
    alignItems: "center", marginBottom: 24,
  },
  heroContent: { alignItems: "center", gap: 12 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
  },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary },
  heroSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },

  body: { padding: 16, paddingBottom: 60, gap: 14 },

  formCard: {
    backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: Colors.divider, gap: 14,
  },
  formHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  formHeaderLine: { width: 4, height: 22, borderRadius: 2, backgroundColor: Colors.primary },
  formTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  formNote:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },

  errorBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.danger + "12", borderWidth: 1, borderColor: Colors.danger + "30",
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12,
  },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.danger, flex: 1, textAlign: "right" },

  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldRow: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
  },
  fieldIcon: { paddingHorizontal: 12 },
  fieldEye:  { paddingHorizontal: 12 },
  fieldInput: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textPrimary, paddingVertical: 13, paddingRight: 4,
  },

  loginBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14,
  },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  helpBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.cyber + "10", borderWidth: 1, borderColor: Colors.cyber + "25",
    borderRadius: 12, padding: 12,
  },
  helpText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary,
    flex: 1, textAlign: "right", lineHeight: 20,
  },
});

const ps = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.accent + "30", gap: 14,
  },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  divider: { height: 1, backgroundColor: Colors.divider },
  methodRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: Colors.bg, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  methodIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
  },
  methodLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  methodSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  accountBox: {
    backgroundColor: Colors.accent + "08", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "25", gap: 12,
  },
  accountHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  accountHeaderText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.accent },
  field: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  fieldInput: {
    backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
  },
  noteBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.cyber + "10", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.cyber + "25",
  },
  noteText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 18 },
});

const cln = StyleSheet.create({
  card: {
    flexDirection: "row-reverse", alignItems: "center", gap: 14,
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "#E74C6F35",
  },
  rightCol: { flex: 1, alignItems: "flex-end", gap: 5 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#F4A0B0" },
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#C43057AA" },
  tagsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 4 },
  tag: {
    backgroundColor: "#E74C6F18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: "#E74C6F30",
  },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "#E74C6F" },
  iconBox: { alignItems: "center", gap: 2 },
});
