import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert, TextInput,
  ActivityIndicator, RefreshControl, Modal, Pressable,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, Easing, ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
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

// ─── بيانات الاختبار التدريبي للسائقين ───────────────────────────────────────
type QuizQuestion = {
  q: string;
  options: string[];
  correct: number;
  hint: string;
};

const DRIVER_QUIZ: QuizQuestion[] = [
  {
    q: "كم عدد مناطق التغطية في خدمة مشوارك علينا؟",
    options: ["٣ مناطق", "٥ مناطق", "٧ مناطق", "١٠ مناطق"],
    correct: 1,
    hint: "الخدمة تغطي الحصاحيصا بخمس مناطق (م١ – م٥) تمتد من وسط المدينة حتى الأطراف.",
  },
  {
    q: "ماذا تعني حالة الرحلة «انتظار»؟",
    options: [
      "الرحلة مكتملة وانتهت",
      "الرحلة ملغاة من المستخدم",
      "الرحلة في انتظار تعيين سائق لها",
      "السائق وصل للعميل",
    ],
    correct: 2,
    hint: "حالة «انتظار» تعني أن المستخدم أرسل الطلب ولم يُعيَّن له سائق بعد.",
  },
  {
    q: "ما الترتيب الصحيح لمراحل الرحلة؟",
    options: [
      "مكتملة ← جارية ← انتظار",
      "انتظار ← مكتملة ← جارية",
      "جارية ← انتظار ← مكتملة",
      "انتظار ← جارية ← مكتملة",
    ],
    correct: 3,
    hint: "كل رحلة تبدأ بـ«انتظار» ثم تصبح «جارية» بعد قبول السائق وتنتهي بـ«مكتملة».",
  },
  {
    q: "ما أهم خطوة يجب على السائق فعلها قبل بدء أي رحلة؟",
    options: [
      "البدء في الرحلة مباشرةً دون تأخير",
      "الاتفاق الصريح مع العميل على الأجرة النهائية",
      "الانتظار حتى تصدر الإدارة أمراً بالتشغيل",
      "طلب دفعة مقدمة لا تُرد",
    ],
    correct: 1,
    hint: "تحدد الشروط القانونية أنه يجب الاتفاق على الأجرة قبل بدء أي رحلة أو استلام أي شحنة.",
  },
  {
    q: "ماذا يحدث عند رفض المستخدم دفع الأجرة المتفق عليها؟",
    options: [
      "لا يحدث شيء، الأمر طبيعي",
      "يحصل المستخدم على خصم تلقائي",
      "يُعلَّق حسابه فوراً وتُسجَّل مخالفة رسمية",
      "يُحوَّل الأمر لاحقاً للمحاكم فقط",
    ],
    correct: 2,
    hint: "وفق شروط المنصة، رفض الدفع يؤدي لتعليق الحساب فوراً وتسجيل مخالفة مؤثرة على التقييم.",
  },
  {
    q: "كيف يتم تقييم السائق بعد كل رحلة؟",
    options: [
      "يقيّم السائقُ نفسَه بنفسه",
      "يقيّمه المشرف الإداري فقط",
      "لا يوجد تقييم في التطبيق",
      "يقيّمه المستخدم بعد اكتمال الرحلة",
    ],
    correct: 3,
    hint: "يظهر للمستخدم نجوم التقييم (١–٥) مع تعليق اختياري بعد انتهاء كل رحلة مكتملة.",
  },
  {
    q: "ما أنواع المركبات المقبولة في خدمة مشاويرك علينا؟",
    options: [
      "سيارة فقط",
      "ركشة فقط",
      "سيارة وركشة فقط",
      "سيارة وركشة ودراجة نارية",
    ],
    correct: 3,
    hint: "تدعم الخدمة ثلاثة أنواع: سيارة 🚗 وركشة 🛺 ودراجة نارية 🏍️ — إضافةً لخيار توصيل الشحنات.",
  },
  {
    q: "عند استلام طلب توصيل شحنة، ما الذي يجب على السائق مراجعته أولاً؟",
    options: [
      "إحضار الشحنة فوراً دون أي مراجعة",
      "قراءة وصف الشحنة والتفاق على الأجرة مع العميل",
      "رفض أي طلب توصيل دون استثناء",
      "انتظار الإدارة لتأكيد كل شحنة",
    ],
    correct: 1,
    hint: "يُرفق المستخدم وصفاً للشحنة في طلبه — على السائق قراءته والاتفاق على السعر قبل الاستلام.",
  },
  {
    q: "ماذا يعني المؤشر الأخضر «متاح» بجانب اسم السائق في قائمة السائقين؟",
    options: [
      "السائق في إجازة رسمية",
      "السائق منتهى عقده مع المنصة",
      "السائق يقبل الطلبات ومتاح الآن",
      "السائق يقود رحلة حالياً",
    ],
    correct: 2,
    hint: "المؤشر الأخضر يعني أن السائق نشط ومستعد لاستقبال الطلبات في الوقت الحالي.",
  },
  {
    q: "ما الذي يُميّز الحساب المعلَّق عن المحذوف في نظام المنصة؟",
    options: [
      "لا فرق بينهما، كلاهما نهائي",
      "المعلَّق مؤقت ريثما تُحسم المخالفة، والمحذوف نهائي",
      "المعلَّق دائم والمحذوف مؤقت",
      "التعليق يؤثر على السائق فقط لا على العميل",
    ],
    correct: 1,
    hint: "التعليق إجراء مؤقت يُرفع بعد حسم الخلاف، بينما الحذف نهائي في حال تكرار المخالفات الجسيمة.",
  },
];

const QUIZ_PASS_SCORE = 7; // ٧ من ١٠ للنجاح

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
  status: string; driver_name: string | null; driver_phone: string | null;
  created_at: string; rating: number | null; rating_note: string | null;
  delivery_desc: string | null; notes: string | null;
};

// ─── شاشة قريباً ──────────────────────────────────────────────────────────────
function ComingSoonScreen({ note }: { note?: string }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const scale   = useSharedValue(0.8);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value   = withRepeat(withTiming(1.6, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    opacity.value = withRepeat(withTiming(0,   { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, []);

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

          <Animated.Text entering={FadeInDown.delay(200).springify()} style={cs.heroTitle}>
            مشوارك علينا{"\n"}مشاويرك علينا
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
              <Text style={cs.ctaSub}>فريقنا يعمل على إطلاق الخدمة.{"\n"}سيتم إشعارك فور التفعيل الرسمي.</Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── شاشة الصيانة ─────────────────────────────────────────────────────────────
function MaintenanceScreen({ note }: { note?: string }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const spin   = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 3000 }), -1, false);
  }, []);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  return (
    <View style={cs.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#1A1200", "#2B1E00", "#2E2000"]} style={[cs.hero, { paddingTop: topPad + 16 }]}>
          <Animated.View entering={FadeIn.delay(100).duration(600)} style={cs.iconCluster}>
            <View style={cs.pulseWrap}>
              <LinearGradient colors={["#F59E0B30", "#F59E0B10"]} style={cs.iconCircle}>
                <Animated.View style={spinStyle}>
                  <MaterialCommunityIcons name="cog" size={38} color="#F59E0B" />
                </Animated.View>
              </LinearGradient>
            </View>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(200).springify()} style={cs.soonBadgeWrap}>
            <View style={[cs.soonBadge, { backgroundColor: "#F59E0B20", borderColor: "#F59E0B40" }]}>
              <MaterialCommunityIcons name="wrench-clock" size={13} color="#F59E0B" />
              <Text style={[cs.soonBadgeText, { color: "#F59E0B" }]}>قيد الصيانة</Text>
            </View>
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(280).springify()} style={cs.heroTitle}>
            الخدمة تحت الصيانة
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(340).springify()} style={cs.heroSub}>
            نعمل على تحسين تجربتك — نعود بشكل أفضل
          </Animated.Text>
        </LinearGradient>
        <Animated.View entering={FadeInDown.delay(400).springify()} style={{ marginHorizontal: 20, marginTop: 20 }}>
          <LinearGradient colors={["#F59E0B18", "#F59E0B08"]} style={{ borderRadius: 18, padding: 20, borderWidth: 1, borderColor: "#F59E0B30" }}>
            <MaterialCommunityIcons name="information-outline" size={22} color="#F59E0B" style={{ marginBottom: 8 }} />
            <Text style={[cs.ctaTitle, { color: "#F59E0B" }]}>جارٍ العمل على التحسين</Text>
            <Text style={[cs.ctaSub, { marginTop: 6 }]}>
              {note || "نقوم بصيانة الخدمة لضمان أفضل تجربة ممكنة لك.\nشكراً لصبرك — ستعود الخدمة بشكل أفضل."}
            </Text>
          </LinearGradient>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── اختيار المنطقة ───────────────────────────────────────────────────────────
function ZonePicker({
  label, value, onChange, neighborhoodsByZone,
}: {
  label: string;
  value: ZoneId | null;
  onChange: (z: ZoneId) => void;
  neighborhoodsByZone: Record<number, string[]>;
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
                {TRANSPORT_ZONES.map(z => {
                  const nhs = neighborhoodsByZone[z.id] ?? [];
                  const preview = nhs.slice(0, 4).join(" · ");
                  const extra = nhs.length > 4 ? ` +${nhs.length - 4}` : "";
                  return (
                    <TouchableOpacity key={z.id}
                      onPress={() => { onChange(z.id); setOpen(false); }}
                      style={[zp.zoneRow, value === z.id && { backgroundColor: z.color + "15" }]}
                      activeOpacity={0.75}>
                      <View style={{ flex: 1 }}>
                        <Text style={zp.zoneName}>{z.name}</Text>
                        {preview ? (
                          <Text style={zp.zoneDesc}>{preview}{extra}</Text>
                        ) : (
                          <Text style={[zp.zoneDesc, { color: Colors.textMuted + "80" }]}>{z.description}</Text>
                        )}
                      </View>
                      <View style={[zp.zoneNumBadge, { backgroundColor: z.color + "20", borderColor: z.color + "40" }]}>
                        <Text style={[zp.zoneNum, { color: z.color }]}>منطقة {z.id}</Text>
                      </View>
                      {value === z.id && <Ionicons name="checkmark-circle" size={18} color={z.color} style={{ marginRight: 6 }} />}
                    </TouchableOpacity>
                  );
                })}
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
  vehicleType: "car" | "rickshaw" | "delivery" | "motorcycle";
  onVehicleChange: (v: "car" | "rickshaw" | "delivery" | "motorcycle") => void;
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
    { key: "car"        as const, icon: "car-side",           label: "سيارة",       color: BLUE,      fare: (fares as any).car        },
    { key: "rickshaw"   as const, icon: "rickshaw",            label: "ركشة",        color: ACCENT,    fare: (fares as any).rickshaw   },
    { key: "motorcycle" as const, icon: "motorcycle",          label: "دراجة نارية", color: GREEN,     fare: (fares as any).motorcycle },
    { key: "delivery"   as const, icon: "package-variant",    label: "توصيل طلب",   color: "#A855F7", fare: (fares as any).delivery   },
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

// ─── أنواع الخريطة المجتمعية ─────────────────────────────────────────────────
type CommunityNh = { id: number; name: string; zone_id: number; submitted_by: string; created_at: string };
type CommunityStats = { total: number; pending: number; contributors: number; recent: { name: string; zone_id: number; submitted_by: string; created_at: string }[] };

const ZONE_META_MOB: Record<number, { name: string; color: string; icon: string }> = {
  1: { name: "قلب المدينة",       color: "#F97316", icon: "city-variant" },
  2: { name: "الأحياء الوسطى",   color: "#3E9CBF", icon: "home-group" },
  3: { name: "أطراف المدينة",    color: "#A855F7", icon: "map-marker-radius" },
  4: { name: "المناطق الفرعية",  color: "#34D399", icon: "terrain" },
  5: { name: "القرى المحيطة",    color: "#FBBF24", icon: "pine-tree" },
};

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user, token } = useAuth();
  const apiUrl = getApiUrl();

  const [enabled,    setEnabled]   = useState<boolean | null>(null);
  const [transportStatus, setTransportStatus] = useState<"available" | "coming_soon" | "maintenance">("coming_soon");
  const [note,       setNote]      = useState("");
  const [neighborhoodsByZone, setNeighborhoodsByZone] = useState<Record<number, string[]>>({});
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
  const [vehicleType, setVehicleType] = useState<"car" | "rickshaw" | "delivery" | "motorcycle">("car");
  const [userName,   setUserName]   = useState(user?.name || "");
  const [userPhone,  setUserPhone]  = useState("");
  const [notes,        setNotes]        = useState("");
  const [deliveryDesc, setDeliveryDesc] = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [termsAccepted,  setTermsAccepted]  = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);

  // تسجيل السائق
  const [regName,     setRegName]     = useState(user?.name || "");
  const [regPhone,    setRegPhone]     = useState("");
  const [regVehicle,  setRegVehicle]  = useState("سيارة");
  const [regDesc,     setRegDesc]     = useState("");
  const [regPlate,    setRegPlate]    = useState("");
  const [regArea,     setRegArea]     = useState("");
  const [submittingReg, setSubmittingReg] = useState(false);

  // الاختبار التدريبي
  const [quizPhase,    setQuizPhase]    = useState<"intro" | "quiz" | "result">("intro");
  const [quizCurrentQ, setQuizCurrentQ] = useState(0);
  const [quizAnswers,  setQuizAnswers]  = useState<(number | null)[]>(Array(DRIVER_QUIZ.length).fill(null));
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizScore,    setQuizScore]    = useState(0);
  const [quizPassed,   setQuizPassed]   = useState(false);

  // ── خريطة الأحياء المجتمعية ──
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showAddForm,         setShowAddForm]         = useState(false);
  const [allNeighborhoods,    setAllNeighborhoods]    = useState<CommunityNh[]>([]);
  const [communityStats,      setCommunityStats]      = useState<CommunityStats | null>(null);
  const [statsLoading,        setStatsLoading]        = useState(false);
  const [expandedZone,        setExpandedZone]        = useState<number | null>(null);
  const [addZone,     setAddZone]     = useState<number>(1);
  const [addName,     setAddName]     = useState("");
  const [addNote,     setAddNote]     = useState("");
  const [addSending,  setAddSending]  = useState(false);
  const [addSuccess,  setAddSuccess]  = useState(false);
  const [addError,    setAddError]    = useState("");

  const loadCommunityStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/neighborhoods/community-stats`);
      if (res.ok) setCommunityStats(await res.json());
    } catch {} finally { setStatsLoading(false); }
  }, [apiUrl]);

  const submitAddition = async () => {
    if (!addName.trim()) return;
    setAddSending(true); setAddError("");
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/neighborhoods/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), zone_id: addZone, notes: addNote, submitted_by: user?.name || "عضو" }),
      });
      if (res.ok) {
        setAddSuccess(true);
        setAddName(""); setAddNote("");
        loadCommunityStats();
      } else {
        const e = await res.json().catch(() => ({}));
        setAddError((e as any).error ?? "تعذّر الإرسال");
      }
    } catch { setAddError("تعذّر الاتصال بالخادم"); }
    setAddSending(false);
  };

  // ── التحميل ──
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/status`);
      if (res.ok) {
        const d = await res.json();
        const st = d.status ?? (d.enabled ? "available" : "coming_soon");
        setTransportStatus(st);
        setEnabled(st === "available");
        setNote(d.note || "");
      }
    } catch { setEnabled(false); setTransportStatus("coming_soon"); }
    finally { setLoading(false); }
  }, [apiUrl]);

  const loadNeighborhoods = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/neighborhoods`);
      if (res.ok) {
        const list: CommunityNh[] = await res.json();
        setAllNeighborhoods(list);
        const grouped: Record<number, string[]> = {};
        list.forEach(n => {
          if (!grouped[n.zone_id]) grouped[n.zone_id] = [];
          grouped[n.zone_id].push(n.name);
        });
        setNeighborhoodsByZone(grouped);
      }
    } catch {}
  }, [apiUrl]);

  const loadFares = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/fares`);
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data).length > 0) setFareMatrix(data);
      }
    } catch {}
  }, [apiUrl]);

  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/drivers`);
      if (res.ok) setDrivers(await res.json());
    } catch {}
  }, [apiUrl]);

  const loadMyTrips = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/my-trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMyTrips(await res.json());
    } catch {}
  }, [apiUrl, token]);

  useEffect(() => { loadStatus(); loadFares(); loadNeighborhoods(); loadCommunityStats(); }, []);
  useEffect(() => {
    if (enabled) { loadDrivers(); loadMyTrips(); }
  }, [enabled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDrivers(), loadMyTrips(), loadFares()]);
    setRefreshing(false);
  }, [loadDrivers, loadMyTrips, loadFares]);

  // تحديث تلقائي لتبويب "طلباتي" كل ٣٠ ثانية
  useEffect(() => {
    if (activeTab !== "mytrips" || !token) return;
    const interval = setInterval(() => { loadMyTrips(); }, 30_000);
    return () => clearInterval(interval);
  }, [activeTab, token, loadMyTrips]);

  // تقييم رحلة مكتملة
  const rateTrip = useCallback(async (tripId: number, rating: number, note: string) => {
    try {
      await fetchWithTimeout(`${apiUrl}/api/transport/trips/${tripId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rating, rating_note: note }),
      });
      // تحديث القائمة المحلية فوراً
      setMyTrips(prev => prev.map(t => t.id === tripId ? { ...t, rating, rating_note: note } : t));
    } catch { Alert.alert("خطأ", "تعذّر حفظ التقييم"); }
  }, [apiUrl, token]);

  // إلغاء طلب معلق
  const cancelTrip = useCallback(async (tripId: number) => {
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/trips/${tripId}/cancel`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setMyTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: "cancelled" } : t));
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّر إلغاء الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
  }, [apiUrl, token]);

  const submitTrip = async () => {
    if (!fromZone || !toZone) {
      Alert.alert("بيانات ناقصة", "يرجى اختيار منطقة الانطلاق والوجهة"); return;
    }
    if (!userName || !userPhone) {
      Alert.alert("بيانات ناقصة", "يرجى إدخال اسمك ورقم هاتفك"); return;
    }
    if (!termsAccepted) {
      Alert.alert(
        "⚠️ يجب الموافقة على الشروط",
        "يرجى قراءة شروط الاستخدام والموافقة عليها قبل إرسال الطلب.",
        [{ text: "مراجعة الشروط", onPress: () => setShowLegalModal(true) }],
      );
      return;
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
        delivery_desc: vehicleType === "delivery" ? deliveryDesc : null,
      };
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/trips`, {
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
        setFromDetail(""); setToDetail("");
        setNotes(""); setDeliveryDesc("");
        setTermsAccepted(false);
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
      const res = await fetchWithTimeout(`${apiUrl}/api/transport/drivers/register`, {
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

  // ── منطق الاختبار ──
  const handleQuizAnswer = (optionIdx: number) => {
    if (quizRevealed) return;
    setQuizSelected(optionIdx);
    setQuizRevealed(true);
    if (Platform.OS !== "web") {
      const correct = optionIdx === DRIVER_QUIZ[quizCurrentQ].correct;
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
  };

  const handleQuizNext = () => {
    const newAnswers = [...quizAnswers];
    newAnswers[quizCurrentQ] = quizSelected;
    setQuizAnswers(newAnswers);
    setQuizSelected(null);
    setQuizRevealed(false);
    if (quizCurrentQ < DRIVER_QUIZ.length - 1) {
      setQuizCurrentQ(quizCurrentQ + 1);
    } else {
      const score = newAnswers.filter((a, i) => a === DRIVER_QUIZ[i].correct).length;
      setQuizScore(score);
      const passed = score >= QUIZ_PASS_SCORE;
      setQuizPassed(passed);
      setQuizPhase("result");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );
      }
    }
  };

  const handleQuizRetry = () => {
    setQuizPhase("quiz");
    setQuizCurrentQ(0);
    setQuizAnswers(Array(DRIVER_QUIZ.length).fill(null));
    setQuizSelected(null);
    setQuizRevealed(false);
    setQuizScore(0);
    setQuizPassed(false);
  };

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={ACCENT} size="large" />
    </View>
  );

  if (transportStatus === "maintenance") return <MaintenanceScreen note={note} />;
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
            <Text style={s.headerTitle}>مشوارك علينا</Text>
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
                  <ZonePicker label="اختر منطقة البداية" value={fromZone} onChange={setFromZone} neighborhoodsByZone={neighborhoodsByZone} />
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
                  <ZonePicker label="اختر منطقة الوصول" value={toZone} onChange={setToZone} neighborhoodsByZone={neighborhoodsByZone} />
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

            {/* بطاقة الخريطة المجتمعية */}
            <TouchableOpacity onPress={() => { setShowCommunityModal(true); loadCommunityStats(); }} activeOpacity={0.85}>
              <LinearGradient
                colors={[ACCENT + "18", BLUE + "12"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: 18, padding: 16, borderWidth: 1, borderColor: ACCENT + "30" }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 14 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: ACCENT + "22", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: ACCENT + "35" }}>
                    <MaterialCommunityIcons name="map-marker-multiple-outline" size={24} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" }}>خريطة الأحياء التفاعلية</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 3, lineHeight: 18 }}>
                      {allNeighborhoods.length > 0
                        ? `${allNeighborhoods.length} حياً مُسجَّلاً • أضف حيّك لخريطة المدينة`
                        : "ساهم في بناء خريطة مناطق الحصاحيصا"}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>+ أضف</Text>
                  </View>
                </View>
                {allNeighborhoods.length > 0 && (
                  <View style={{ flexDirection: "row-reverse", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {[1,2,3,4,5].map(z => {
                      const zm = ZONE_META_MOB[z];
                      const cnt = allNeighborhoods.filter(n => n.zone_id === z).length;
                      if (!cnt) return null;
                      return (
                        <View key={z} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: zm.color + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: zm.color + "30" }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 10, color: zm.color }}>{cnt}</Text>
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: zm.color }}>م{z}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* بطاقة التعرفة */}
            <FareEstimateCard
              fromZone={fromZone}
              toZone={toZone}
              fareMatrix={fareMatrix}
              vehicleType={vehicleType}
              onVehicleChange={setVehicleType}
            />

            {/* ─── بطاقة التنبيه القانوني ─── */}
            <Animated.View entering={FadeInDown.delay(80).springify()} style={lw.card}>
              <LinearGradient colors={["#7C0A0A18", "#8B000012"]} style={lw.gradient}>
                <View style={lw.headerRow}>
                  <View style={lw.iconWrap}>
                    <MaterialCommunityIcons name="shield-alert" size={22} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={lw.title}>تنبيه قانوني هام</Text>
                    <Text style={lw.subtitle}>يُرجى القراءة بعناية قبل الإرسال</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowLegalModal(true)} style={lw.readMoreBtn}>
                    <Text style={lw.readMoreText}>التفاصيل</Text>
                    <Ionicons name="chevron-back" size={12} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                <View style={lw.divider} />

                {[
                  {
                    icon: "handshake" as const,
                    title: "الاتفاق على القيمة إلزامي",
                    body: "يجب الاتفاق على قيمة الأجرة مع السائق قبل بدء الرحلة أو استلام الطلب، والتعرفة المعروضة تقديرية فقط.",
                  },
                  {
                    icon: "alert-circle" as const,
                    title: "عدم الدفع يُعرّض حسابك للإيقاف",
                    body: "رفض أداء الأجرة المتفق عليها أو التهرب منها يُعرّض حساب المستخدم للتعليق الفوري من المنصة.",
                  },
                  {
                    icon: "gavel" as const,
                    title: "المساءلة القانونية",
                    body: "في حال الإخلال بالاتفاق مع السائق، تحتفظ المنصة بحق توثيق الحادثة وإحالتها إلى الجهات القانونية المختصة.",
                  },
                ].map((item, i) => (
                  <View key={i} style={lw.ruleRow}>
                    <View style={lw.ruleIconWrap}>
                      <MaterialCommunityIcons name={item.icon} size={16} color="#DC2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={lw.ruleTitle}>{item.title}</Text>
                      <Text style={lw.ruleBody}>{item.body}</Text>
                    </View>
                  </View>
                ))}

                <View style={lw.divider} />

                {/* مربع الموافقة */}
                <TouchableOpacity
                  onPress={() => setTermsAccepted(p => !p)}
                  style={lw.checkRow}
                  activeOpacity={0.75}
                >
                  <View style={[lw.checkbox, termsAccepted && lw.checkboxChecked]}>
                    {termsAccepted && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={lw.checkText}>
                    أقرّ بأنني قرأت وفهمت الشروط أعلاه، وأوافق على الالتزام بها والاتفاق على الأجرة مع السائق قبل بدء الرحلة.
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>

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

              {vehicleType === "delivery" && (
                <>
                  <Text style={s.fieldLabel}>وصف الشحنة *</Text>
                  <TextInput
                    style={[s.input, { minHeight: 56, textAlignVertical: "top" }]}
                    value={deliveryDesc} onChangeText={setDeliveryDesc}
                    placeholder="نوع البضاعة، وزنها التقريبي، أي تعليمات خاصة للتعامل معها..."
                    placeholderTextColor={Colors.textMuted} textAlign="right" multiline
                  />
                </>
              )}

              <Text style={s.fieldLabel}>ملاحظات إضافية (اختياري)</Text>
              <TextInput style={[s.input, { minHeight: 72, textAlignVertical: "top" }]}
                value={notes} onChangeText={setNotes}
                placeholder="أي تفاصيل إضافية تساعد السائق..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

              <TouchableOpacity onPress={submitTrip} disabled={submitting || !termsAccepted}
                style={{ marginTop: 8, borderRadius: 12, overflow: "hidden", opacity: termsAccepted ? 1 : 0.45 }}
                activeOpacity={0.85}>
                <LinearGradient
                  colors={termsAccepted ? [ACCENT, ACCENT2] : ["#666", "#888"]}
                  start={{ x:0,y:0 }} end={{ x:1,y:0 }}
                  style={s.submitBtn}>
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons
                          name={vehicleType === "delivery" ? "package-variant-closed" : "car-arrow-right"}
                          size={18} color="#fff" />
                        <Text style={s.submitBtnText}>
                          {vehicleType === "delivery"   ? "إرسال طلب التوصيل" :
                           vehicleType === "rickshaw"   ? "طلب مشوار ركشة"    :
                           vehicleType === "motorcycle" ? "طلب مشوار دراجة"   : "طلب مشوار سيارة"}
                        </Text>
                      </>}
                </LinearGradient>
              </TouchableOpacity>

              {!termsAccepted && (
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: "#DC2626", textAlign: "center", marginTop: 6 }}>
                  ✋ يجب الموافقة على الشروط القانونية أعلاه أولاً
                </Text>
              )}
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
                    { label: "سيارة",   val: drivers.filter(d => d.vehicle_type === "سيارة").length,   color: BLUE   },
                    { label: "ركشة",    val: drivers.filter(d => d.vehicle_type === "ركشة").length,    color: ACCENT },
                    { label: "دراجة",   val: drivers.filter(d => d.vehicle_type === "دراجة نارية").length, color: GREEN },
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
            ) : myTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                fareMatrix={fareMatrix}
                onRate={rateTrip}
                onCancel={cancelTrip}
              />
            ))}
          </Animated.View>
        )}

        {/* ──── تسجيل سائق ──── */}
        {activeTab === "register" && (
          <Animated.View entering={FadeInDown.springify()}>

            {/* ══════════════════════════════════════════════ */}
            {/* مرحلة المقدمة                                */}
            {/* ══════════════════════════════════════════════ */}
            {quizPhase === "intro" && (
              <View style={s.formCard}>
                {/* الرأس */}
                <LinearGradient colors={["#0D2B17", "#081A0E"]}
                  style={{ borderRadius: 12, padding: 20, marginBottom: 16, alignItems: "center" }}>
                  <View style={{ width: 64, height: 64, borderRadius: 32,
                    backgroundColor: ACCENT + "20", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <MaterialCommunityIcons name="school-outline" size={32} color={ACCENT} />
                  </View>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "center", marginBottom: 6 }}>
                    المساحة التدريبية للسائقين
                  </Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#ffffff80", textAlign: "center", lineHeight: 22 }}>
                    قبل الانضمام كسائق، يجب اجتياز اختبار قصير يتحقق من فهمك لمراحل عمل التطبيق وقواعده.
                  </Text>
                </LinearGradient>

                {/* ماذا ستتعلم؟ */}
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, marginBottom: 10, textAlign: "right" }}>
                  ماذا يغطي الاختبار؟
                </Text>
                {[
                  { icon: "map-marker-radius",   label: "مناطق التغطية الخمس",          color: BLUE   },
                  { icon: "transit-transfer",     label: "مراحل الرحلة: انتظار → جارية → مكتملة", color: GREEN  },
                  { icon: "handshake-outline",    label: "الاتفاق على الأجرة قبل بدء الرحلة",  color: ACCENT },
                  { icon: "star-outline",         label: "نظام التقييم والإشعارات",       color: ACCENT2 },
                  { icon: "shield-alert-outline", label: "الشروط القانونية والمسؤولية",    color: "#DC2626" },
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10,
                    marginBottom: 10, padding: 10, backgroundColor: Colors.cardBg, borderRadius: 10,
                    borderWidth: 1, borderColor: item.color + "30" }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.color + "15",
                      alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" }}>
                      {item.label}
                    </Text>
                  </View>
                ))}

                {/* شروط النجاح */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8,
                  backgroundColor: GREEN + "12", borderRadius: 10, padding: 12, marginTop: 6, marginBottom: 16,
                  borderWidth: 1, borderColor: GREEN + "30" }}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={20} color={GREEN} />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: GREEN, flex: 1, textAlign: "right" }}>
                    تحتاج إلى {QUIZ_PASS_SCORE}/{DRIVER_QUIZ.length} إجابات صحيحة للنجاح والمتابعة
                  </Text>
                </View>

                {/* زر البدء */}
                <TouchableOpacity onPress={() => setQuizPhase("quiz")}
                  style={{ borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                  <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                    <MaterialCommunityIcons name="play-circle-outline" size={20} color="#fff" />
                    <Text style={s.submitBtnText}>ابدأ الاختبار التدريبي</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ══════════════════════════════════════════════ */}
            {/* مرحلة الأسئلة                                */}
            {/* ══════════════════════════════════════════════ */}
            {quizPhase === "quiz" && (() => {
              const q = DRIVER_QUIZ[quizCurrentQ];
              const progress = (quizCurrentQ + 1) / DRIVER_QUIZ.length;
              return (
                <Animated.View key={quizCurrentQ} entering={FadeInDown.springify()} style={s.formCard}>
                  {/* شريط التقدم */}
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT }}>
                      سؤال {quizCurrentQ + 1} / {DRIVER_QUIZ.length}
                    </Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>
                      {Math.round(progress * 100)}%
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: Colors.divider, borderRadius: 3, marginBottom: 16 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: ACCENT, width: `${progress * 100}%` }} />
                  </View>

                  {/* السؤال */}
                  <View style={{ backgroundColor: Colors.cardBg, borderRadius: 12, padding: 16, marginBottom: 16,
                    borderWidth: 1, borderColor: ACCENT + "20" }}>
                    <MaterialCommunityIcons name="help-circle-outline" size={22} color={ACCENT} style={{ alignSelf: "flex-end", marginBottom: 8 }} />
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", lineHeight: 26 }}>
                      {q.q}
                    </Text>
                  </View>

                  {/* الخيارات */}
                  {q.options.map((opt, i) => {
                    const isSelected = quizSelected === i;
                    const isCorrect  = i === q.correct;
                    let bg = Colors.cardBg;
                    let border = Colors.divider;
                    let textColor = Colors.textPrimary;
                    let iconName: "check-circle" | "close-circle" | "radiobox-blank" = "radiobox-blank";
                    let iconColor = Colors.textMuted;
                    if (quizRevealed) {
                      if (isCorrect) {
                        bg = "#3EFF9C15"; border = "#3EFF9C60"; textColor = GREEN;
                        iconName = "check-circle"; iconColor = GREEN;
                      } else if (isSelected) {
                        bg = "#E0556715"; border = "#E0556760"; textColor = "#E05567";
                        iconName = "close-circle"; iconColor = "#E05567";
                      }
                    } else if (isSelected) {
                      bg = ACCENT + "15"; border = ACCENT + "60"; textColor = ACCENT;
                      iconName = "radiobox-blank"; iconColor = ACCENT;
                    }
                    return (
                      <TouchableOpacity key={i} onPress={() => handleQuizAnswer(i)}
                        activeOpacity={quizRevealed ? 1 : 0.7}
                        style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10,
                          backgroundColor: bg, borderWidth: 1, borderColor: border,
                          borderRadius: 10, padding: 13, marginBottom: 8 }}>
                        <MaterialCommunityIcons name={iconName} size={20} color={iconColor} />
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: textColor, flex: 1, textAlign: "right" }}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* تلميح بعد الكشف */}
                  {quizRevealed && (
                    <Animated.View entering={FadeIn.duration(300)}
                      style={{ backgroundColor: "#FBBF2412", borderRadius: 10, padding: 12, marginTop: 6,
                        borderWidth: 1, borderColor: "#FBBF2430", flexDirection: "row-reverse", gap: 8, alignItems: "flex-start" }}>
                      <MaterialCommunityIcons name="lightbulb-outline" size={16} color={ACCENT2} />
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: ACCENT2, flex: 1, textAlign: "right", lineHeight: 20 }}>
                        {q.hint}
                      </Text>
                    </Animated.View>
                  )}

                  {/* زر التالي */}
                  {quizRevealed && (
                    <Animated.View entering={FadeInDown.duration(250)} style={{ marginTop: 14 }}>
                      <TouchableOpacity onPress={handleQuizNext}
                        style={{ borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                        <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                          <Text style={s.submitBtnText}>
                            {quizCurrentQ < DRIVER_QUIZ.length - 1 ? "السؤال التالي" : "إنهاء الاختبار"}
                          </Text>
                          <MaterialCommunityIcons
                            name={quizCurrentQ < DRIVER_QUIZ.length - 1 ? "arrow-left" : "check-bold"}
                            size={18} color="#fff" />
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </Animated.View>
              );
            })()}

            {/* ══════════════════════════════════════════════ */}
            {/* مرحلة النتيجة                                */}
            {/* ══════════════════════════════════════════════ */}
            {quizPhase === "result" && (
              <Animated.View entering={ZoomIn.springify()}>
                {/* بطاقة النتيجة */}
                <View style={s.formCard}>
                  <LinearGradient
                    colors={quizPassed ? ["#0D2B17", "#052010"] : ["#1A0707", "#0D0404"]}
                    style={{ borderRadius: 14, padding: 24, alignItems: "center", marginBottom: 16 }}>
                    {/* الأيقونة */}
                    <View style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 12,
                      backgroundColor: (quizPassed ? GREEN : "#E05567") + "20",
                      alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons
                        name={quizPassed ? "check-decagram" : "close-octagon-outline"}
                        size={42} color={quizPassed ? GREEN : "#E05567"} />
                    </View>
                    {/* العنوان */}
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff", marginBottom: 4 }}>
                      {quizPassed ? "تهانينا! اجتزت الاختبار" : "لم تجتز الاختبار هذه المرة"}
                    </Text>
                    {/* الدرجة */}
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: "#ffffff90", marginBottom: 16 }}>
                      {quizPassed
                        ? "أثبتت فهمك الكامل لمراحل التطبيق"
                        : `تحتاج ${QUIZ_PASS_SCORE} صحيحة — حاول مجدداً بعد مراجعة الأسئلة`}
                    </Text>
                    {/* الدرجة المرئية */}
                    <View style={{ flexDirection: "row-reverse", alignItems: "baseline", gap: 4 }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 48, color: quizPassed ? GREEN : "#E05567" }}>
                        {quizScore}
                      </Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 22, color: "#ffffff60" }}>
                        / {DRIVER_QUIZ.length}
                      </Text>
                    </View>
                  </LinearGradient>

                  {/* مراجعة الإجابات */}
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginBottom: 10 }}>
                    مراجعة إجاباتك
                  </Text>
                  {DRIVER_QUIZ.map((q, i) => {
                    const userAns = quizAnswers[i];
                    const correct = userAns === q.correct;
                    return (
                      <View key={i} style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
                        padding: 10, borderRadius: 10, marginBottom: 6,
                        backgroundColor: correct ? "#3EFF9C10" : "#E0556710",
                        borderWidth: 1, borderColor: correct ? "#3EFF9C30" : "#E0556730" }}>
                        <MaterialCommunityIcons
                          name={correct ? "check-circle" : "close-circle"}
                          size={16} color={correct ? GREEN : "#E05567"}
                          style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary, textAlign: "right", marginBottom: 2 }}>
                            س{i + 1}: {q.q.length > 60 ? q.q.slice(0, 58) + "…" : q.q}
                          </Text>
                          {!correct && (
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: GREEN, textAlign: "right" }}>
                              الصواب: {q.options[q.correct]}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {/* أزرار */}
                  <View style={{ gap: 10, marginTop: 12 }}>
                    {!quizPassed && (
                      <TouchableOpacity onPress={handleQuizRetry}
                        style={{ borderRadius: 12, overflow: "hidden" }} activeOpacity={0.85}>
                        <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
                          <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
                          <Text style={s.submitBtnText}>إعادة المحاولة</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                    {quizPassed && (
                      <View style={{ backgroundColor: GREEN + "12", borderRadius: 12, padding: 12,
                        borderWidth: 1, borderColor: GREEN + "30", flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                        <MaterialCommunityIcons name="arrow-down-circle-outline" size={18} color={GREEN} />
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: GREEN, flex: 1, textAlign: "right" }}>
                          الآن يمكنك تسجيل طلب انضمامك كسائق أدناه
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* ═══ نموذج التسجيل — يظهر فقط بعد النجاح ═══ */}
                {quizPassed && (
                  <Animated.View entering={FadeInDown.delay(200).springify()}>
                    <View style={s.formCard}>
                      <View style={s.formCardHeader}>
                        <MaterialCommunityIcons name="steering" size={22} color={ACCENT} />
                        <Text style={s.formCardTitle}>التسجيل كسائق</Text>
                      </View>
                      <Text style={s.formCardSub}>
                        انضم إلى أسطول مشوارك علينا وابدأ رحلتك المهنية في الحصاحيصا.
                        سيراجع الفريق طلبك خلال ٢٤–٤٨ ساعة.
                      </Text>

                      {[
                        { label: "الاسم الكامل *",        value: regName,    setter: setRegName,    placeholder: "اسمك الكامل",                   kb: "default" as const },
                        { label: "رقم الهاتف *",          value: regPhone,   setter: setRegPhone,   placeholder: "+249...",                        kb: "phone-pad" as const },
                        { label: "رقم اللوحة",             value: regPlate,   setter: setRegPlate,   placeholder: "مثال: خطوط / أرقام",             kb: "default" as const },
                        { label: "المنطقة الرئيسية للعمل", value: regArea,    setter: setRegArea,    placeholder: "مثال: المنصورة، حي الزهور...",    kb: "default" as const },
                      ].map(f => (
                        <View key={f.label}>
                          <Text style={s.fieldLabel}>{f.label}</Text>
                          <TextInput style={s.input} value={f.value} onChangeText={f.setter}
                            placeholder={f.placeholder} placeholderTextColor={Colors.textMuted}
                            textAlign="right" keyboardType={f.kb} />
                        </View>
                      ))}

                      <Text style={s.fieldLabel}>نوع المركبة *</Text>
                      <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                        {[
                          { label: "سيارة",       icon: "car-side",   color: BLUE   },
                          { label: "ركشة",        icon: "rickshaw",   color: ACCENT },
                          { label: "دراجة نارية", icon: "motorcycle", color: GREEN  },
                        ].map(v => (
                          <TouchableOpacity key={v.label} onPress={() => setRegVehicle(v.label)}
                            style={[s.typeBtn, regVehicle === v.label && { borderColor: v.color, backgroundColor: v.color + "15" }]}>
                            <MaterialCommunityIcons name={v.icon as any} size={20}
                              color={regVehicle === v.label ? v.color : Colors.textSecondary} />
                            <Text style={[s.typeBtnLabel, regVehicle === v.label && { color: v.color }]}>{v.label}</Text>
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
                        <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.submitBtn}>
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
              </Animated.View>
            )}

          </Animated.View>
        )}

      </ScrollView>

      {/* ══ مودال الشروط القانونية التفصيلية ══ */}
      <Modal visible={showLegalModal} transparent animationType="slide" onRequestClose={() => setShowLegalModal(false)}>
        <Pressable style={lm.backdrop} onPress={() => setShowLegalModal(false)}>
          <Animated.View entering={FadeInDown.springify().damping(22)} style={lm.sheet}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={lm.handle} />

              {/* الرأس */}
              <LinearGradient colors={["#7C0A0A25", "#DC262610"]} style={lm.headerGrad}>
                <MaterialCommunityIcons name="shield-alert" size={32} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={lm.headerTitle}>شروط استخدام خدمة مشوارك علينا</Text>
                  <Text style={lm.headerSub}>يُعدّ قبولك للطلب موافقةً على هذه الشروط</Text>
                </View>
              </LinearGradient>

              <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>

                {/* المادة الأولى */}
                <View style={lm.article}>
                  <View style={lm.articleHeader}>
                    <MaterialCommunityIcons name="handshake" size={18} color="#DC2626" />
                    <Text style={lm.articleTitle}>أولاً — الاتفاق على الأجرة</Text>
                  </View>
                  <Text style={lm.articleBody}>
                    التعرفة المعروضة في التطبيق هي قيمة تقديرية مرجعية فقط. يلتزم المستخدم بالاتفاق الصريح مع السائق على القيمة النهائية للأجرة قبل بدء أي رحلة أو استلام أي طلب توصيل.
                    {"\n\n"}
                    لا يجوز البدء في الرحلة أو تسلُّم البضاعة قبل الوصول إلى اتفاق واضح ومؤكَّد بين الطرفين.
                  </Text>
                </View>

                <View style={lm.divider} />

                {/* المادة الثانية */}
                <View style={lm.article}>
                  <View style={lm.articleHeader}>
                    <MaterialCommunityIcons name="account-cancel" size={18} color="#DC2626" />
                    <Text style={lm.articleTitle}>ثانياً — التبعات الفورية للإخلال</Text>
                  </View>
                  <Text style={lm.articleBody}>
                    يُعدّ رفض سداد الأجرة المتفق عليها أو التقليل منها بعد انتهاء الرحلة إخلالاً جسيماً بشروط المنصة، ويُعرّض المستخدم لما يلي فور توثيق الحادثة:
                  </Text>
                  {[
                    "تعليق حساب المستخدم تعليقاً فورياً ومؤقتاً ريثما تُحسم المسألة.",
                    "تسجيل مخالفة رسمية في سجل الحساب تؤثر على تقييمه العام.",
                    "الحرمان من استخدام الخدمة في حال تكرار المخالفة.",
                  ].map((item, i) => (
                    <View key={i} style={lm.bulletRow}>
                      <View style={lm.bullet} />
                      <Text style={lm.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={lm.divider} />

                {/* المادة الثالثة */}
                <View style={lm.article}>
                  <View style={lm.articleHeader}>
                    <MaterialCommunityIcons name="gavel" size={18} color="#DC2626" />
                    <Text style={lm.articleTitle}>ثالثاً — المساءلة القانونية</Text>
                  </View>
                  <Text style={lm.articleBody}>
                    في حال تقديم السائق شكوى رسمية موثَّقة ضد المستخدم، تحتفظ منصة حصاحيصاوي بحق اتخاذ الإجراءات التالية:
                  </Text>
                  {[
                    "توثيق بيانات الرحلة كاملةً (الوقت، الموقع، الأطراف) وتقديمها للجهات الرسمية.",
                    "التعاون مع الجهات الأمنية والقضائية المختصة في حال المطالبة القانونية.",
                    "إحالة الملف إلى الجهة القانونية للمنصة للفصل فيه وفق القانون الساري.",
                  ].map((item, i) => (
                    <View key={i} style={lm.bulletRow}>
                      <View style={lm.bullet} />
                      <Text style={lm.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View style={lm.divider} />

                {/* المادة الرابعة */}
                <View style={lm.article}>
                  <View style={lm.articleHeader}>
                    <MaterialCommunityIcons name="shield-check" size={18} color="#3EFF9C" />
                    <Text style={[lm.articleTitle, { color: "#3EFF9C" }]}>رابعاً — حقوق المستخدم</Text>
                  </View>
                  <Text style={lm.articleBody}>
                    في حال وقوع نزاع، يحق للمستخدم التواصل مع إدارة المنصة لتقديم روايته وأدلته. تلتزم المنصة بالحياد التام والتحقيق في كلا الطرفين قبل اتخاذ أي قرار نهائي.
                    {"\n\n"}
                    للتواصل: يمكنك الإبلاغ عن أي إشكالية عبر قسم البلاغات داخل التطبيق.
                  </Text>
                </View>

              </ScrollView>

              {/* أزرار الإجراء */}
              <View style={lm.footer}>
                <TouchableOpacity
                  onPress={() => { setTermsAccepted(true); setShowLegalModal(false); }}
                  style={lm.acceptBtn}
                  activeOpacity={0.85}>
                  <LinearGradient colors={["#16A34A", "#22C55E"]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={lm.acceptGrad}>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={lm.acceptText}>قرأت وأوافق على الشروط</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowLegalModal(false)} style={lm.closeBtn}>
                  <Text style={lm.closeBtnText}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ══════════ خريطة الأحياء التفاعلية — Modal رئيسي ══════════ */}
      <Modal visible={showCommunityModal} transparent animationType="slide" onRequestClose={() => setShowCommunityModal(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000CC" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowCommunityModal(false)} />
          <View style={{ backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", flex: 0 }}>
            {/* Hero Header */}
            <LinearGradient
              colors={[ACCENT + "22", BLUE + "14", Colors.bg]}
              style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 14, paddingBottom: 20, paddingHorizontal: 20 }}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 16 }} />
              <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "right" }}>خريطة الأحياء التفاعلية</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 4, lineHeight: 20 }}>
                    أبناء الحصاحيصا يبنون خريطتهم معاً — أضف حيّك وساهم في تسهيل التنقّل للجميع
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowCommunityModal(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardBgElevated, alignItems: "center", justifyContent: "center", marginRight: 8 }}>
                  <MaterialCommunityIcons name="close" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Stats */}
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16 }}>
                {[
                  { val: statsLoading ? "…" : String(communityStats?.total ?? allNeighborhoods.length), label: "حي مُسجَّل", color: ACCENT },
                  { val: statsLoading ? "…" : String(communityStats?.contributors ?? 0), label: "مساهم", color: BLUE },
                  { val: "٥", label: "مناطق", color: "#A855F7" },
                ].map(s => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: s.color + "12", borderRadius: 14, borderWidth: 1, borderColor: s.color + "25", padding: 12, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 22, color: s.color }}>{s.val}</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}>

              {/* آخر الإضافات */}
              {communityStats?.recent && communityStats.recent.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <MaterialCommunityIcons name="clock-fast" size={16} color={ACCENT} />
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>أحدث الإضافات</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, flexDirection: "row-reverse" }}>
                    {communityStats.recent.map((r, i) => {
                      const zm = ZONE_META_MOB[r.zone_id];
                      return (
                        <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, minWidth: 150, borderWidth: 1, borderColor: zm?.color + "25" }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: zm?.color + "20", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: zm?.color }}>م{r.zone_id}</Text>
                            </View>
                            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, flex: 1, textAlign: "right" }} numberOfLines={1}>{r.name}</Text>
                          </View>
                          {r.submitted_by ? (
                            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                              <MaterialCommunityIcons name="account-circle" size={13} color={Colors.textMuted} />
                              <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{r.submitted_by}</Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* خريطة المناطق */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <MaterialCommunityIcons name="map-outline" size={16} color={ACCENT} />
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text }}>خريطة مناطق التغطية</Text>
              </View>

              {[1,2,3,4,5].map(z => {
                const zm = ZONE_META_MOB[z];
                const zNhs = allNeighborhoods.filter(n => n.zone_id === z);
                const isExpanded = expandedZone === z;
                return (
                  <View key={z} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: zm.color + "30", marginBottom: 10, overflow: "hidden" }}>
                    <TouchableOpacity onPress={() => setExpandedZone(isExpanded ? null : z)} activeOpacity={0.8}
                      style={{ flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: zm.color + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: zm.color + "30" }}>
                        <MaterialCommunityIcons name={zm.icon as any} size={20} color={zm.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" }}>{zm.name}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                          منطقة {z} • {zNhs.length > 0 ? `${zNhs.length} حي مُضاف` : "لا توجد أحياء بعد"}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                        {zNhs.length > 0 && (
                          <View style={{ backgroundColor: zm.color + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: zm.color }}>{zNhs.length}</Text>
                          </View>
                        )}
                        <MaterialCommunityIcons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: zm.color + "20" }}>
                        {zNhs.length === 0 ? (
                          <View style={{ paddingVertical: 16, alignItems: "center" }}>
                            <MaterialCommunityIcons name="map-marker-plus-outline" size={28} color={Colors.textMuted} />
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 8 }}>
                              لم يُضف أحد حيّاً هنا بعد — كن الأول!
                            </Text>
                            <TouchableOpacity onPress={() => { setAddZone(z); setAddSuccess(false); setAddError(""); setShowAddForm(true); }} activeOpacity={0.8}
                              style={{ marginTop: 12, backgroundColor: zm.color, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" }}>+ أضف أول حي في م{z}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingTop: 12 }}>
                            {zNhs.map((n, i) => (
                              <View key={i} style={{ backgroundColor: zm.color + "12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: zm.color + "25" }}>
                                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: zm.color }}>{n.name}</Text>
                                {n.submitted_by ? (
                                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
                                    ✦ {n.submitted_by}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* دعوة للمشاركة */}
              <View style={{ marginTop: 8, backgroundColor: ACCENT + "10", borderRadius: 16, borderWidth: 1, borderColor: ACCENT + "25", padding: 18, alignItems: "center" }}>
                <MaterialCommunityIcons name="account-group-outline" size={30} color={ACCENT} />
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, marginTop: 10, textAlign: "center" }}>
                  ساهم في بناء الخريطة
                </Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
                  كل إضافة تُسهِّل على جيرانك تحديد موقعهم{"\n"}وتجعل خدمة المشاوير أدق وأسرع للجميع
                </Text>
              </View>
            </ScrollView>

            {/* CTA ثابت في الأسفل */}
            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 30 }}>
              <LinearGradient colors={[Colors.bg + "00", Colors.bg]} style={{ position: "absolute", top: -20, left: 0, right: 0, height: 50 }} />
              <TouchableOpacity onPress={() => { setAddSuccess(false); setAddError(""); setAddName(""); setShowAddForm(true); }} activeOpacity={0.9}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 16, paddingVertical: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <MaterialCommunityIcons name="map-marker-plus" size={20} color="#fff" />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" }}>أضف حياً أو قرية</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════ نموذج الإضافة — Modal فرعي ══════════ */}
      <Modal visible={showAddForm} transparent animationType="slide" onRequestClose={() => setShowAddForm(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }} onPress={() => setShowAddForm(false)}>
          <View style={{ backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 36 }}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 14, marginBottom: 6 }} />

              {addSuccess ? (
                /* حالة النجاح */
                <View style={{ padding: 30, alignItems: "center" }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: GREEN + "20", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <MaterialCommunityIcons name="check-circle" size={44} color={GREEN} />
                  </View>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "center" }}>شكراً لمساهمتك!</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginTop: 10, lineHeight: 22 }}>
                    تمّ إرسال إضافتك للإدارة للمراجعة.{"\n"}
                    بعد الاعتماد ستظهر حيّاً للجميع في التطبيق.
                  </Text>
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 24, width: "100%" }}>
                    <TouchableOpacity onPress={() => { setAddSuccess(false); setAddError(""); }} activeOpacity={0.85}
                      style={{ flex: 1, backgroundColor: ACCENT + "15", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: ACCENT + "30" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: ACCENT }}>+ أضف حياً آخر</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowAddForm(false); setAddSuccess(false); }} activeOpacity={0.85}
                      style={{ flex: 1, backgroundColor: Colors.cardBgElevated, borderRadius: 12, padding: 14, alignItems: "center" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted }}>إغلاق</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* نموذج الإضافة */
                <View style={{ padding: 24 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons name="map-marker-plus" size={22} color={ACCENT} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text }}>أضف حياً أو قرية</Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>تُراجعها الإدارة وتعتمدها للجميع</Text>
                    </View>
                  </View>

                  {addError ? (
                    <View style={{ backgroundColor: "#f8717115", borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#f8717135" }}>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#f87171", textAlign: "right" }}>⚠️ {addError}</Text>
                    </View>
                  ) : null}

                  {/* اختيار المنطقة */}
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 8, marginTop: 14 }}>المنطقة *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse", paddingVertical: 2 }}>
                    {[1,2,3,4,5].map(z => {
                      const zm = ZONE_META_MOB[z];
                      const sel = addZone === z;
                      return (
                        <TouchableOpacity key={z} onPress={() => setAddZone(z)} activeOpacity={0.8}
                          style={{ alignItems: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: sel ? zm.color : Colors.divider, backgroundColor: sel ? zm.color + "15" : "transparent", minWidth: 80 }}>
                          <MaterialCommunityIcons name={zm.icon as any} size={18} color={sel ? zm.color : Colors.textMuted} />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: sel ? zm.color : Colors.textMuted, marginTop: 4 }}>{zm.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* اسم الحي */}
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 8, marginTop: 18 }}>اسم الحي أو القرية *</Text>
                  <TextInput
                    value={addName}
                    onChangeText={setAddName}
                    placeholder="مثال: حي الصداقة، ود حبوبة، الملازمين..."
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                    style={{ backgroundColor: Colors.cardBgElevated, borderRadius: 12, padding: 14, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1.5, borderColor: addName.trim() ? ACCENT + "50" : Colors.divider }}
                  />

                  {/* ملاحظات */}
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 8, marginTop: 14 }}>ملاحظات إضافية (اختياري)</Text>
                  <TextInput
                    value={addNote}
                    onChangeText={setAddNote}
                    placeholder="وصف الموقع، حدوده، معالمه..."
                    placeholderTextColor={Colors.textMuted}
                    textAlign="right"
                    style={{ backgroundColor: Colors.cardBgElevated, borderRadius: 12, padding: 14, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.divider, minHeight: 70 }}
                    multiline
                  />

                  {/* أزرار */}
                  <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 22 }}>
                    <TouchableOpacity onPress={submitAddition} disabled={!addName.trim() || addSending} activeOpacity={0.88}
                      style={{ flex: 1, borderRadius: 14, overflow: "hidden" }}>
                      <LinearGradient
                        colors={addName.trim() ? [ACCENT, ACCENT2] : [Colors.divider, Colors.divider]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ paddingVertical: 15, alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 8 }}>
                        {addSending
                          ? <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: addName.trim() ? "#fff" : Colors.textMuted }}>جارٍ الإرسال…</Text>
                          : <>
                              <MaterialCommunityIcons name="send" size={16} color={addName.trim() ? "#fff" : Colors.textMuted} />
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: addName.trim() ? "#fff" : Colors.textMuted }}>إرسال للمراجعة</Text>
                            </>
                        }
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowAddForm(false)} activeOpacity={0.8}
                      style={{ paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.cardBgElevated, justifyContent: "center" }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted }}>إلغاء</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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

// ─── بطاقة رحلة (مطوّرة) ──────────────────────────────────────────────────────
function TripCard({
  trip, fareMatrix, onRate, onCancel,
}: {
  trip: Trip;
  fareMatrix: FareMatrix;
  onRate:   (id: number, rating: number, note: string) => Promise<void>;
  onCancel: (id: number) => Promise<void>;
}) {
  const [localStatus,    setLocalStatus]    = useState(trip.status);
  const [localRating,    setLocalRating]    = useState(trip.rating);
  const [showRating,     setShowRating]     = useState(false);
  const [selectedStars,  setSelectedStars]  = useState(0);
  const [ratingNote,     setRatingNote]     = useState("");
  const [savingRating,   setSavingRating]   = useState(false);
  const [cancelling,     setCancelling]     = useState(false);

  const STATUS_COLORS: Record<string, string> = {
    pending: ACCENT, accepted: BLUE, completed: GREEN, cancelled: "#E05567",
  };
  const STATUS_LABELS: Record<string, string> = {
    pending: "انتظار", accepted: "جارٍ التنفيذ", completed: "مكتمل", cancelled: "ملغي",
  };
  const sc     = STATUS_COLORS[localStatus] ?? Colors.textMuted;
  const vcIcon = trip.vehicle_preference === "rickshaw"   ? "rickshaw"         :
                 trip.vehicle_preference === "delivery"   ? "package-variant"   :
                 trip.vehicle_preference === "motorcycle" ? "motorcycle"         : "car-side";

  const fromZ = TRANSPORT_ZONES.find(z => z.id === trip.from_zone);
  const toZ   = TRANSPORT_ZONES.find(z => z.id === trip.to_zone);

  const handleRate = async () => {
    if (!selectedStars) return;
    setSavingRating(true);
    await onRate(trip.id, selectedStars, ratingNote);
    setLocalRating(selectedStars);
    setShowRating(false);
    setSavingRating(false);
  };

  const handleCancel = () => {
    Alert.alert("إلغاء الطلب", "هل أنت متأكد من إلغاء هذا الطلب؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "نعم، إلغاء",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          await onCancel(trip.id);
          setLocalStatus("cancelled");
          setCancelling(false);
        },
      },
    ]);
  };

  return (
    <Animated.View entering={FadeInDown.springify()} style={tc.card}>
      {/* ─ رأس البطاقة ─ */}
      <View style={tc.topRow}>
        <View style={[tc.typeBadge, { backgroundColor: ACCENT + "15" }]}>
          <MaterialCommunityIcons name={vcIcon as any} size={14} color={ACCENT} />
          <Text style={tc.typeText}>
            {trip.vehicle_preference === "rickshaw"   ? "ركشة"         :
             trip.vehicle_preference === "delivery"   ? "توصيل"        :
             trip.vehicle_preference === "motorcycle" ? "دراجة نارية"  : "سيارة"}
          </Text>
        </View>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          <View style={[tc.statusBadge, { backgroundColor: sc + "20", borderColor: sc + "50" }]}>
            <Text style={[tc.statusText, { color: sc }]}>{STATUS_LABELS[localStatus] ?? localStatus}</Text>
          </View>
          {/* إلغاء الطلب */}
          {localStatus === "pending" && (
            <TouchableOpacity onPress={handleCancel} disabled={cancelling} style={tc.cancelBtn}>
              {cancelling
                ? <ActivityIndicator size="small" color="#E05567" />
                : <Ionicons name="close-circle" size={16} color="#E05567" />}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─ المسار والتعرفة ─ */}
      {(fromZ || toZ) ? (
        <View style={tc.routeRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <View style={[tc.zoneDot, { backgroundColor: GREEN }]} />
              <Text style={tc.routeText}>{fromZ ? `م${fromZ.id} — ${fromZ.name}` : trip.from_location}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <View style={[tc.zoneDot, { backgroundColor: ACCENT }]} />
              <Text style={tc.routeText}>{toZ ? `م${toZ.id} — ${toZ.name}` : trip.to_location}</Text>
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

      {/* ─ وصف الشحنة (للتوصيل) ─ */}
      {trip.delivery_desc ? (
        <View style={tc.descRow}>
          <MaterialCommunityIcons name="package-variant" size={13} color={ACCENT} />
          <Text style={tc.descText}>{trip.delivery_desc}</Text>
        </View>
      ) : null}

      {/* ─ معلومات السائق (عند قبول الطلب) ─ */}
      {localStatus === "accepted" && trip.driver_name ? (
        <View style={tc.driverRow}>
          <MaterialCommunityIcons name="steering" size={15} color={BLUE} />
          <Text style={tc.driverNameText}>{trip.driver_name}</Text>
          {trip.driver_phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${trip.driver_phone}`)}
              style={tc.callDriverBtn}>
              <Ionicons name="call" size={13} color="#fff" />
              <Text style={tc.callDriverText}>اتصال بالسائق</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ─ تذييل البطاقة ─ */}
      <View style={tc.footerRow}>
        <Text style={tc.dateText}>{new Date(trip.created_at).toLocaleDateString("ar-SD")}</Text>
        {localStatus === "completed" && !localRating ? (
          <TouchableOpacity onPress={() => setShowRating(p => !p)} style={tc.rateBtn}>
            <Ionicons name="star-outline" size={13} color={ACCENT2} />
            <Text style={tc.rateBtnText}>قيّم رحلتك</Text>
          </TouchableOpacity>
        ) : localRating ? (
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 3 }}>
            {[1,2,3,4,5].map(i => (
              <Ionicons key={i} name={i <= (localRating ?? 0) ? "star" : "star-outline"} size={13} color={ACCENT2} />
            ))}
            <Text style={tc.ratedText}>قيّمت</Text>
          </View>
        ) : trip.driver_name && localStatus !== "accepted" ? (
          <Text style={tc.driverText}>السائق: {trip.driver_name}</Text>
        ) : null}
      </View>

      {/* ─ ويدجت التقييم (منسحب) ─ */}
      {showRating && (
        <Animated.View entering={FadeInDown.springify()} style={tc.ratingPanel}>
          <Text style={tc.ratingTitle}>كيف كانت تجربتك؟</Text>
          <View style={tc.starsRow}>
            {[1,2,3,4,5].map(i => (
              <TouchableOpacity key={i} onPress={() => setSelectedStars(i)}>
                <Ionicons
                  name={i <= selectedStars ? "star" : "star-outline"}
                  size={30} color={i <= selectedStars ? ACCENT2 : Colors.divider}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={tc.ratingInput}
            value={ratingNote}
            onChangeText={setRatingNote}
            placeholder="تعليق اختياري..."
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            multiline
          />
          <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={handleRate}
              disabled={!selectedStars || savingRating}
              style={[tc.ratingSubmit, { opacity: selectedStars ? 1 : 0.45 }]}>
              {savingRating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={tc.ratingSubmitText}>إرسال التقييم</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowRating(false)} style={tc.ratingCancel}>
              <Text style={tc.ratingCancelText}>تراجع</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
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
  card:            { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider },
  topRow:          { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 10 },
  typeBadge:       { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeText:        { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: ACCENT },
  statusBadge:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusText:      { fontFamily: "Cairo_700Bold", fontSize: 11 },
  cancelBtn:       { width: 28, height: 28, borderRadius: 14, backgroundColor: "#E0556715", alignItems: "center", justifyContent: "center" },
  routeRow:        { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  zoneDot:         { width: 8, height: 8, borderRadius: 4 },
  routeText:       { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  routeFallback:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 8 },
  fareBadge:       { alignItems: "center", backgroundColor: ACCENT + "15", borderRadius: 10, padding: 8 },
  fareLabel:       { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  fareValue:       { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT },
  descRow:         { flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, backgroundColor: ACCENT + "0D", borderRadius: 8, padding: 8, marginBottom: 8 },
  descText:        { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 18 },
  driverRow:       { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: BLUE + "12", borderRadius: 10, padding: 8, marginBottom: 8 },
  driverNameText:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: BLUE, flex: 1, textAlign: "right" },
  callDriverBtn:   { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  callDriverText:  { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },
  footerRow:       { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  dateText:        { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  driverText:      { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  rateBtn:         { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: ACCENT2 + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  rateBtnText:     { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: ACCENT2 },
  ratedText:       { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, marginLeft: 4 },
  ratingPanel:     { marginTop: 10, padding: 12, backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  ratingTitle:     { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "center", marginBottom: 10 },
  starsRow:        { flexDirection: "row-reverse", justifyContent: "center", gap: 8, marginBottom: 10 },
  ratingInput:     { backgroundColor: Colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider, padding: 8, fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textPrimary, minHeight: 48, textAlignVertical: "top" },
  ratingSubmit:    { flex: 1, backgroundColor: ACCENT, borderRadius: 8, padding: 9, alignItems: "center" },
  ratingSubmitText:{ fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  ratingCancel:    { backgroundColor: Colors.divider, borderRadius: 8, paddingHorizontal: 14, padding: 9, alignItems: "center", justifyContent: "center" },
  ratingCancelText:{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
});

// ─── أنماط بطاقة التحذير القانوني (lw = legal warning) ──────────────────────
const lw = StyleSheet.create({
  card:            { borderRadius: 16, overflow: "hidden", marginVertical: 12, borderWidth: 1.5, borderColor: "#DC262640" },
  gradient:        { padding: 16 },
  headerRow:       { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 12 },
  iconWrap:        { width: 40, height: 40, borderRadius: 20, backgroundColor: "#DC262618", alignItems: "center", justifyContent: "center" },
  title:           { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#DC2626", textAlign: "right" },
  subtitle:        { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#DC262699", textAlign: "right" },
  readMoreBtn:     { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "#DC262615", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  readMoreText:    { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#DC2626" },
  divider:         { height: 1, backgroundColor: "#DC262625", marginVertical: 12 },
  ruleRow:         { flexDirection: "row-reverse", gap: 10, marginBottom: 10, alignItems: "flex-start" },
  ruleIconWrap:    { width: 28, height: 28, borderRadius: 14, backgroundColor: "#DC262614", alignItems: "center", justifyContent: "center", marginTop: 2 },
  ruleTitle:       { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#DC2626", textAlign: "right", marginBottom: 3 },
  ruleBody:        { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  checkRow:        { flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#DC2626", alignItems: "center", justifyContent: "center", marginTop: 1, backgroundColor: "transparent" },
  checkboxChecked: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  checkText:       { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },
});

// ─── أنماط مودال الشروط القانونية (lm = legal modal) ────────────────────────
const lm = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" },
  sheet:         { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  headerGrad:    { flexDirection: "row-reverse", gap: 12, alignItems: "center", padding: 18 },
  headerTitle:   { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#DC2626", textAlign: "right" },
  headerSub:     { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#DC262299", textAlign: "right" },
  article:       { paddingHorizontal: 18, paddingVertical: 10 },
  articleHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  articleTitle:  { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#DC2626", textAlign: "right" },
  articleBody:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  divider:       { height: 1, backgroundColor: Colors.divider, marginHorizontal: 18 },
  bulletRow:     { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", marginTop: 8 },
  bullet:        { width: 6, height: 6, borderRadius: 3, backgroundColor: "#DC2626", marginTop: 7 },
  bulletText:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },
  footer:        { padding: 18, gap: 10 },
  acceptBtn:     { borderRadius: 12, overflow: "hidden" },
  acceptGrad:    { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 14 },
  acceptText:    { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  closeBtn:      { alignItems: "center", padding: 10 },
  closeBtnText:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
});
