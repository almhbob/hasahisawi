import React, { useEffect, useState, useCallback } from "react";
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
import {
  TRANSPORT_ZONES, DEFAULT_FARE_MATRIX,
  type ZoneId, type FareMatrix,
  formatFare,
} from "@/constants/transport-zones";

const ACCENT  = "#F97316";
const ACCENT2 = "#FBBF24";
const GREEN   = "#3EFF9C";
const BLUE    = "#3E9CBF";

// ─── أنواع البيانات ────────────────────────────────────────────────────────────
type Driver = {
  id: number; name: string; vehicle_type: string; vehicle_desc: string;
  area: string; zone_id: number | null; is_online: boolean;
  total_trips: number; rating: number; phone: string;
};
type Trip = {
  id: number; user_name: string; trip_type: string;
  from_location: string; to_location: string;
  from_zone: number | null; to_zone: number | null;
  fare_estimate: number | null; vehicle_preference: string;
  status: string; driver_name: string | null;
  created_at: string; rating: number | null;
};

// ─── شاشة قريباً ──────────────────────────────────────────────────────────────
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
    scale.value   = withRepeat(withTiming(1.6, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    opacity.value = withRepeat(withTiming(0,   { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, []);

  const soonStyle  = useAnimatedStyle(() => ({ opacity: 0.7 + shimmer.value * 0.3 }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <View style={cs.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#081A0E", "#0D2B17", "#112E1B"]} style={[cs.hero, { paddingTop: topPad + 16 }]}>
          <Animated.View entering={FadeIn.delay(100).duration(600)} style={cs.iconCluster}>
            <View style={cs.pulseWrap}>
              <Animated.View style={[{ position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: ACCENT }, pulseStyle]} />
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
            منصة ربط بين السكان وأصحاب السيارات والركشات{"\n"}لتسهيل التنقل وتوصيل الطلبات داخل الحصاحيصا
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(400).springify()} style={cs.statsRow}>
            {[
              { num: "٢٤س",  label: "متاح يومياً",    color: ACCENT  },
              { num: "٥ مناطق", label: "تغطية المدينة", color: ACCENT2 },
              { num: "٣ د",  label: "متوسط الوصول",  color: GREEN   },
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

          {/* مناطق التغطية */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={cs.secRow}>
            <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={cs.secBar} />
            <Text style={cs.secTitle}>مناطق التغطية</Text>
          </Animated.View>
          <View style={{ gap: 8, marginBottom: 20 }}>
            {TRANSPORT_ZONES.map(z => (
              <View key={z.id} style={[cs.zonePreviewCard, { borderColor: z.color + "40" }]}>
                <View style={[cs.zonePreviewBadge, { backgroundColor: z.color + "20" }]}>
                  <Text style={[cs.zonePreviewNum, { color: z.color }]}>م{z.id}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cs.zonePreviewName}>{z.name}</Text>
                  <Text style={cs.zonePreviewDesc}>{z.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Animated.View entering={FadeInDown.delay(460).springify()} style={cs.ctaCard}>
            <LinearGradient colors={[ACCENT + "20", ACCENT2 + "10"]} style={cs.ctaGrad}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={36} color={ACCENT} style={{ marginBottom: 10 }} />
              <Text style={cs.ctaTitle}>الخدمة قيد التجهيز</Text>
              <Text style={cs.ctaSub}>فريقنا يعمل على إطلاق الخدمة قريباً.{"\n"}سيتم إشعارك فور التفعيل الرسمي.</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── اختيار المنطقة ───────────────────────────────────────────────────────────
function ZonePicker({
  label, value, onChange,
}: {
  label: string;
  value: ZoneId | null;
  onChange: (z: ZoneId) => void;
}) {
  const [open, setOpen] = useState(false);
  const zone = value ? TRANSPORT_ZONES.find(z => z.id === value) : null;

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={zp.btn} activeOpacity={0.8}>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} style={{ marginLeft: 6 }} />
        {zone ? (
          <View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <View style={[zp.badge, { backgroundColor: zone.color + "20" }]}>
              <Text style={[zp.badgeNum, { color: zone.color }]}>م{zone.id}</Text>
            </View>
            <Text style={zp.selectedText}>{zone.name}</Text>
          </View>
        ) : (
          <Text style={zp.placeholder}>{label}</Text>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={zp.backdrop} onPress={() => setOpen(false)}>
          <Animated.View entering={FadeInDown.springify().damping(20)} style={zp.sheet}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={zp.handle} />
              <Text style={zp.sheetTitle}>{label}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {TRANSPORT_ZONES.map(z => (
                  <TouchableOpacity key={z.id}
                    onPress={() => { onChange(z.id); setOpen(false); }}
                    style={[zp.zoneRow, value === z.id && { backgroundColor: z.color + "15" }]}
                    activeOpacity={0.75}>
                    <View style={{ flex: 1 }}>
                      <Text style={zp.zoneName}>{z.name}</Text>
                      <Text style={zp.zoneDesc}>{z.neighborhoods.slice(0, 4).join(" · ")}
                        {z.neighborhoods.length > 4 ? ` +${z.neighborhoods.length - 4}` : ""}
                      </Text>
                    </View>
                    <View style={[zp.zoneNumBadge, { backgroundColor: z.color + "20", borderColor: z.color + "40" }]}>
                      <Text style={[zp.zoneNum, { color: z.color }]}>منطقة {z.id}</Text>
                    </View>
                    {value === z.id && <Ionicons name="checkmark-circle" size={18} color={z.color} style={{ marginRight: 6 }} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── بطاقة تقدير التعرفة ──────────────────────────────────────────────────────
function FareEstimateCard({
  fromZone, toZone, fareMatrix, vehicleType, onVehicleChange,
}: {
  fromZone: ZoneId | null;
  toZone: ZoneId | null;
  fareMatrix: FareMatrix;
  vehicleType: "car" | "rickshaw" | "delivery";
  onVehicleChange: (v: "car" | "rickshaw" | "delivery") => void;
}) {
  if (!fromZone || !toZone) {
    return (
      <View style={fe.placeholder}>
        <MaterialCommunityIcons name="calculator-variant-outline" size={24} color={Colors.textMuted} />
        <Text style={fe.placeholderText}>اختر منطقتَي الانطلاق والوجهة{"\n"}لعرض التعرفة التقديرية</Text>
      </View>
    );
  }

  const fares = fareMatrix[fromZone]?.[toZone];
  if (!fares) return null;

  const fromZ = TRANSPORT_ZONES.find(z => z.id === fromZone);
  const toZ   = TRANSPORT_ZONES.find(z => z.id === toZone);

  const vehicles = [
    { key: "car" as const,      icon: "car-side",        label: "سيارة",       color: BLUE,      fare: fares.car      },
    { key: "rickshaw" as const,  icon: "rickshaw",        label: "ركشة",        color: ACCENT,    fare: fares.rickshaw },
    { key: "delivery" as const,  icon: "package-variant", label: "توصيل طلب",  color: "#A855F7", fare: fares.delivery },
  ];

  return (
    <Animated.View entering={ZoomIn.springify().damping(18)} style={fe.card}>
      <LinearGradient colors={[ACCENT + "15", ACCENT2 + "08"]} style={fe.header}>
        <MaterialCommunityIcons name="calculator-variant" size={18} color={ACCENT2} />
        <Text style={fe.headerTitle}>التعرفة التقديرية</Text>
        <View style={fe.routeBadge}>
          <Text style={fe.routeText}>{fromZ?.name} ← {toZ?.name}</Text>
        </View>
      </LinearGradient>
      <View style={fe.vehicleRow}>
        {vehicles.map(v => (
          <TouchableOpacity key={v.key} onPress={() => onVehicleChange(v.key)}
            style={[fe.vehicleBtn, vehicleType === v.key && { borderColor: v.color, backgroundColor: v.color + "15" }]}
            activeOpacity={0.8}>
            <MaterialCommunityIcons name={v.icon as any} size={20} color={vehicleType === v.key ? v.color : Colors.textMuted} />
            <Text style={[fe.vehicleLabel, vehicleType === v.key && { color: v.color }]}>{v.label}</Text>
            <Text style={[fe.vehicleFare, { color: vehicleType === v.key ? v.color : Colors.textSecondary }]}>
              {formatFare(v.fare)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={fe.disclaimer}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
        <Text style={fe.disclaimerText}>التعرفة تقديرية — تُحدَّد بالاتفاق مع السائق</Text>
      </View>
    </Animated.View>
  );
}

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user, token } = useAuth();
  const apiUrl = getApiUrl();

  const [enabled,    setEnabled]   = useState<boolean | null>(null);
  const [note,       setNote]      = useState("");
  const [loading,    setLoading]   = useState(true);
  const [activeTab,  setActiveTab] = useState<"book" | "drivers" | "mytrips" | "register">("book");

  const [drivers,    setDrivers]    = useState<Driver[]>([]);
  const [myTrips,    setMyTrips]    = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fareMatrix, setFareMatrix] = useState<FareMatrix>(DEFAULT_FARE_MATRIX);

  // نموذج الطلب
  const [fromZone,   setFromZone]  = useState<ZoneId | null>(null);
  const [toZone,     setToZone]    = useState<ZoneId | null>(null);
  const [fromDetail, setFromDetail] = useState("");
  const [toDetail,   setToDetail]   = useState("");
  const [vehicleType, setVehicleType] = useState<"car" | "rickshaw" | "delivery">("car");
  const [userName,   setUserName]   = useState(user?.name || "");
  const [userPhone,  setUserPhone]  = useState("");
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);

  // تسجيل السائق
  const [regName,     setRegName]     = useState(user?.name || "");
  const [regPhone,    setRegPhone]     = useState("");
  const [regVehicle,  setRegVehicle]  = useState("سيارة");
  const [regDesc,     setRegDesc]     = useState("");
  const [regPlate,    setRegPlate]    = useState("");
  const [regArea,     setRegArea]     = useState("");
  const [submittingReg, setSubmittingReg] = useState(false);

  // ── التحميل ──
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/transport/status`);
      if (res.ok) {
        const d = await res.json();
        setEnabled(d.enabled);
        if (!d.enabled) {
          const set = await fetch(`${apiUrl}/api/admin/transport/settings`).catch(() => null);
          if (set?.ok) { const sd = await set.json(); setNote(sd.transport_note || ""); }
        }
      }
    } catch { setEnabled(false); }
    finally { setLoading(false); }
  }, [apiUrl]);

  const loadFares = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/transport/fares`);
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data).length > 0) setFareMatrix(data);
      }
    } catch {}
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
      const res = await fetch(`${apiUrl}/api/transport/my-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyTrips(await res.json());
    } catch {}
  }, [apiUrl, token]);

  useEffect(() => { loadStatus(); loadFares(); }, []);
  useEffect(() => {
    if (enabled) { loadDrivers(); loadMyTrips(); }
  }, [enabled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDrivers(), loadMyTrips(), loadFares()]);
    setRefreshing(false);
  }, [loadDrivers, loadMyTrips, loadFares]);

  const submitTrip = async () => {
    if (!fromZone || !toZone) {
      Alert.alert("بيانات ناقصة", "يرجى اختيار منطقة الانطلاق والوجهة"); return;
    }
    if (!userName || !userPhone) {
      Alert.alert("بيانات ناقصة", "يرجى إدخال اسمك ورقم هاتفك"); return;
    }
    setSubmitting(true);
    try {
      const fares = fareMatrix[fromZone]?.[toZone];
      const fareEst = fares?.[vehicleType] ?? null;
      const from_location = fromDetail ? `منطقة ${fromZone} — ${fromDetail}` : `منطقة ${fromZone}: ${TRANSPORT_ZONES.find(z=>z.id===fromZone)?.name}`;
      const to_location   = toDetail   ? `منطقة ${toZone} — ${toDetail}`   : `منطقة ${toZone}: ${TRANSPORT_ZONES.find(z=>z.id===toZone)?.name}`;
      const body = {
        user_name: userName, user_phone: userPhone,
        trip_type: vehicleType === "delivery" ? "delivery" : "ride",
        vehicle_preference: vehicleType,
        from_location, to_location,
        from_zone: fromZone, to_zone: toZone,
        fare_estimate: fareEst,
        notes,
      };
      const res = await fetch(`${apiUrl}/api/transport/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "✅ تم الطلب",
          `طلبك أُرسل بنجاح!\nالتعرفة التقديرية: ${fareEst ? formatFare(fareEst) : "—"}\nسيتواصل معك السائق قريباً.`,
          [{ text: "حسناً" }],
        );
        setFromZone(null); setToZone(null);
        setFromDetail(""); setToDetail(""); setNotes("");
        loadMyTrips();
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmitting(false); }
  };

  const submitRegister = async () => {
    if (!regName || !regPhone || !regVehicle) {
      Alert.alert("بيانات ناقصة", "يرجى ملء جميع الحقول المطلوبة"); return;
    }
    setSubmittingReg(true);
    try {
      const res = await fetch(`${apiUrl}/api/transport/drivers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: regName, phone: regPhone, vehicle_type: regVehicle, vehicle_desc: regDesc, plate: regPlate, area: regArea }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تم التسجيل", "تم إرسال طلبك للانضمام كسائق. ستُبلَّغ عند مراجعة طلبك من الإدارة.", [{ text: "حسناً" }]);
        setRegName(user?.name || ""); setRegPhone(""); setRegVehicle("سيارة");
        setRegDesc(""); setRegPlate(""); setRegArea("");
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّر التسجيل");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setSubmittingReg(false); }
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={ACCENT} size="large" />
    </View>
  );

  if (!enabled) return <ComingSoonScreen note={note} />;

  const TABS = [
    { key: "book",     label: "اطلب الآن",  icon: "car-outline"       as const },
    { key: "drivers",  label: "السائقون",   icon: "people-outline"    as const },
    { key: "mytrips",  label: "طلباتي",     icon: "list-outline"      as const },
    { key: "register", label: "كن سائقاً",  icon: "car-sport-outline" as const },
  ];

  const onlineCnt   = drivers.filter(d => d.is_online).length;
  const approvedCnt = drivers.length;

  return (
    <View style={s.container}>
      {/* ── رأس الصفحة ── */}
      <LinearGradient colors={["#081A0E", "#0D2B17"]} style={[s.header, { paddingTop: topPad + 8 }]}>
        <View style={s.headerRow}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="car-side" size={22} color={ACCENT} />
          </View>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={s.headerTitle}>ترحال والتوصيل</Text>
            <Text style={s.headerSub}>مشاويرك علينا · ٥ مناطق تغطية</Text>
          </View>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>مفعّل</Text>
          </View>
        </View>

        {/* إحصائيات سريعة */}
        <View style={s.quickStats}>
          {[
            { num: onlineCnt,   label: "سائق الآن",   color: GREEN  },
            { num: approvedCnt, label: "سائق معتمد",  color: BLUE   },
            { num: myTrips.length, label: "طلباتي",   color: ACCENT },
          ].map((st, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={s.quickStatDiv} />}
              <View style={s.quickStat}>
                <Text style={[s.quickStatNum, { color: st.color }]}>{st.num}</Text>
                <Text style={s.quickStatLabel}>{st.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

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

      {/* ── المحتوى ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ──── طلب رحلة / توصيل ──── */}
        {activeTab === "book" && (
          <Animated.View entering={FadeInDown.springify()}>

            {/* اختيار المنطقة */}
            <View style={s.sectionHeader}>
              <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.secBar} />
              <Text style={s.secTitle}>حدد المسار</Text>
            </View>

            <View style={s.zoneSelectCard}>
              <View style={s.zoneSelectRow}>
                <View style={[s.zoneSelectDot, { backgroundColor: GREEN }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.zoneSelectLabel}>منطقة الانطلاق</Text>
                  <ZonePicker label="اختر منطقة البداية" value={fromZone} onChange={setFromZone} />
                  <TextInput
                    style={s.zoneDetailInput}
                    value={fromDetail}
                    onChangeText={setFromDetail}
                    placeholder="وصف تفصيلي للموقع (اختياري)"
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                  />
                </View>
              </View>

              <View style={s.zoneDivider}>
                <View style={s.zoneDivLine} />
                <MaterialCommunityIcons name="arrow-down" size={16} color={ACCENT} />
                <View style={s.zoneDivLine} />
              </View>

              <View style={s.zoneSelectRow}>
                <View style={[s.zoneSelectDot, { backgroundColor: ACCENT }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.zoneSelectLabel}>منطقة الوجهة</Text>
                  <ZonePicker label="اختر منطقة الوصول" value={toZone} onChange={setToZone} />
                  <TextInput
                    style={s.zoneDetailInput}
                    value={toDetail}
                    onChangeText={setToDetail}
                    placeholder="وصف تفصيلي للموقع (اختياري)"
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                  />
                </View>
              </View>
            </View>

            {/* بطاقة التعرفة */}
            <FareEstimateCard
              fromZone={fromZone}
              toZone={toZone}
              fareMatrix={fareMatrix}
              vehicleType={vehicleType}
              onVehicleChange={setVehicleType}
            />

            {/* بيانات الطلب */}
            <View style={s.sectionHeader}>
              <LinearGradient colors={[BLUE, GREEN]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.secBar} />
              <Text style={s.secTitle}>بيانات التواصل</Text>
            </View>
            <View style={s.formCard}>
              <Text style={s.fieldLabel}>اسمك الكامل *</Text>
              <TextInput style={s.input} value={userName} onChangeText={setUserName}
                placeholder="اسمك الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />

              <Text style={s.fieldLabel}>رقم هاتفك *</Text>
              <TextInput style={s.input} value={userPhone} onChangeText={setUserPhone}
                placeholder="+249..." placeholderTextColor={Colors.textMuted}
                textAlign="right" keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>ملاحظات إضافية (اختياري)</Text>
              <TextInput style={[s.input, { minHeight: 72, textAlignVertical: "top" }]}
                value={notes} onChangeText={setNotes}
                placeholder="أي تفاصيل إضافية تساعد السائق..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

              <TouchableOpacity onPress={submitTrip} disabled={submitting}
                style={{ marginTop: 4, borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.submitBtn}>
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name={vehicleType === "delivery" ? "package-variant-closed" : "car-arrow-right"} size={18} color="#fff" />
                        <Text style={s.submitBtnText}>
                          {vehicleType === "delivery" ? "إرسال طلب التوصيل" :
                           vehicleType === "rickshaw"  ? "طلب مشوار ركشة" : "طلب مشوار سيارة"}
                        </Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* خطوات كيف تعمل */}
            <View style={s.howCard}>
              <Text style={s.howCardTitle}>كيف تعمل الخدمة؟</Text>
              {[
                { step: "١", text: "اختر منطقة الانطلاق ومنطقة الوصول" },
                { step: "٢", text: "اطّلع على التعرفة التقديرية واختر نوع المركبة" },
                { step: "٣", text: "أرسل طلبك وستجد سائقاً متاحاً يتواصل معك" },
                { step: "٤", text: "بعد الرحلة قيّم السائق لمساعدة بقية المستخدمين" },
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

        {/* ──── السائقون ──── */}
        {activeTab === "drivers" && (
          <Animated.View entering={FadeInDown.springify()}>
            {drivers.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="car-off" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا يوجد سائقون معتمدون حالياً</Text>
              </View>
            ) : (
              <>
                {/* ملخص سريع */}
                <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "الكل",       val: drivers.length,                          color: Colors.textSecondary },
                    { label: "متاح الآن", val: drivers.filter(d => d.is_online).length, color: GREEN  },
                    { label: "سيارة",      val: drivers.filter(d => d.vehicle_type === "سيارة").length, color: BLUE   },
                    { label: "ركشة",       val: drivers.filter(d => d.vehicle_type === "ركشة").length,  color: ACCENT },
                  ].map((f, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: f.color + "15", borderRadius: 10, padding: 8, alignItems: "center", borderWidth: 1, borderColor: f.color + "30" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: f.color }}>{f.val}</Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 }}>{f.label}</Text>
                    </View>
                  ))}
                </View>
                {drivers.map(d => <DriverCard key={d.id} driver={d} />)}
              </>
            )}
          </Animated.View>
        )}

        {/* ──── طلباتي ──── */}
        {activeTab === "mytrips" && (
          <Animated.View entering={FadeInDown.springify()}>
            {!token ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="lock-outline" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>سجّل دخولك لعرض طلباتك</Text>
              </View>
            ) : myTrips.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="car-outline" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا توجد طلبات سابقة</Text>
              </View>
            ) : myTrips.map(trip => <TripCard key={trip.id} trip={trip} fareMatrix={fareMatrix} />)}
          </Animated.View>
        )}

        {/* ──── تسجيل سائق ──── */}
        {activeTab === "register" && (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={s.formCard}>
              <View style={s.formCardHeader}>
                <MaterialCommunityIcons name="steering" size={22} color={ACCENT} />
                <Text style={s.formCardTitle}>التسجيل كسائق</Text>
              </View>
              <Text style={s.formCardSub}>
                انضم إلى أسطول ترحال والتوصيل وابدأ رحلتك المهنية في الحصاحيصا.
                سيراجع الفريق طلبك خلال ٢٤–٤٨ ساعة.
              </Text>

              {[
                { label: "الاسم الكامل *",        value: regName,    setter: setRegName,    placeholder: "اسمك الكامل", kb: "default" as const },
                { label: "رقم الهاتف *",          value: regPhone,   setter: setRegPhone,   placeholder: "+249...",      kb: "phone-pad" as const },
                { label: "رقم اللوحة",             value: regPlate,   setter: setRegPlate,   placeholder: "مثال: خطوط / أرقام", kb: "default" as const },
                { label: "المنطقة الرئيسية للعمل", value: regArea,    setter: setRegArea,    placeholder: "مثال: المنصورة، حي الزهور...", kb: "default" as const },
              ].map(f => (
                <View key={f.label}>
                  <Text style={s.fieldLabel}>{f.label}</Text>
                  <TextInput style={s.input} value={f.value} onChangeText={f.setter}
                    placeholder={f.placeholder} placeholderTextColor={Colors.textMuted}
                    textAlign="right" keyboardType={f.kb} />
                </View>
              ))}

              <Text style={s.fieldLabel}>نوع المركبة *</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
                {["سيارة", "ركشة"].map(v => (
                  <TouchableOpacity key={v} onPress={() => setRegVehicle(v)}
                    style={[s.typeBtn, regVehicle === v && { borderColor: ACCENT, backgroundColor: ACCENT + "15" }]}>
                    <MaterialCommunityIcons name={v === "سيارة" ? "car-side" : "rickshaw"} size={20}
                      color={regVehicle === v ? ACCENT : Colors.textSecondary} />
                    <Text style={[s.typeBtnLabel, regVehicle === v && { color: ACCENT }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>وصف المركبة (اختياري)</Text>
              <TextInput style={[s.input, { minHeight: 60, textAlignVertical: "top" }]}
                value={regDesc} onChangeText={setRegDesc}
                placeholder="اللون والموديل وأي مميزات..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

              <TouchableOpacity onPress={submitRegister} disabled={submittingReg}
                style={{ marginTop: 8, borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.submitBtn}>
                  {submittingReg
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name="check-decagram" size={18} color="#fff" />
                        <Text style={s.submitBtnText}>تقديم طلب الانضمام</Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

      </ScrollView>
    </View>
  );
}

// ─── بطاقة سائق ───────────────────────────────────────────────────────────────
function DriverCard({ driver }: { driver: Driver }) {
  const stars = Math.round(driver.rating);
  const vcColor = driver.vehicle_type === "ركشة" ? ACCENT : BLUE;
  return (
    <Animated.View entering={FadeInDown.springify()} style={dc.card}>
      <View style={dc.row}>
        <View style={[dc.avatar, { backgroundColor: vcColor + "20" }]}>
          <MaterialCommunityIcons name={driver.vehicle_type === "ركشة" ? "rickshaw" : "steering"} size={24} color={vcColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={dc.name}>{driver.name}</Text>
          <Text style={dc.sub}>{driver.vehicle_type} · {driver.area || "—"}</Text>
          {driver.vehicle_desc ? <Text style={dc.desc}>{driver.vehicle_desc}</Text> : null}
        </View>
        <View style={[dc.statusBadge, { backgroundColor: driver.is_online ? GREEN + "20" : Colors.divider }]}>
          <View style={[dc.statusDot, { backgroundColor: driver.is_online ? GREEN : Colors.textMuted }]} />
          <Text style={[dc.statusText, { color: driver.is_online ? GREEN : Colors.textMuted }]}>
            {driver.is_online ? "متاح" : "غير متاح"}
          </Text>
        </View>
      </View>
      <View style={dc.footer}>
        <View style={{ flexDirection: "row-reverse", gap: 2 }}>
          {[1,2,3,4,5].map(i => (
            <Ionicons key={i} name={i <= stars ? "star" : "star-outline"} size={13} color={ACCENT2} />
          ))}
          <Text style={dc.ratingText}>{driver.rating > 0 ? driver.rating.toFixed(1) : "—"}</Text>
        </View>
        <Text style={dc.trips}>{driver.total_trips} رحلة</Text>
        {driver.phone && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${driver.phone}`)} style={dc.callBtn}>
            <Ionicons name="call-outline" size={14} color={GREEN} />
            <Text style={dc.callText}>اتصال</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ─── بطاقة رحلة ───────────────────────────────────────────────────────────────
function TripCard({ trip, fareMatrix }: { trip: Trip; fareMatrix: FareMatrix }) {
  const STATUS_COLORS: Record<string, string> = {
    pending: ACCENT, accepted: BLUE, completed: GREEN, cancelled: "#E05567",
  };
  const STATUS_LABELS: Record<string, string> = {
    pending: "انتظار", accepted: "جارٍ التنفيذ", completed: "مكتمل", cancelled: "ملغي",
  };
  const sc = STATUS_COLORS[trip.status] ?? Colors.textMuted;
  const vcIcon = trip.vehicle_preference === "rickshaw" ? "rickshaw" :
                 trip.vehicle_preference === "delivery" ? "package-variant" : "car-side";

  const fromZ = TRANSPORT_ZONES.find(z => z.id === trip.from_zone);
  const toZ   = TRANSPORT_ZONES.find(z => z.id === trip.to_zone);

  return (
    <Animated.View entering={FadeInDown.springify()} style={tc.card}>
      <View style={tc.topRow}>
        <View style={[tc.typeBadge, { backgroundColor: ACCENT + "15" }]}>
          <MaterialCommunityIcons name={vcIcon as any} size={14} color={ACCENT} />
          <Text style={tc.typeText}>
            {trip.vehicle_preference === "rickshaw" ? "ركشة" :
             trip.vehicle_preference === "delivery" ? "توصيل" : "سيارة"}
          </Text>
        </View>
        <View style={[tc.statusBadge, { backgroundColor: sc + "20", borderColor: sc + "50" }]}>
          <Text style={[tc.statusText, { color: sc }]}>{STATUS_LABELS[trip.status] ?? trip.status}</Text>
        </View>
      </View>

      {(fromZ || toZ) ? (
        <View style={tc.routeRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <View style={[tc.zoneDot, { backgroundColor: GREEN }]} />
              <Text style={tc.routeText}>{fromZ ? `م${fromZ.id} ${fromZ.name}` : trip.from_location}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <View style={[tc.zoneDot, { backgroundColor: ACCENT }]} />
              <Text style={tc.routeText}>{toZ ? `م${toZ.id} ${toZ.name}` : trip.to_location}</Text>
            </View>
          </View>
          {trip.fare_estimate ? (
            <View style={tc.fareBadge}>
              <Text style={tc.fareLabel}>تقديري</Text>
              <Text style={tc.fareValue}>{formatFare(trip.fare_estimate)}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={tc.routeFallback}>📍 {trip.from_location} ← {trip.to_location}</Text>
      )}

      <View style={tc.footerRow}>
        <Text style={tc.dateText}>{new Date(trip.created_at).toLocaleDateString("ar-SD")}</Text>
        {trip.driver_name ? (
          <Text style={tc.driverText}>السائق: {trip.driver_name}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// الأنماط
// ─────────────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.bg },
  hero:          { paddingHorizontal: 20, paddingBottom: 24, alignItems: "center" },
  body:          { padding: 16, paddingBottom: 40 },
  dot1:          { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: ACCENT + "08", top: 30, left: -20 },
  dot2:          { position: "absolute", width: 80, height: 80, borderRadius: 40, backgroundColor: ACCENT2 + "10", top: 80, right: 10 },
  dot3:          { position: "absolute", width: 60, height: 60, borderRadius: 30, backgroundColor: GREEN + "08", bottom: 20, left: 60 },
  iconCluster:   { alignItems: "center", marginBottom: 14 },
  pulseWrap:     { alignItems: "center", justifyContent: "center", marginBottom: 12 },
  iconCircle:    { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  smallIconRow:  { flexDirection: "row-reverse", gap: 10 },
  smallIcon:     { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  soonBadgeWrap: { marginBottom: 8 },
  soonBadge:     { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: ACCENT2 + "15", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: ACCENT2 + "30" },
  soonBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: ACCENT2 },
  heroTitle:     { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff", textAlign: "center", marginBottom: 8, lineHeight: 36 },
  heroSub:       { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#ffffff90", textAlign: "center", lineHeight: 22 },
  statsRow:      { flexDirection: "row-reverse", gap: 20, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#ffffff15" },
  statItem:      { alignItems: "center" },
  statNum:       { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statLabel:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#ffffff70", marginTop: 2 },
  noteCard:      { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: ACCENT2 + "12", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: ACCENT2 + "30" },
  noteText:      { fontFamily: "Cairo_400Regular", fontSize: 13, color: ACCENT2, flex: 1, textAlign: "right", lineHeight: 20 },
  secRow:        { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  secBar:        { width: 3, height: 18, borderRadius: 2 },
  secTitle:      { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  zonePreviewCard:  { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 10, padding: 10, borderWidth: 1 },
  zonePreviewBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  zonePreviewNum:   { fontFamily: "Cairo_700Bold", fontSize: 13 },
  zonePreviewName:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  zonePreviewDesc:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right" },
  ctaCard:       { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  ctaGrad:       { padding: 24, alignItems: "center" },
  ctaTitle:      { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, marginBottom: 6 },
  ctaSub:        { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
});

const zp = StyleSheet.create({
  btn:          { flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, gap: 8 },
  badge:        { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badgeNum:     { fontFamily: "Cairo_700Bold", fontSize: 12 },
  selectedText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  placeholder:  { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right" },
  backdrop:     { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet:        { backgroundColor: Colors.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 16 },
  sheetTitle:   { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center", marginBottom: 14 },
  zoneRow:      { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  zoneName:     { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  zoneDesc:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  zoneNumBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  zoneNum:      { fontFamily: "Cairo_700Bold", fontSize: 11 },
});

const fe = StyleSheet.create({
  placeholder:     { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 16, marginVertical: 12, borderWidth: 1, borderColor: Colors.divider, borderStyle: "dashed" },
  placeholderText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: "right", lineHeight: 20 },
  card:            { backgroundColor: Colors.cardBg, borderRadius: 14, marginVertical: 12, overflow: "hidden", borderWidth: 1, borderColor: ACCENT + "30" },
  header:          { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, flexWrap: "wrap" },
  headerTitle:     { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT2 },
  routeBadge:      { flex: 1, alignItems: "flex-start" },
  routeText:       { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  vehicleRow:      { flexDirection: "row-reverse", padding: 10, gap: 8 },
  vehicleBtn:      { flex: 1, alignItems: "center", borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: Colors.divider, gap: 4 },
  vehicleLabel:    { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  vehicleFare:     { fontFamily: "Cairo_700Bold", fontSize: 12 },
  disclaimer:      { flexDirection: "row-reverse", alignItems: "center", gap: 5, padding: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  disclaimerText:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
});

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg },
  header:         { paddingHorizontal: 16, paddingBottom: 0 },
  headerRow:      { flexDirection: "row-reverse", alignItems: "center", marginBottom: 12, gap: 0 },
  headerIcon:     { width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENT + "20", alignItems: "center", justifyContent: "center", marginLeft: 10 },
  headerTitle:    { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  headerSub:      { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#ffffff70" },
  liveBadge:      { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GREEN + "20", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: GREEN + "40" },
  liveDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  liveText:       { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: GREEN },
  quickStats:     { flexDirection: "row-reverse", justifyContent: "space-around", marginBottom: 12, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#ffffff12" },
  quickStat:      { alignItems: "center" },
  quickStatNum:   { fontFamily: "Cairo_700Bold", fontSize: 20 },
  quickStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#ffffff70", marginTop: 2 },
  quickStatDiv:   { width: 1, backgroundColor: "#ffffff15" },
  tabsScroll:     { paddingHorizontal: 4, paddingBottom: 10, gap: 6, flexDirection: "row-reverse" },
  tabBtn:         { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#ffffff10", borderWidth: 1, borderColor: "#ffffff15" },
  tabBtnActive:   { backgroundColor: ACCENT, borderColor: ACCENT },
  tabLabel:       { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  tabLabelActive: { color: "#fff" },

  sectionHeader:  { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 6 },
  secBar:         { width: 3, height: 18, borderRadius: 2 },
  secTitle:       { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },

  zoneSelectCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginBottom: 4, borderWidth: 1, borderColor: Colors.divider, gap: 4 },
  zoneSelectRow:  { flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" },
  zoneSelectDot:  { width: 10, height: 10, borderRadius: 5, marginTop: 14 },
  zoneSelectLabel:{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  zoneDetailInput:{ backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 10, paddingVertical: 8, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textPrimary, marginTop: 6 },
  zoneDivider:    { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginVertical: 6, paddingRight: 14 },
  zoneDivLine:    { flex: 1, height: 1, backgroundColor: Colors.divider },

  formCard:       { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.divider },
  formCardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 4 },
  formCardTitle:  { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  formCardSub:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20, marginBottom: 14 },
  fieldLabel:     { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 5, marginTop: 10 },
  input:          { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary },
  submitBtn:      { paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  submitBtnText:  { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  typeBtn:        { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: Colors.divider, borderRadius: 10, paddingVertical: 10 },
  typeBtnLabel:   { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  howCard:        { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.divider },
  howCardTitle:   { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginBottom: 14 },
  howRow:         { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginBottom: 10, position: "relative" },
  howBubble:      { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 2 },
  howStep:        { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  howLine:        { position: "absolute", width: 2, height: 20, backgroundColor: ACCENT + "40", right: 13, top: 30 },
  howText:        { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },

  emptyCard:      { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText:      { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
});

const dc = StyleSheet.create({
  card:        { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider },
  row:         { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar:      { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name:        { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  sub:         { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  desc:        { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  statusBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  footer:      { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  ratingText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary, marginRight: 4 },
  trips:       { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  callBtn:     { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: GREEN + "15", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: GREEN + "40" },
  callText:    { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: GREEN },
});

const tc = StyleSheet.create({
  card:       { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider },
  topRow:     { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 10 },
  typeBadge:  { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeText:   { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: ACCENT },
  statusBadge:{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  routeRow:   { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  zoneDot:    { width: 8, height: 8, borderRadius: 4 },
  routeText:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  routeFallback: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 8 },
  fareBadge:  { alignItems: "center", backgroundColor: ACCENT + "15", borderRadius: 10, padding: 8 },
  fareLabel:  { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  fareValue:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT },
  footerRow:  { flexDirection: "row-reverse", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  dateText:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  driverText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
});
