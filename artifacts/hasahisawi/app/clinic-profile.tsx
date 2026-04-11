import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// ── الأنواع ──
type ClinicInfo = {
  id: number;
  inst_name: string;
  inst_type: string;
  inst_category: string;
  inst_description: string;
  inst_address: string;
  inst_phone: string;
  inst_email?: string;
  inst_website?: string;
  rep_name: string;
  rep_title: string;
  rep_phone?: string;
  created_at: string;
};

type ClinicService = {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  icon: string;
  price?: number | null;
  price_note?: string | null;
  show_price: boolean;
  sort_order: number;
};

type WorkHour = {
  id: number;
  day_of_week: number;
  day_name: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
  break_start?: string;
  break_end?: string;
  notes?: string;
};

// ── مساعدات ──
function isOpenNow(hours: WorkHour[]): { open: boolean; label: string; color: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = hours.find(h => h.day_of_week === dayOfWeek);
  if (!today || !today.is_open) return { open: false, label: "مغلق اليوم", color: Colors.danger };
  if (currentTime >= today.open_time && currentTime <= today.close_time) {
    if (today.break_start && today.break_end &&
        currentTime >= today.break_start && currentTime <= today.break_end) {
      return { open: false, label: "في فترة الاستراحة", color: Colors.accent };
    }
    return { open: true, label: "مفتوح الآن", color: "#22C55E" };
  }
  if (currentTime < today.open_time) {
    return { open: false, label: `يفتح الساعة ${today.open_time}`, color: Colors.accent };
  }
  return { open: false, label: `أغلق الساعة ${today.close_time}`, color: Colors.danger };
}

function groupByCategory(services: ClinicService[]): Record<string, ClinicService[]> {
  const groups: Record<string, ClinicService[]> = {};
  for (const svc of services) {
    if (!groups[svc.category]) groups[svc.category] = [];
    groups[svc.category].push(svc);
  }
  return groups;
}

// ══════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════
export default function ClinicProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const clinicId = params.id;

  const [clinic, setClinic]     = useState<ClinicInfo | null>(null);
  const [services, setServices] = useState<ClinicService[]>([]);
  const [hours, setHours]       = useState<WorkHour[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"services" | "hours">("services");

  const load = useCallback(async () => {
    if (!clinicId) return;
    const base = getApiUrl();
    if (!base) return;
    setLoading(true);
    try {
      const [cRes, sRes, hRes] = await Promise.all([
        fetch(`${base}/api/clinics/${clinicId}`),
        fetch(`${base}/api/clinics/${clinicId}/services`),
        fetch(`${base}/api/clinics/${clinicId}/hours`),
      ]);
      if (cRes.ok) { const d = await cRes.json() as any; setClinic(d.clinic); }
      if (sRes.ok) { const d = await sRes.json() as any; setServices(d.services || []); }
      if (hRes.ok) { const d = await hRes.json() as any; setHours(d.hours || []); }
    } catch {} finally { setLoading(false); }
  }, [clinicId]);

  useEffect(() => { load(); }, [load]);

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const clean = phone.replace(/[^0-9+]/g, "");
    Alert.alert("التواصل", clinic?.inst_name || "", [
      { text: "إلغاء", style: "cancel" },
      { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
      { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#E74C6F" />
      </View>
    );
  }

  if (!clinic) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <MaterialCommunityIcons name="hospital-off" size={64} color={Colors.textMuted} />
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textSecondary, marginTop: 16, textAlign: "center" }}>
          لم يتم العثور على المستوصف
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: "Cairo_600SemiBold", color: "#E74C6F" }}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const openStatus = hours.length > 0 ? isOpenNow(hours) : null;
  const grouped = groupByCategory(services);
  const categories = Object.keys(grouped);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        stickyHeaderIndices={[0]}
      >
        {/* بطاقة الرأس */}
        <LinearGradient
          colors={["#200810", "#1A0A10", "#120608", Colors.bg]}
          style={[cp.heroGrad, { paddingTop: (Platform.OS === "web" ? 67 : insets.top) + 8 }]}
        >
          {/* زر الرجوع */}
          <TouchableOpacity onPress={() => router.back()} style={cp.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* أيقونة + اسم */}
          <Animated.View entering={FadeIn.delay(100).duration(400)} style={cp.heroContent}>
            <View style={cp.clinicIconWrap}>
              <LinearGradient colors={["#E74C6F30", "#C4305720"]} style={cp.clinicIconBg}>
                <MaterialCommunityIcons name="hospital-building" size={44} color="#E74C6F" />
              </LinearGradient>
              {openStatus && (
                <Animated.View entering={ZoomIn.delay(300)} style={[cp.statusDot, { backgroundColor: openStatus.color }]} />
              )}
            </View>
            <Text style={cp.clinicName}>{clinic.inst_name}</Text>

            {openStatus && (
              <Animated.View entering={FadeIn.delay(200)} style={[cp.openBadge, { backgroundColor: openStatus.color + "20", borderColor: openStatus.color + "50" }]}>
                <View style={[cp.openDot, { backgroundColor: openStatus.color }]} />
                <Text style={[cp.openLabel, { color: openStatus.color }]}>{openStatus.label}</Text>
              </Animated.View>
            )}
          </Animated.View>

          {/* معلومات سريعة */}
          <Animated.View entering={FadeInDown.delay(150).springify()} style={cp.quickInfo}>
            {clinic.inst_address ? (
              <View style={cp.quickRow}>
                <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                <Text style={cp.quickText} numberOfLines={1}>{clinic.inst_address}</Text>
              </View>
            ) : null}
            {clinic.inst_phone ? (
              <TouchableOpacity onPress={() => handleCall(clinic.inst_phone)} style={cp.quickRow}>
                <Ionicons name="call-outline" size={14} color="#E74C6F" />
                <Text style={[cp.quickText, { color: "#E74C6F" }]}>{clinic.inst_phone}</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>

          {/* أزرار التواصل */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={cp.ctaBtns}>
            {clinic.inst_phone ? (
              <TouchableOpacity
                style={cp.callBtn}
                onPress={() => handleCall(clinic.inst_phone)}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#E74C6F", "#C43057"]} style={cp.callBtnGrad}>
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={cp.callBtnText}>اتصل الآن</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
            {clinic.inst_address ? (
              <TouchableOpacity
                style={cp.mapBtn}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(clinic.inst_address + " Hasahisa Sudan")}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate-outline" size={18} color="#E74C6F" />
                <Text style={cp.mapBtnText}>الموقع</Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>

          {/* تبويبات */}
          <View style={cp.tabs}>
            <TouchableOpacity
              style={[cp.tab, tab === "hours" && cp.tabActive]}
              onPress={() => setTab("hours")}
            >
              <Ionicons name="time-outline" size={15} color={tab === "hours" ? "#E74C6F" : Colors.textMuted} />
              <Text style={[cp.tabText, tab === "hours" && cp.tabTextActive]}>أوقات العمل</Text>
              {hours.length === 0 && <View style={cp.emptyDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[cp.tab, tab === "services" && cp.tabActive]}
              onPress={() => setTab("services")}
            >
              <MaterialCommunityIcons name="medical-bag" size={15} color={tab === "services" ? "#E74C6F" : Colors.textMuted} />
              <Text style={[cp.tabText, tab === "services" && cp.tabTextActive]}>الخدمات</Text>
              {services.length > 0 && (
                <View style={cp.countBadge}>
                  <Text style={cp.countBadgeText}>{services.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* محتوى تبويب الخدمات */}
        {tab === "services" && (
          <View style={{ padding: 16, gap: 16 }}>
            {services.length === 0 ? (
              <Animated.View entering={FadeIn.duration(300)} style={cp.emptyState}>
                <MaterialCommunityIcons name="stethoscope" size={52} color={Colors.textMuted} />
                <Text style={cp.emptyTitle}>لا توجد خدمات مضافة بعد</Text>
                <Text style={cp.emptySub}>سيُضيف المستوصف خدماته قريباً</Text>
              </Animated.View>
            ) : (
              categories.map((cat, catIdx) => (
                <Animated.View key={cat} entering={FadeInDown.delay(catIdx * 60).springify()}>
                  {/* عنوان التصنيف */}
                  <View style={cp.catHeader}>
                    <View style={cp.catLine} />
                    <Text style={cp.catTitle}>{cat}</Text>
                  </View>
                  <View style={{ gap: 10, marginTop: 8 }}>
                    {grouped[cat].map((svc, svcIdx) => (
                      <Animated.View key={svc.id} entering={FadeInDown.delay(catIdx * 60 + svcIdx * 40).springify()}>
                        <ServiceRow svc={svc} />
                      </Animated.View>
                    ))}
                  </View>
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* محتوى تبويب الأوقات */}
        {tab === "hours" && (
          <View style={{ padding: 16, gap: 10 }}>
            {hours.length === 0 ? (
              <Animated.View entering={FadeIn.duration(300)} style={cp.emptyState}>
                <Ionicons name="time-outline" size={52} color={Colors.textMuted} />
                <Text style={cp.emptyTitle}>أوقات العمل غير متوفرة</Text>
                <Text style={cp.emptySub}>تواصل مع المستوصف مباشرة للاستفسار</Text>
              </Animated.View>
            ) : (
              hours.map((h, idx) => (
                <Animated.View key={h.day_of_week} entering={FadeInDown.delay(idx * 40).springify()}>
                  <HourRow hour={h} />
                </Animated.View>
              ))
            )}
          </View>
        )}

        {/* بطاقة المعلومات */}
        {(clinic.inst_description || clinic.rep_name) && (
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <View style={cp.infoCard}>
              <View style={cp.infoCardHeader}>
                <MaterialCommunityIcons name="information-outline" size={18} color={Colors.cyber} />
                <Text style={cp.infoCardTitle}>عن المستوصف</Text>
              </View>
              {clinic.inst_description ? (
                <Text style={cp.infoCardDesc}>{clinic.inst_description}</Text>
              ) : null}
              {clinic.rep_name ? (
                <View style={cp.repRow}>
                  <View style={cp.repIconBox}>
                    <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={cp.repName}>{clinic.rep_name}</Text>
                    <Text style={cp.repTitle}>{clinic.rep_title}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ── صف خدمة واحدة ──
function ServiceRow({ svc }: { svc: ClinicService }) {
  return (
    <View style={sr.card}>
      <View style={sr.left}>
        {svc.price != null && svc.show_price ? (
          <View style={sr.priceBadge}>
            <Text style={sr.priceVal}>{Number(svc.price).toLocaleString()} SDG</Text>
            {svc.price_note ? <Text style={sr.priceNote}>{svc.price_note}</Text> : null}
          </View>
        ) : svc.price != null && !svc.show_price ? (
          <View style={[sr.priceBadge, { backgroundColor: Colors.bg }]}>
            <Text style={[sr.priceNote, { color: Colors.textMuted }]}>السعر عند الطلب</Text>
          </View>
        ) : (
          <View style={[sr.priceBadge, { backgroundColor: Colors.primary + "12" }]}>
            <Text style={[sr.priceNote, { color: Colors.primary }]}>مجاني</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, alignItems: "flex-end", gap: 3 }}>
        <Text style={sr.name}>{svc.name}</Text>
        {svc.description ? <Text style={sr.desc} numberOfLines={2}>{svc.description}</Text> : null}
      </View>
      <View style={sr.iconBox}>
        <MaterialCommunityIcons name={svc.icon as any} size={22} color="#E74C6F" />
      </View>
    </View>
  );
}

// ── صف يوم واحد ──
function HourRow({ hour }: { hour: WorkHour }) {
  const now = new Date();
  const isToday = now.getDay() === hour.day_of_week;

  return (
    <View style={[hr.row, isToday && hr.rowToday, !hour.is_open && hr.rowClosed]}>
      {isToday && <View style={hr.todayIndicator} />}
      <View style={hr.right}>
        <Text style={[hr.dayName, !hour.is_open && { color: Colors.textMuted }]}>
          {hour.day_name}
          {isToday ? "  (اليوم)" : ""}
        </Text>
        {hour.notes ? <Text style={hr.notes}>{hour.notes}</Text> : null}
      </View>
      <View style={hr.timeWrap}>
        {hour.is_open ? (
          <>
            <Text style={hr.timeRange}>{hour.open_time} – {hour.close_time}</Text>
            {hour.break_start && hour.break_end ? (
              <Text style={hr.breakTime}>استراحة: {hour.break_start}–{hour.break_end}</Text>
            ) : null}
          </>
        ) : (
          <View style={hr.closedBadge}>
            <Text style={hr.closedText}>مغلق</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// الأنماط
// ══════════════════════════════════════════════════════
const cp = StyleSheet.create({
  heroGrad: { paddingHorizontal: 16, paddingBottom: 4 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.cardBg + "90", justifyContent: "center", alignItems: "center",
    marginBottom: 16, borderWidth: 1, borderColor: Colors.divider + "60",
  },
  heroContent: { alignItems: "center", gap: 10, marginBottom: 16 },
  clinicIconWrap: { position: "relative" },
  clinicIconBg: {
    width: 88, height: 88, borderRadius: 24,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#E74C6F30",
  },
  statusDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: Colors.bg,
  },
  clinicName: {
    fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary,
    textAlign: "center", lineHeight: 32,
  },
  openBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  openLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  quickInfo: { gap: 6, marginBottom: 12 },
  quickRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, justifyContent: "center" },
  quickText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  ctaBtns: { flexDirection: "row-reverse", gap: 10, marginBottom: 16 },
  callBtn: { flex: 1 },
  callBtnGrad: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 14,
  },
  callBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  mapBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1.5, borderColor: "#E74C6F50", backgroundColor: "#E74C6F10",
  },
  mapBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#E74C6F" },
  tabs: {
    flexDirection: "row", gap: 8,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: Colors.divider, marginBottom: 4,
  },
  tab: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabActive: { backgroundColor: "#E74C6F18" },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  tabTextActive: { color: "#E74C6F" },
  countBadge: {
    backgroundColor: "#E74C6F", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: "center",
  },
  countBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  emptyDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted,
  },
  catHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  catLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  catTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textSecondary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  infoCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, gap: 12,
  },
  infoCardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  infoCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  infoCardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  repRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 10,
  },
  repIconBox: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.divider, justifyContent: "center", alignItems: "center",
  },
  repName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  repTitle: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
});

const sr = StyleSheet.create({
  card: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
  },
  iconBox: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: "#E74C6F12", borderWidth: 1, borderColor: "#E74C6F30",
    justifyContent: "center", alignItems: "center",
  },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, lineHeight: 20 },
  left: { alignItems: "flex-start" },
  priceBadge: {
    backgroundColor: "#E74C6F12", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: "center", minWidth: 70,
  },
  priceVal: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#E74C6F" },
  priceNote: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center" },
});

const hr = StyleSheet.create({
  row: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.divider, gap: 10,
  },
  rowToday: { borderColor: "#E74C6F40", backgroundColor: "#E74C6F08" },
  rowClosed: { opacity: 0.6 },
  todayIndicator: {
    position: "absolute", right: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: "#E74C6F", borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0, borderTopRightRadius: 14, borderBottomRightRadius: 14,
  },
  right: { flex: 1, alignItems: "flex-end" },
  dayName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  notes: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  timeWrap: { alignItems: "flex-start" },
  timeRange: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  breakTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  closedBadge: {
    backgroundColor: Colors.danger + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  closedText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.danger },
});
