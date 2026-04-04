import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert, TextInput,
  ActivityIndicator, RefreshControl, Modal, Pressable,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence, Easing, ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const ACCENT  = "#F97316";
const ACCENT2 = "#FBBF24";
const GREEN   = "#3EFF9C";
const BLUE    = "#3E9CBF";

// ─── Types ────────────────────────────────────────────────────────────────────
type Driver = {
  id: number; name: string; vehicle_type: string; vehicle_desc: string;
  area: string; is_online: boolean; total_trips: number; rating: number;
};
type Trip = {
  id: number; user_name: string; trip_type: string;
  from_location: string; to_location: string; status: string;
  driver_name: string | null; created_at: string; rating: number | null;
};
type RegisterForm = {
  name: string; phone: string; vehicle_type: string;
  vehicle_desc: string; plate: string; area: string;
};
type TripForm = {
  user_name: string; user_phone: string;
  trip_type: "ride" | "delivery";
  from_location: string; to_location: string; notes: string;
};

// ─── Coming Soon Screen ────────────────────────────────────────────────────────
function ComingSoonScreen({ note }: { note?: string }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const shimmer = useSharedValue(0);
  const scale   = useSharedValue(0.8);
  const opacity = useSharedValue(1);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    );
    scale.value  = withRepeat(withTiming(1.6, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    opacity.value = withRepeat(withTiming(0,   { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, []);

  const soonStyle  = useAnimatedStyle(() => ({ opacity: 0.7 + shimmer.value * 0.3 }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  const handleNotifyMe = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("✅ شكراً لاهتمامك", "سنُعلمك فور إطلاق خدمة الترحال والتوصيل. ترقّب التحديثات القادمة!", [{ text: "حسناً" }]);
  };

  return (
    <View style={cs.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#081A0E", "#0D2B17", "#112E1B"]} style={[cs.hero, { paddingTop: topPad + 16 }]}>
          <View style={cs.dot1} /><View style={cs.dot2} /><View style={cs.dot3} />

          <Animated.View entering={FadeIn.delay(100).duration(600)} style={cs.iconCluster}>
            <View style={cs.pulseWrap}>
              <Animated.View style={[{ position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: ACCENT }, pulseStyle]} />
              <Animated.View style={[{ position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: ACCENT2 }, pulseStyle]} />
              <LinearGradient colors={[ACCENT + "30", ACCENT2 + "20"]} style={cs.iconCircle}>
                <MaterialCommunityIcons name="car-side" size={36} color={ACCENT} />
              </LinearGradient>
            </View>
            <View style={cs.smallIconRow}>
              {[
                { icon: "rickshaw", color: BLUE },
                { icon: "package-variant", color: "#A855F7" },
                { icon: "map-marker-radius", color: GREEN },
              ].map((ic, i) => (
                <View key={i} style={[cs.smallIcon, { backgroundColor: ic.color + "20", borderColor: ic.color + "40" }]}>
                  <MaterialCommunityIcons name={ic.icon as any} size={22} color={ic.color} />
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).springify()} style={cs.soonBadgeWrap}>
            <Animated.View style={[cs.soonBadge, soonStyle]}>
              <MaterialCommunityIcons name="clock-fast" size={13} color={ACCENT2} />
              <Text style={cs.soonBadgeText}>قريباً · سيتم التفعيل</Text>
            </Animated.View>
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(280).springify()} style={cs.heroTitle}>
            ترحال والتوصيل{"\n"}مشاويرك علينا
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(340).springify()} style={cs.heroSub}>
            منصة ربط بين السكان وأصحاب السيارات والركشات{"\n"}
            لتسهيل التنقل وتوصيل الطلبات داخل الحصاحيصا
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(400).springify()} style={cs.statsRow}>
            {[
              { num: "٢٤س",  label: "متاح يومياً",    color: ACCENT  },
              { num: "٥٠٠+", label: "سائق مرتقب",    color: ACCENT2 },
              { num: "٣ د",  label: "متوسط الوصول", color: GREEN   },
            ].map((st, i) => (
              <View key={i} style={cs.statItem}>
                <Text style={[cs.statNum, { color: st.color }]}>{st.num}</Text>
                <Text style={cs.statLabel}>{st.label}</Text>
              </View>
            ))}
          </Animated.View>
        </LinearGradient>

        <View style={cs.body}>
          {note ? (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={cs.noteCard}>
              <MaterialCommunityIcons name="information-outline" size={18} color={ACCENT2} />
              <Text style={cs.noteText}>{note}</Text>
            </Animated.View>
          ) : null}

          {/* مميزات */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={cs.secRow}>
            <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={cs.secBar} />
            <Text style={cs.secTitle}>ما الذي تقدمه الخدمة؟</Text>
          </Animated.View>
          <View style={cs.featGrid}>
            {[
              { icon: "car-side",        color: BLUE,      label: "توصيل بالسيارات",   sub: "رحلات مريحة وسريعة داخل المدينة" },
              { icon: "rickshaw",        color: ACCENT,    label: "مشاوير بالركشة",    sub: "وسيلة التنقل الشعبية بتكلفة منخفضة" },
              { icon: "package-variant", color: "#A855F7", label: "توصيل الطلبات",     sub: "إيصال بضائع لباب البيت" },
              { icon: "map-marker-path", color: GREEN,     label: "تتبع لحظي",         sub: "تتبع موقع السائق في الوقت الفعلي" },
              { icon: "star-circle",     color: ACCENT2,   label: "تقييم السائقين",    sub: "نظام تقييم لضمان جودة الخدمة" },
              { icon: "shield-check",    color: BLUE,      label: "رحلات آمنة",         sub: "سائقون موثّقون ومراجَعون من الإدارة" },
            ].map((f, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(150 + i * 50).springify()} style={cs.featCard}>
                <View style={[cs.featIcon, { backgroundColor: f.color + "18", borderColor: f.color + "30" }]}>
                  <MaterialCommunityIcons name={f.icon as any} size={22} color={f.color} />
                </View>
                <Text style={cs.featLabel}>{f.label}</Text>
                <Text style={cs.featSub}>{f.sub}</Text>
                <View style={[cs.featLine, { backgroundColor: f.color + "70" }]} />
              </Animated.View>
            ))}
          </View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(460).springify()} style={cs.ctaCard}>
            <LinearGradient colors={[ACCENT + "20", ACCENT2 + "10"]} style={cs.ctaGrad}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={36} color={ACCENT} style={{ marginBottom: 10 }} />
              <Text style={cs.ctaTitle}>الخدمة قيد التجهيز</Text>
              <Text style={cs.ctaSub}>فريقنا يعمل على إطلاق الخدمة قريباً.{"\n"}سيتم إشعارك فور التفعيل الرسمي.</Text>
              <TouchableOpacity onPress={handleNotifyMe} style={cs.ctaBtn} activeOpacity={0.85}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={cs.ctaBtnGrad}>
                  <Ionicons name="notifications-outline" size={18} color="#fff" />
                  <Text style={cs.ctaBtnText}>أبلّغني عند الإطلاق</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Main Service Screen ───────────────────────────────────────────────────────
export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user, token } = useAuth();

  // حالة الخدمة
  const [enabled, setEnabled]   = useState<boolean | null>(null);
  const [note,    setNote]      = useState("");
  const [loading, setLoading]   = useState(true);

  // تبويبات
  const [activeTab, setActiveTab] = useState<"book" | "drivers" | "mytrips" | "register">("book");

  // بيانات
  const [drivers,   setDrivers]   = useState<Driver[]>([]);
  const [myTrips,   setMyTrips]   = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // نموذج الطلب
  const [tripForm, setTripForm] = useState<TripForm>({
    user_name: user?.name || "", user_phone: "",
    trip_type: "ride", from_location: "", to_location: "", notes: "",
  });
  const [submittingTrip, setSubmittingTrip] = useState(false);

  // نموذج تسجيل سائق
  const [regForm, setRegForm] = useState<RegisterForm>({
    name: user?.name || "", phone: "", vehicle_type: "سيارة",
    vehicle_desc: "", plate: "", area: "",
  });
  const [submittingReg, setSubmittingReg] = useState(false);

  const apiUrl = getApiUrl();

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/transport/status`);
      if (res.ok) {
        const d = await res.json();
        setEnabled(d.enabled);
        // حاول تحميل الملاحظة من API إن كانت موجودة
        if (!d.enabled) {
          const set = await fetch(`${apiUrl}/api/admin/transport/settings`).catch(() => null);
          if (set?.ok) {
            const sd = await set.json();
            setNote(sd.transport_note || "");
          }
        }
      }
    } catch { setEnabled(false); }
    finally { setLoading(false); }
  }, [apiUrl]);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/transport/drivers`);
      if (res.ok) setDrivers(await res.json());
    } catch {}
  }, [apiUrl]);

  const loadMyTrips = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/transport/my-trips`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMyTrips(await res.json());
    } catch {}
  }, [apiUrl, token]);

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => {
    if (enabled) {
      loadDrivers();
      loadMyTrips();
    }
  }, [enabled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDrivers(), loadMyTrips()]);
    setRefreshing(false);
  }, [loadDrivers, loadMyTrips]);

  const submitTrip = async () => {
    if (!tripForm.from_location || !tripForm.to_location || !tripForm.user_name || !tripForm.user_phone) {
      Alert.alert("بيانات ناقصة", "يرجى ملء جميع الحقول المطلوبة"); return;
    }
    setSubmittingTrip(true);
    try {
      const res = await fetch(`${apiUrl}/api/transport/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(tripForm),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تم الطلب", "تم إرسال طلبك بنجاح! سيتواصل معك السائق قريباً.", [{ text: "حسناً" }]);
        setTripForm(p => ({ ...p, from_location: "", to_location: "", notes: "" }));
        loadMyTrips();
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmittingTrip(false); }
  };

  const submitRegister = async () => {
    if (!regForm.name || !regForm.phone || !regForm.vehicle_type) {
      Alert.alert("بيانات ناقصة", "يرجى ملء جميع الحقول المطلوبة"); return;
    }
    setSubmittingReg(true);
    try {
      const res = await fetch(`${apiUrl}/api/transport/drivers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(regForm),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تم التسجيل", "تم إرسال طلب تسجيلك كسائق. ستتلقى إشعاراً عند مراجعة الطلب من الإدارة.", [{ text: "حسناً" }]);
        setRegForm({ name: user?.name || "", phone: "", vehicle_type: "سيارة", vehicle_desc: "", plate: "", area: "" });
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّر التسجيل");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmittingReg(false); }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  // ── Coming Soon ──
  if (!enabled) return <ComingSoonScreen note={note} />;

  // ── Full Service UI ──
  const TABS = [
    { key: "book",     label: "اطلب رحلة",    icon: "car-outline"           as const },
    { key: "drivers",  label: "السائقون",      icon: "people-outline"        as const },
    { key: "mytrips",  label: "طلباتي",        icon: "list-outline"          as const },
    { key: "register", label: "كن سائقاً",     icon: "car-sport-outline" as const },
  ];

  return (
    <View style={s.container}>
      {/* ── رأس الصفحة ── */}
      <LinearGradient colors={["#081A0E", "#0D2B17"]} style={[s.header, { paddingTop: topPad + 10 }]}>
        <View style={s.headerRow}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="car-side" size={22} color={ACCENT} />
          </View>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={s.headerTitle}>ترحال والتوصيل</Text>
            <Text style={s.headerSub}>مشاويرك علينا داخل الحصاحيصا</Text>
          </View>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>مفعّل</Text>
          </View>
        </View>

        {/* إحصائيات سريعة */}
        <View style={s.quickStats}>
          <View style={s.quickStat}>
            <Text style={[s.quickStatNum, { color: ACCENT }]}>{drivers.filter(d => d.is_online).length}</Text>
            <Text style={s.quickStatLabel}>سائق متاح</Text>
          </View>
          <View style={s.quickStatDiv} />
          <View style={s.quickStat}>
            <Text style={[s.quickStatNum, { color: GREEN }]}>{drivers.length}</Text>
            <Text style={s.quickStatLabel}>سائق معتمد</Text>
          </View>
          <View style={s.quickStatDiv} />
          <View style={s.quickStat}>
            <Text style={[s.quickStatNum, { color: BLUE }]}>{myTrips.length}</Text>
            <Text style={s.quickStatLabel}>طلباتي</Text>
          </View>
        </View>

        {/* تبويبات */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsScroll}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key as any)}
              style={[s.tabBtn, activeTab === t.key && s.tabBtnActive]}>
              <Ionicons name={t.icon} size={14} color={activeTab === t.key ? "#fff" : Colors.textSecondary} />
              <Text style={[s.tabLabel, activeTab === t.key && s.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* ── محتوى التبويبات ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ──── طلب رحلة ──── */}
        {activeTab === "book" && (
          <Animated.View entering={FadeInDown.springify()}>
            {/* نوع الطلب */}
            <Text style={s.secLabel}>نوع الخدمة</Text>
            <View style={{ flexDirection: "row-reverse", gap: 10, marginBottom: 16 }}>
              {([
                { key: "ride",     label: "مشوار",       icon: "car-side" },
                { key: "delivery", label: "توصيل طلب",   icon: "package-variant" },
              ] as const).map(t => (
                <TouchableOpacity key={t.key}
                  onPress={() => setTripForm(p => ({ ...p, trip_type: t.key }))}
                  style={[s.typeBtn, tripForm.trip_type === t.key && { borderColor: ACCENT, backgroundColor: ACCENT + "15" }]}>
                  <MaterialCommunityIcons name={t.icon} size={22} color={tripForm.trip_type === t.key ? ACCENT : Colors.textSecondary} />
                  <Text style={[s.typeBtnLabel, tripForm.trip_type === t.key && { color: ACCENT }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* بيانات الطالب */}
            <View style={s.formCard}>
              <Text style={s.formCardTitle}>بيانات الطلب</Text>

              <Text style={s.fieldLabel}>اسمك *</Text>
              <TextInput style={s.input} value={tripForm.user_name}
                onChangeText={v => setTripForm(p => ({ ...p, user_name: v }))}
                placeholder="اسمك الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>رقم هاتفك *</Text>
              <TextInput style={s.input} value={tripForm.user_phone}
                onChangeText={v => setTripForm(p => ({ ...p, user_phone: v }))}
                placeholder="+249..." placeholderTextColor={Colors.textMuted}
                textAlign="right" keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>{tripForm.trip_type === "delivery" ? "موقع الاستلام *" : "موقع الانطلاق *"}</Text>
              <TextInput style={s.input} value={tripForm.from_location}
                onChangeText={v => setTripForm(p => ({ ...p, from_location: v }))}
                placeholder="مثال: حي الجامعة، شارع النيل..." placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>{tripForm.trip_type === "delivery" ? "موقع التوصيل *" : "الوجهة المطلوبة *"}</Text>
              <TextInput style={s.input} value={tripForm.to_location}
                onChangeText={v => setTripForm(p => ({ ...p, to_location: v }))}
                placeholder="مثال: السوق الكبير، مستشفى المدينة..." placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>ملاحظات (اختياري)</Text>
              <TextInput style={[s.input, { minHeight: 72, textAlignVertical: "top" }]}
                value={tripForm.notes} onChangeText={v => setTripForm(p => ({ ...p, notes: v }))}
                placeholder="أي تفاصيل إضافية..." placeholderTextColor={Colors.textMuted}
                textAlign="right" multiline />

              <TouchableOpacity onPress={submitTrip} disabled={submittingTrip}
                style={{ marginTop: 4, borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.submitBtn}>
                  {submittingTrip
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name={tripForm.trip_type === "delivery" ? "package-variant-closed" : "car-arrow-right"} size={18} color="#fff" />
                        <Text style={s.submitBtnText}>{tripForm.trip_type === "delivery" ? "طلب توصيل" : "طلب مشوار"}</Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* كيف تعمل */}
            <View style={s.howCard}>
              <Text style={s.formCardTitle}>كيف يعمل الطلب؟</Text>
              {[
                { step: "١", text: "اختر نوع الخدمة: مشوار أو توصيل طلب" },
                { step: "٢", text: "أدخل موقع الانطلاق والوجهة" },
                { step: "٣", text: "أرسل الطلب وانتظر تواصل السائق" },
                { step: "٤", text: "قيّم السائق بعد اكتمال الرحلة" },
              ].map((h, i) => (
                <View key={i} style={s.howRow}>
                  <LinearGradient colors={[ACCENT, ACCENT2]} style={s.howBubble}>
                    <Text style={s.howStep}>{h.step}</Text>
                  </LinearGradient>
                  {i < 3 && <View style={s.howLine} />}
                  <Text style={s.howText}>{h.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ──── السائقون المتاحون ──── */}
        {activeTab === "drivers" && (
          <Animated.View entering={FadeInDown.springify()}>
            {drivers.length === 0 ? (
              <View style={s.emptyBox}>
                <MaterialCommunityIcons name="steering" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا يوجد سائقون متاحون حالياً</Text>
                <Text style={s.emptySub}>جرّب مرة أخرى لاحقاً</Text>
              </View>
            ) : drivers.map((d, i) => (
              <Animated.View entering={FadeInDown.delay(i * 60).springify()} key={d.id} style={s.driverCard}>
                <View style={s.driverRow}>
                  <LinearGradient colors={[ACCENT + "30", ACCENT2 + "20"]} style={s.driverAvatar}>
                    <MaterialCommunityIcons name="steering" size={22} color={ACCENT} />
                  </LinearGradient>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={s.driverName}>{d.name}</Text>
                    <Text style={s.driverVehicle}>{d.vehicle_type}{d.vehicle_desc ? ` — ${d.vehicle_desc}` : ""}</Text>
                    {d.area ? <Text style={s.driverArea}>📍 {d.area}</Text> : null}
                  </View>
                  <View style={[s.onlineBadge, { backgroundColor: d.is_online ? GREEN + "20" : Colors.divider }]}>
                    <View style={[s.onlineDot, { backgroundColor: d.is_online ? GREEN : Colors.textMuted }]} />
                    <Text style={[s.onlineText, { color: d.is_online ? GREEN : Colors.textMuted }]}>
                      {d.is_online ? "متاح" : "مشغول"}
                    </Text>
                  </View>
                </View>
                <View style={s.driverStats}>
                  <View style={s.driverStat}>
                    <Ionicons name="star" size={13} color={ACCENT2} />
                    <Text style={s.driverStatVal}>{d.rating > 0 ? d.rating.toFixed(1) : "—"}</Text>
                  </View>
                  <View style={s.driverStat}>
                    <Ionicons name="car-outline" size={13} color={Colors.textSecondary} />
                    <Text style={s.driverStatVal}>{d.total_trips} رحلة</Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* ──── طلباتي ──── */}
        {activeTab === "mytrips" && (
          <Animated.View entering={FadeInDown.springify()}>
            {!token ? (
              <View style={s.emptyBox}>
                <Ionicons name="lock-closed-outline" size={44} color={Colors.textMuted} />
                <Text style={s.emptyText}>يجب تسجيل الدخول</Text>
                <Text style={s.emptySub}>لعرض طلباتك السابقة</Text>
              </View>
            ) : myTrips.length === 0 ? (
              <View style={s.emptyBox}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا توجد طلبات سابقة</Text>
                <Text style={s.emptySub}>اطلب رحلتك الأولى!</Text>
              </View>
            ) : myTrips.map((trip, i) => (
              <Animated.View entering={FadeInDown.delay(i * 60).springify()} key={trip.id} style={s.tripCard}>
                <View style={s.tripHeader}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <MaterialCommunityIcons
                      name={trip.trip_type === "delivery" ? "package-variant" : "car-side"}
                      size={16} color={ACCENT} />
                    <Text style={s.tripType}>{trip.trip_type === "delivery" ? "توصيل طلب" : "مشوار"}</Text>
                  </View>
                  <View style={[s.tripStatusBadge, {
                    backgroundColor: trip.status === "completed" ? GREEN + "20"
                      : trip.status === "cancelled" ? "#E0556720"
                      : trip.status === "accepted" ? ACCENT + "20" : Colors.divider,
                  }]}>
                    <Text style={[s.tripStatusText, {
                      color: trip.status === "completed" ? GREEN
                        : trip.status === "cancelled" ? "#E05567"
                        : trip.status === "accepted" ? ACCENT : Colors.textSecondary,
                    }]}>
                      {trip.status === "pending" ? "انتظار" : trip.status === "accepted" ? "مقبول"
                        : trip.status === "completed" ? "مكتمل" : "ملغي"}
                    </Text>
                  </View>
                </View>
                <Text style={s.tripRoute}>من: {trip.from_location}</Text>
                <Text style={s.tripRoute}>إلى: {trip.to_location}</Text>
                {trip.driver_name ? (
                  <Text style={s.tripDriver}>السائق: {trip.driver_name}</Text>
                ) : null}
                {trip.rating ? (
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 4 }}>
                    {[1,2,3,4,5].map(star => (
                      <Ionicons key={star} name={star <= trip.rating! ? "star" : "star-outline"} size={14} color={ACCENT2} />
                    ))}
                  </View>
                ) : null}
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* ──── تسجيل سائق ──── */}
        {activeTab === "register" && (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[s.formCard, { borderColor: BLUE + "40" }]}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: BLUE + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name="steering" size={20} color={BLUE} />
                </View>
                <Text style={s.formCardTitle}>سجّل اهتمامك كسائق</Text>
              </View>
              <Text style={[s.formHint]}>سيتم مراجعة طلبك من الإدارة والتواصل معك عند القبول.</Text>

              <Text style={s.fieldLabel}>اسمك الكامل *</Text>
              <TextInput style={s.input} value={regForm.name}
                onChangeText={v => setRegForm(p => ({ ...p, name: v }))}
                placeholder="اسمك الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>رقم هاتفك *</Text>
              <TextInput style={s.input} value={regForm.phone}
                onChangeText={v => setRegForm(p => ({ ...p, phone: v }))}
                placeholder="+249..." placeholderTextColor={Colors.textMuted}
                textAlign="right" keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>نوع المركبة *</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 12 }}>
                {["سيارة", "ركشة", "بيك أب"].map(v => (
                  <TouchableOpacity key={v}
                    onPress={() => setRegForm(p => ({ ...p, vehicle_type: v }))}
                    style={[s.vehicleChip, regForm.vehicle_type === v && { borderColor: BLUE, backgroundColor: BLUE + "15" }]}>
                    <Text style={[s.vehicleChipText, regForm.vehicle_type === v && { color: BLUE }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>وصف المركبة (موديل، لون)</Text>
              <TextInput style={s.input} value={regForm.vehicle_desc}
                onChangeText={v => setRegForm(p => ({ ...p, vehicle_desc: v }))}
                placeholder="مثال: تويوتا كورولا 2018 بيضاء" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>رقم اللوحة</Text>
              <TextInput style={s.input} value={regForm.plate}
                onChangeText={v => setRegForm(p => ({ ...p, plate: v }))}
                placeholder="مثال: ك ب ج 1234" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>المنطقة التي تعمل فيها</Text>
              <TextInput style={s.input} value={regForm.area}
                onChangeText={v => setRegForm(p => ({ ...p, area: v }))}
                placeholder="مثال: وسط المدينة، حي الجامعة..." placeholderTextColor={Colors.textMuted} textAlign="right" />

              <TouchableOpacity onPress={submitRegister} disabled={submittingReg}
                style={{ marginTop: 8, borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                <LinearGradient colors={[BLUE, "#2B7FA0"]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.submitBtn}>
                  {submittingReg
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name="steering" size={18} color="#fff" />
                        <Text style={s.submitBtnText}>إرسال طلب التسجيل</Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* مميزات السائق */}
            <View style={[s.howCard, { borderColor: BLUE + "30" }]}>
              <Text style={s.formCardTitle}>مزايا الانضمام كسائق</Text>
              {[
                { icon: "cash", color: ACCENT2,  text: "دخل إضافي من خلال رحلاتك اليومية" },
                { icon: "shield-check", color: GREEN, text: "شارة سائق موثّق معتمد من الإدارة" },
                { icon: "star-circle", color: ACCENT, text: "نظام تقييم يبني سمعتك المهنية" },
                { icon: "bell-ring", color: BLUE,  text: "إشعارات فورية عند وصول الطلبات" },
              ].map((f, i) => (
                <View key={i} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: f.color + "18", alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name={f.icon as any} size={18} color={f.color} />
                  </View>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" }}>{f.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Coming Soon Styles ────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 20, paddingBottom: 30, alignItems: "center", position: "relative", overflow: "hidden" },
  dot1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: ACCENT + "08", top: -60, right: -60 },
  dot2: { position: "absolute", width: 150, height: 150, borderRadius: 75,  backgroundColor: ACCENT2 + "06", bottom: -40, left: -40 },
  dot3: { position: "absolute", width: 100, height: 100, borderRadius: 50,  backgroundColor: BLUE + "08", top: 80, left: 30 },
  iconCluster: { alignItems: "center", marginBottom: 16, marginTop: 8 },
  pulseWrap: { width: 90, height: 90, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconCircle: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: ACCENT + "50" },
  smallIconRow: { flexDirection: "row-reverse", gap: 12 },
  smallIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  soonBadgeWrap: { marginBottom: 12 },
  soonBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: ACCENT2 + "18", borderWidth: 1, borderColor: ACCENT2 + "40", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  soonBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT2 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 30, color: Colors.textPrimary, textAlign: "center", lineHeight: 42, marginBottom: 10 },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  statsRow: { flexDirection: "row-reverse", backgroundColor: "#ffffff08", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: ACCENT + "20", width: "100%" },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 20, backgroundColor: Colors.bg },
  noteCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: ACCENT2 + "12", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: ACCENT2 + "30", marginBottom: 20 },
  noteText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  secRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 },
  secBar: { width: 4, height: 22, borderRadius: 2 },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  featGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  featCard: { width: "47.5%", backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden" },
  featIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 10 },
  featLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  featSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", lineHeight: 18 },
  featLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },
  ctaCard: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: ACCENT + "30", marginBottom: 12 },
  ctaGrad: { padding: 24, alignItems: "center" },
  ctaTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, marginBottom: 8 },
  ctaSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  ctaBtn: { width: "100%" },
  ctaBtnGrad: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14 },
  ctaBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});

// ─── Main Service Styles ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: ACCENT + "20", borderWidth: 1, borderColor: ACCENT + "40", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  liveBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GREEN + "15", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: GREEN + "30" },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: GREEN },
  liveText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: GREEN },
  quickStats: { flexDirection: "row-reverse", backgroundColor: "#ffffff08", borderRadius: 12, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.divider },
  quickStat: { flex: 1, alignItems: "center" },
  quickStatNum: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  quickStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  quickStatDiv: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  tabsScroll: { paddingBottom: 12, gap: 8, flexDirection: "row-reverse" },
  tabBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tabBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  tabLabelActive: { color: "#fff" },
  secLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, marginBottom: 10, textAlign: "right" },
  typeBtn: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1.5, borderColor: Colors.divider, gap: 6 },
  typeBtnLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  formCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.divider, marginBottom: 16 },
  formCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, marginBottom: 14, textAlign: "right" },
  formHint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 14, lineHeight: 21 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, marginBottom: 6, textAlign: "right" },
  input: { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.divider, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, marginBottom: 12 },
  submitBtn: { paddingVertical: 14, borderRadius: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  howCard: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.divider, marginBottom: 16 },
  howRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, position: "relative", minHeight: 52 },
  howBubble: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  howLine: { position: "absolute", right: 14, top: 32, width: 2, height: 18, backgroundColor: ACCENT + "30" },
  howStep: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" },
  howText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", paddingTop: 5, lineHeight: 20 },
  driverCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider, marginBottom: 10 },
  driverRow: { flexDirection: "row-reverse", alignItems: "center", marginBottom: 10 },
  driverAvatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  driverName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  driverVehicle: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  driverArea: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  onlineBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5 },
  onlineText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  driverStats: { flexDirection: "row-reverse", gap: 14 },
  driverStat: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  driverStatVal: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  tripCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.divider, marginBottom: 10 },
  tripHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  tripType: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  tripStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  tripStatusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  tripRoute: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 3 },
  tripDriver: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: GREEN, textAlign: "right", marginTop: 4 },
  vehicleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  vehicleChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
});
