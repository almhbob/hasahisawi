import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Pressable, Modal, Linking,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

// ─── Types ────────────────────────────────────────────────────────────────────
type TransportStatus = "available" | "coming_soon" | "maintenance";

type TransportDriver = {
  id: number; name: string; phone: string; vehicle_type: string;
  vehicle_desc: string; plate: string; area: string;
  status: "pending" | "approved" | "rejected"; admin_note: string;
  is_online: boolean; total_trips: number; rating: number; created_at: string;
};

type TransportTrip = {
  id: number; user_name: string; user_phone: string; trip_type: string;
  from_location: string; to_location: string; notes: string;
  from_zone: number | null; to_zone: number | null;
  fare_estimate: number | null; vehicle_preference: string;
  delivery_desc: string | null;
  status: string; driver_name: string | null; driver_id: number | null;
  created_at: string; rating: number | null;
};

type Stats = { drivers: any[]; trips: any[]; pendingDrivers: number };

type TransportView = "overview" | "fares" | "drivers" | "trips" | "settings";

const ZONE_NAMES  = ["قلب المدينة", "الأحياء الوسطى", "أطراف المدينة", "المناطق الفرعية", "القرى المحيطة"];
const ZONE_COLORS = ["#F97316", "#3E9CBF", "#A855F7", "#3EFF9C", "#FBBF24"];

// ─── API helper ───────────────────────────────────────────────────────────────
function apiFetch(path: string, token: string | null, opts: RequestInit = {}) {
  const base = getApiUrl();
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as any),
    },
  });
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function AdminTransportScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) router.replace("/admin" as any);
  }, [user]);

  // ── view state
  const [view, setView] = useState<TransportView>("overview");

  // ── settings
  const [transportStatus, setTransportStatus] = useState<TransportStatus>("coming_soon");
  const [transportNote,   setTransportNote]   = useState("");
  const [transportPhone,  setTransportPhone]  = useState("");
  const [savingSettings,  setSavingSettings]  = useState(false);

  // ── data
  const [loading,      setLoading]      = useState(true);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [drivers,      setDrivers]      = useState<TransportDriver[]>([]);
  const [trips,        setTrips]        = useState<TransportTrip[]>([]);
  const [driverFilter, setDriverFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [tripFilter,   setTripFilter]   = useState<"all" | "pending" | "accepted" | "completed" | "cancelled">("all");

  // ── fares
  const [fareMatrix,   setFareMatrix]   = useState<Record<number, Record<number, { car: number; rickshaw: number; delivery: number }>>>({});
  const [editingFares, setEditingFares] = useState<Record<string, { car: string; rickshaw: string; delivery: string }>>({});
  const [savingFares,  setSavingFares]  = useState(false);

  // ── assign modal
  const [showAssign,        setShowAssign]        = useState(false);
  const [assigningTripId,   setAssigningTripId]   = useState<number | null>(null);
  const [approvedDrivers,   setApprovedDrivers]   = useState<TransportDriver[]>([]);
  const [assigningId,       setAssigningId]       = useState<number | null>(null);

  // ── actions
  const [updatingTripId,    setUpdatingTripId]    = useState<number | null>(null);

  // ─── Load all data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, driversRes, tripsRes, statsRes, faresRes] = await Promise.all([
        apiFetch("/api/admin/transport/settings", token),
        apiFetch(`/api/admin/transport/drivers?status=${driverFilter}`, token),
        apiFetch(`/api/admin/transport/trips?status=${tripFilter}`, token),
        apiFetch("/api/admin/transport/stats", token),
        fetch(`${getApiUrl()}/api/transport/fares`),
      ]);

      if (settingsRes.ok) {
        const d = await settingsRes.json();
        const st = d.transport_status as TransportStatus;
        setTransportStatus(["available","coming_soon","maintenance"].includes(st) ? st : "coming_soon");
        setTransportNote(d.transport_note || "");
        setTransportPhone(d.transport_phone || "");
      }
      if (driversRes.ok) setDrivers(await driversRes.json());
      if (tripsRes.ok)   setTrips(await tripsRes.json());
      if (statsRes.ok)   setStats(await statsRes.json());
      if (faresRes.ok) {
        const fm = await faresRes.json();
        setFareMatrix(fm);
        const init: Record<string, { car: string; rickshaw: string; delivery: string }> = {};
        for (let f = 1; f <= 5; f++) {
          for (let t = 1; t <= 5; t++) {
            const key = `${f}-${t}`;
            init[key] = {
              car:      String(fm[f]?.[t]?.car      ?? ""),
              rickshaw: String(fm[f]?.[t]?.rickshaw ?? ""),
              delivery: String(fm[f]?.[t]?.delivery ?? ""),
            };
          }
        }
        setEditingFares(init);
      }
    } catch {}
    setLoading(false);
  }, [token, driverFilter, tripFilter]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (view === "drivers") loadDrivers();
    if (view === "trips")   loadTrips();
  }, [driverFilter, tripFilter]);

  const loadDrivers = async () => {
    try {
      const res = await apiFetch(`/api/admin/transport/drivers?status=${driverFilter}`, token);
      if (res.ok) setDrivers(await res.json());
    } catch {}
  };

  const loadTrips = async () => {
    try {
      const res = await apiFetch(`/api/admin/transport/trips?status=${tripFilter}`, token);
      if (res.ok) setTrips(await res.json());
    } catch {}
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await apiFetch("/api/admin/transport/settings", token, {
        method: "PUT",
        body: JSON.stringify({ transport_status: transportStatus, transport_note: transportNote, transport_phone: transportPhone }),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث إعدادات مشوارك علينا");
      else { const j = await res.json(); Alert.alert("خطأ", j.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setSavingSettings(false);
  };

  const approveDriver = async (driver: TransportDriver, newStatus: "approved" | "rejected") => {
    try {
      const res = await apiFetch(`/api/admin/transport/drivers/${driver.id}`, token, {
        method: "PATCH", body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: newStatus } : d));
        Alert.alert("تم", newStatus === "approved" ? `تم قبول السائق ${driver.name}` : `تم رفض السائق ${driver.name}`);
      }
    } catch { Alert.alert("خطأ", "تعذّرت العملية"); }
  };

  const deleteDriver = async (id: number) => {
    Alert.alert("حذف سائق", "هل تريد حذف هذا السائق نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await apiFetch(`/api/admin/transport/drivers/${id}`, token, { method: "DELETE" });
          setDrivers(prev => prev.filter(d => d.id !== id));
        } catch {}
      }},
    ]);
  };

  const deleteTrip = async (id: number) => {
    try {
      await apiFetch(`/api/admin/transport/trips/${id}`, token, { method: "DELETE" });
      setTrips(prev => prev.filter(t => t.id !== id));
    } catch {}
  };

  const openAssign = async (tripId: number) => {
    setAssigningTripId(tripId);
    setShowAssign(true);
    try {
      const res = await apiFetch("/api/admin/transport/drivers?status=approved", token);
      if (res.ok) setApprovedDrivers(await res.json());
    } catch {}
  };

  const assignDriver = async (driver: TransportDriver) => {
    if (!assigningTripId) return;
    setAssigningId(driver.id);
    try {
      const res = await apiFetch(`/api/admin/transport/trips/${assigningTripId}/assign`, token, {
        method: "PATCH",
        body: JSON.stringify({ driver_id: driver.id, status: "accepted" }),
      });
      if (res.ok) {
        setTrips(prev => prev.map(t =>
          t.id === assigningTripId ? { ...t, status: "accepted", driver_id: driver.id, driver_name: driver.name } : t
        ));
        setShowAssign(false); setAssigningTripId(null);
        Alert.alert("✅ تم التعيين", `تم تعيين السائق ${driver.name}`);
      } else {
        const j = await res.json();
        Alert.alert("خطأ", j.error || "تعذّرت العملية");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setAssigningId(null);
  };

  const updateTrip = async (tripId: number, newStatus: "accepted" | "completed" | "cancelled") => {
    setUpdatingTripId(tripId);
    try {
      const res = await apiFetch(`/api/transport/trips/${tripId}`, token, {
        method: "PATCH", body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: newStatus } : t));
      else Alert.alert("خطأ", "تعذّر تحديث الرحلة");
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setUpdatingTripId(null);
  };

  const updateFareField = (f: number, t: number, field: "car" | "rickshaw" | "delivery", val: string) => {
    const key = `${f}-${t}`;
    setEditingFares(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
  };

  const saveFares = async () => {
    setSavingFares(true);
    try {
      const fares = Object.keys(editingFares).map(key => {
        const [f, t] = key.split("-").map(Number);
        const v = editingFares[key];
        return { from_zone: f, to_zone: t, fare_car: Number(v.car)||0, fare_rickshaw: Number(v.rickshaw)||0, fare_delivery: Number(v.delivery)||0 };
      });
      const res = await apiFetch("/api/admin/transport/fares/bulk", token, {
        method: "PUT", body: JSON.stringify({ fares }),
      });
      if (res.ok) Alert.alert("✅ تم الحفظ", "تم تحديث جدول التعرفة");
      else { const j = await res.json(); Alert.alert("خطأ", j.error || "تعذّر حفظ التعرفة"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setSavingFares(false);
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const totalDrivers   = stats ? stats.drivers.reduce((a: number, d: any) => a + parseInt(d.cnt), 0) : 0;
  const approvedCount  = stats ? (stats.drivers.find((d: any) => d.status === "approved")?.cnt || 0) : 0;
  const totalTrips     = stats ? stats.trips.reduce((a: number, t: any) => a + parseInt(t.cnt), 0) : 0;
  const pendingTrips   = stats ? (stats.trips.find((t: any) => t.status === "pending")?.cnt || 0) : 0;

  const statusColor = transportStatus === "available" ? "#3EFF9C" : transportStatus === "maintenance" ? "#F59E0B" : "#6366F1";
  const statusLabel = transportStatus === "available" ? "متاحة" : transportStatus === "maintenance" ? "قيد الصيانة" : "قريباً";

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>إدارة مشوارك علينا</Text>
          <View style={[s.statusPill, { backgroundColor: statusColor + "20", borderColor: statusColor + "40" }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={loadData} style={s.backBtn}>
          <Ionicons name="refresh-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Stats Bar ── */}
      <View style={s.statsBar}>
        {[
          { label: "طلبات انضمام", val: stats?.pendingDrivers || 0, color: "#F97316", icon: "account-clock" },
          { label: "سائق معتمد",   val: Number(approvedCount),       color: "#3EFF9C", icon: "steering" },
          { label: "إجمالي رحلات", val: totalTrips,                  color: "#3E9CBF", icon: "map-marker-path" },
          { label: "رحلة انتظار",  val: Number(pendingTrips),        color: "#FBBF24", icon: "clock-outline" },
        ].map((st, i) => (
          <View key={i} style={[s.statCard, { borderColor: st.color + "30", backgroundColor: st.color + "12" }]}>
            <MaterialCommunityIcons name={st.icon as any} size={16} color={st.color} />
            <Text style={[s.statVal, { color: st.color }]}>{st.val}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Nav Tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.navBar}>
        {([
          { v: "overview", label: "نظرة عامة",   icon: "view-dashboard-outline" },
          { v: "fares",    label: "التعرفة",       icon: "calculator-variant" },
          { v: "drivers",  label: "السائقون",      icon: "steering" },
          { v: "trips",    label: "الرحلات",       icon: "map-marker-path" },
          { v: "settings", label: "الإعدادات",     icon: "cog-outline" },
        ] as const).map(nav => (
          <TouchableOpacity key={nav.v} onPress={() => setView(nav.v)}
            style={[s.navTab, view === nav.v && { backgroundColor: "#F97316", borderColor: "#F97316" }]}>
            <MaterialCommunityIcons name={nav.icon} size={13} color={view === nav.v ? "#fff" : Colors.textSecondary} />
            <Text style={[s.navTabText, { color: view === nav.v ? "#fff" : Colors.textSecondary }]}>{nav.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* ══ نظرة عامة ══ */}
          {view === "overview" && (
            <View style={{ gap: 12 }}>

              {/* توزيع السائقين */}
              <View style={s.card}>
                <View style={s.cardRow}>
                  <View style={[s.cardIcon, { backgroundColor: "#3EFF9C20" }]}>
                    <MaterialCommunityIcons name="steering" size={18} color="#3EFF9C" />
                  </View>
                  <Text style={s.cardTitle}>توزيع السائقين</Text>
                </View>
                {[
                  { label: "في انتظار المراجعة", status: "pending",  color: "#F97316" },
                  { label: "معتمدون",             status: "approved", color: "#3EFF9C" },
                  { label: "مرفوضون",             status: "rejected", color: "#E05567" },
                ].map(r => {
                  const cnt = Number(stats?.drivers.find((d: any) => d.status === r.status)?.cnt || 0);
                  const pct = totalDrivers > 0 ? (cnt / totalDrivers) * 100 : 0;
                  return (
                    <View key={r.status} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary }}>{r.label}</Text>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: r.color }}>{cnt}</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: Colors.divider, borderRadius: 3 }}>
                        <View style={{ height: 6, width: `${pct}%` as any, backgroundColor: r.color, borderRadius: 3 }} />
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity onPress={() => { setDriverFilter("pending"); setView("drivers"); }}
                  style={{ alignSelf: "flex-end", marginTop: 6 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#F97316" }}>
                    مراجعة طلبات الانضمام ({stats?.pendingDrivers || 0}) ←
                  </Text>
                </TouchableOpacity>
              </View>

              {/* حالة الرحلات */}
              <View style={s.card}>
                <View style={s.cardRow}>
                  <View style={[s.cardIcon, { backgroundColor: "#3E9CBF20" }]}>
                    <MaterialCommunityIcons name="map-marker-path" size={18} color="#3E9CBF" />
                  </View>
                  <Text style={s.cardTitle}>حالة الرحلات</Text>
                </View>
                {[
                  { label: "انتظار",  status: "pending",   color: "#FBBF24" },
                  { label: "جارية",  status: "accepted",  color: "#3E9CBF" },
                  { label: "مكتملة", status: "completed", color: "#3EFF9C" },
                  { label: "ملغاة",  status: "cancelled", color: "#E05567" },
                ].map(r => {
                  const cnt = Number(stats?.trips.find((t: any) => t.status === r.status)?.cnt || 0);
                  return (
                    <View key={r.status} style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.divider }}>
                      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary }}>{r.label}</Text>
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: r.color }}>{cnt}</Text>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity onPress={() => { setTripFilter("pending"); setView("trips"); }}
                  style={{ alignSelf: "flex-end", marginTop: 10 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#3EFF9C" }}>عرض الرحلات ←</Text>
                </TouchableOpacity>
              </View>

              {/* ملخص التعرفة */}
              <View style={s.card}>
                <View style={s.cardRow}>
                  <View style={[s.cardIcon, { backgroundColor: "#FBBF2420" }]}>
                    <MaterialCommunityIcons name="calculator-variant" size={18} color="#FBBF24" />
                  </View>
                  <Text style={s.cardTitle}>التعرفة الأساسية داخل المنطقة</Text>
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(z => (
                    <View key={z} style={{ flex: 1, backgroundColor: ZONE_COLORS[z-1] + "15", borderRadius: 10, padding: 8, alignItems: "center", borderWidth: 1, borderColor: ZONE_COLORS[z-1] + "30" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: ZONE_COLORS[z-1] }}>م{z}</Text>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, marginTop: 4 }}>{fareMatrix[z]?.[z]?.car || "—"}</Text>
                      <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 9, color: Colors.textMuted }}>سيارة</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity onPress={() => setView("fares")} style={{ alignSelf: "flex-end", marginTop: 10 }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#FBBF24" }}>تعديل الجدول الكامل ←</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ══ التعرفة ══ */}
          {view === "fares" && (
            <View style={{ gap: 10 }}>
              <View style={s.card}>
                <View style={s.cardRow}>
                  <View style={[s.cardIcon, { backgroundColor: "#FBBF2420" }]}>
                    <MaterialCommunityIcons name="calculator-variant" size={18} color="#FBBF24" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>جدول التعرفة (جنيه سوداني)</Text>
                    <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right" }}>
                      🚗 سيارة · 🛺 ركشة · 📦 توصيل
                    </Text>
                  </View>
                </View>
              </View>

              {[1, 2, 3, 4, 5].map(fromZ => (
                <View key={fromZ} style={s.card}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ZONE_COLORS[fromZ-1] + "25", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: ZONE_COLORS[fromZ-1] }}>م{fromZ}</Text>
                    </View>
                    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary }}>
                      من: {ZONE_NAMES[fromZ-1]}
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {[1, 2, 3, 4, 5].map(toZ => {
                      const key = `${fromZ}-${toZ}`;
                      const ef = editingFares[key] || { car: "", rickshaw: "", delivery: "" };
                      return (
                        <View key={toZ} style={{ backgroundColor: Colors.bg, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: ZONE_COLORS[toZ-1] + "30" }}>
                          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: ZONE_COLORS[toZ-1] + "25", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 9, color: ZONE_COLORS[toZ-1] }}>م{toZ}</Text>
                            </View>
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary }}>إلى: {ZONE_NAMES[toZ-1]}</Text>
                          </View>
                          <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                            {(["car", "rickshaw", "delivery"] as const).map((field, fi) => (
                              <View key={field} style={{ flex: 1, alignItems: "center", gap: 3 }}>
                                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12 }}>{["🚗", "🛺", "📦"][fi]}</Text>
                                <TextInput
                                  style={s.fareInput}
                                  value={ef[field]}
                                  onChangeText={v => updateFareField(fromZ, toZ, field, v)}
                                  keyboardType="numeric"
                                  placeholder={["سيارة", "ركشة", "توصيل"][fi]}
                                  placeholderTextColor={Colors.textMuted}
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={saveFares} disabled={savingFares}
                style={[s.saveBtn, { backgroundColor: "#FBBF24", marginBottom: 20 }]}>
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#000" />
                <Text style={[s.saveBtnText, { color: "#000" }]}>
                  {savingFares ? "جارٍ الحفظ..." : "حفظ جدول التعرفة"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══ السائقون ══ */}
          {view === "drivers" && (
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.cardIcon, { backgroundColor: "#F9731620" }]}>
                  <MaterialCommunityIcons name="steering" size={18} color="#F97316" />
                </View>
                <Text style={s.cardTitle}>إدارة السائقين</Text>
              </View>

              <View style={{ flexDirection: "row-reverse", gap: 6, marginBottom: 12 }}>
                {(["pending", "approved", "rejected", "all"] as const).map(f => (
                  <TouchableOpacity key={f} onPress={() => setDriverFilter(f)}
                    style={[s.filterChip, driverFilter === f && { backgroundColor: "#F97316", borderColor: "#F97316" }]}>
                    <Text style={[s.filterChipText, { color: driverFilter === f ? "#fff" : Colors.textSecondary }]}>
                      {f === "pending" ? "انتظار" : f === "approved" ? "مقبول" : f === "rejected" ? "مرفوض" : "الكل"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {drivers.length === 0
                ? <Text style={s.emptyText}>لا يوجد سائقون في هذه الفئة</Text>
                : drivers.map(driver => (
                  <Animated.View entering={FadeInDown.springify()} key={driver.id}
                    style={[s.driverCard, { borderColor: driver.status === "approved" ? "#3EFF9C30" : driver.status === "rejected" ? "#E0556730" : "#F9731630" }]}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F9731620", alignItems: "center", justifyContent: "center" }}>
                        <MaterialCommunityIcons name={driver.vehicle_type === "ركشة" ? "rickshaw" : "steering"} size={20} color="#F97316" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" }}>{driver.name}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right" }}>{driver.vehicle_type} · {driver.phone}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10,
                        backgroundColor: driver.status === "approved" ? "#3EFF9C20" : driver.status === "rejected" ? "#E0556720" : "#F9731620" }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11,
                          color: driver.status === "approved" ? "#3EFF9C" : driver.status === "rejected" ? "#E05567" : "#F97316" }}>
                          {driver.status === "approved" ? "معتمد" : driver.status === "rejected" ? "مرفوض" : "انتظار"}
                        </Text>
                      </View>
                    </View>
                    {driver.area ? <Text style={s.driverInfo}>📍 {driver.area} | اللوحة: {driver.plate || "—"}</Text> : null}
                    {driver.vehicle_desc ? <Text style={[s.driverInfo, { color: Colors.textMuted, marginBottom: 8 }]}>{driver.vehicle_desc}</Text> : null}
                    <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                      {driver.status !== "approved" && (
                        <TouchableOpacity onPress={() => approveDriver(driver, "approved")}
                          style={{ flex: 1, backgroundColor: "#3EFF9C20", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#3EFF9C40" }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#3EFF9C" }}>✓ قبول</Text>
                        </TouchableOpacity>
                      )}
                      {driver.status !== "rejected" && (
                        <TouchableOpacity onPress={() => approveDriver(driver, "rejected")}
                          style={{ flex: 1, backgroundColor: "#E0556720", borderRadius: 8, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: "#E0556740" }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#E05567" }}>✗ رفض</Text>
                        </TouchableOpacity>
                      )}
                      {driver.phone ? (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${driver.phone}`)}
                          style={{ backgroundColor: "#3EFF9C15", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", borderWidth: 1, borderColor: "#3EFF9C30" }}>
                          <Ionicons name="call-outline" size={15} color="#3EFF9C" />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity onPress={() => deleteDriver(driver.id)}
                        style={{ backgroundColor: Colors.bg, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.divider }}>
                        <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                ))}
            </View>
          )}

          {/* ══ الرحلات ══ */}
          {view === "trips" && (
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.cardIcon, { backgroundColor: "#3EFF9C20" }]}>
                  <MaterialCommunityIcons name="map-marker-path" size={18} color="#3EFF9C" />
                </View>
                <Text style={s.cardTitle}>مراقبة الرحلات</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, marginBottom: 12, flexDirection: "row-reverse" }}>
                {(["all", "pending", "accepted", "completed", "cancelled"] as const).map(f => (
                  <TouchableOpacity key={f} onPress={() => setTripFilter(f)}
                    style={[s.filterChip, tripFilter === f && { backgroundColor: "#3EFF9C20", borderColor: "#3EFF9C" }]}>
                    <Text style={[s.filterChipText, { color: tripFilter === f ? "#3EFF9C" : Colors.textSecondary }]}>
                      {f === "all" ? "الكل" : f === "pending" ? "انتظار" : f === "accepted" ? "جارية" : f === "completed" ? "مكتملة" : "ملغاة"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {trips.length === 0
                ? <Text style={s.emptyText}>لا توجد رحلات في هذه الفئة</Text>
                : trips.map(trip => {
                  const sc = trip.status === "completed" ? "#3EFF9C" : trip.status === "cancelled" ? "#E05567" : trip.status === "accepted" ? "#3E9CBF" : "#F97316";
                  const sl = trip.status === "pending" ? "انتظار" : trip.status === "accepted" ? "جارية" : trip.status === "completed" ? "مكتملة" : "ملغاة";
                  return (
                    <Animated.View entering={FadeInDown.springify()} key={trip.id}
                      style={{ backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: sc + "30" }}>
                      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name={trip.trip_type === "delivery" ? "package-variant" : "car-side"} size={16} color="#F97316" />
                          <View>
                            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary }}>{trip.user_name}</Text>
                            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{trip.user_phone}</Text>
                          </View>
                        </View>
                        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: sc + "20", borderWidth: 1, borderColor: sc + "40" }}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: sc }}>{sl}</Text>
                        </View>
                      </View>
                      <View style={{ gap: 4, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3EFF9C" }} />
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right" }}>
                            {trip.from_zone ? `منطقة ${trip.from_zone} — ` : ""}{trip.from_location}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F97316" }} />
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right" }}>
                            {trip.to_zone ? `منطقة ${trip.to_zone} — ` : ""}{trip.to_location}
                          </Text>
                        </View>
                      </View>
                      {trip.fare_estimate ? (
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 6, backgroundColor: "#FBBF2415", borderRadius: 8, padding: 6 }}>
                          <MaterialCommunityIcons name="calculator-variant" size={13} color="#FBBF24" />
                          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#FBBF24" }}>
                            التعرفة التقديرية: {trip.fare_estimate.toLocaleString("ar-SD")} جنيه
                          </Text>
                        </View>
                      ) : null}
                      {trip.delivery_desc ? (
                        <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 6, marginBottom: 8, backgroundColor: "#F9731610", borderRadius: 8, padding: 8 }}>
                          <MaterialCommunityIcons name="package-variant" size={13} color="#F97316" />
                          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right" }}>
                            {trip.delivery_desc}
                          </Text>
                        </View>
                      ) : null}
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name="steering" size={13} color={trip.driver_name ? "#3EFF9C" : Colors.textMuted} />
                          <Text style={{ fontFamily: trip.driver_name ? "Cairo_600SemiBold" : "Cairo_400Regular", fontSize: 12, color: trip.driver_name ? "#3EFF9C" : Colors.textMuted }}>
                            {trip.driver_name ?? "لم يُعيَّن سائق"}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>
                          {new Date(trip.created_at).toLocaleDateString("ar-SD")}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                        {trip.status === "pending" && (
                          <TouchableOpacity onPress={() => openAssign(trip.id)} disabled={updatingTripId === trip.id}
                            style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5,
                              backgroundColor: "#3E9CBF20", borderRadius: 8, paddingVertical: 8, borderWidth: 1, borderColor: "#3E9CBF40" }}>
                            <MaterialCommunityIcons name="steering" size={13} color="#3E9CBF" />
                            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#3E9CBF" }}>تعيين سائق</Text>
                          </TouchableOpacity>
                        )}
                        {trip.status === "accepted" && (
                          <TouchableOpacity onPress={() => updateTrip(trip.id, "completed")} disabled={updatingTripId === trip.id}
                            style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5,
                              backgroundColor: "#3EFF9C20", borderRadius: 8, paddingVertical: 8, borderWidth: 1, borderColor: "#3EFF9C40" }}>
                            {updatingTripId === trip.id
                              ? <ActivityIndicator size="small" color="#3EFF9C" />
                              : <><Ionicons name="checkmark-circle-outline" size={13} color="#3EFF9C" /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#3EFF9C" }}>إنهاء</Text></>}
                          </TouchableOpacity>
                        )}
                        {(trip.status === "pending" || trip.status === "accepted") && (
                          <TouchableOpacity onPress={() => updateTrip(trip.id, "cancelled")} disabled={updatingTripId === trip.id}
                            style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4,
                              backgroundColor: "#E0556715", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#E0556730" }}>
                            <Ionicons name="close-circle-outline" size={13} color="#E05567" />
                            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#E05567" }}>إلغاء</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => deleteTrip(trip.id)}
                          style={{ backgroundColor: Colors.bg, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10,
                            alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.divider }}>
                          <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  );
                })}
            </View>
          )}

          {/* ══ الإعدادات ══ */}
          {view === "settings" && (
            <View style={s.card}>
              <View style={s.cardRow}>
                <View style={[s.cardIcon, { backgroundColor: "#F9731620" }]}>
                  <Ionicons name="settings-outline" size={18} color="#F97316" />
                </View>
                <Text style={s.cardTitle}>إعدادات مشوارك علينا</Text>
              </View>

              <Text style={s.fieldLabel}>حالة الخدمة</Text>
              <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 6 }}>
                {([
                  { key: "available",   label: "متاحة",       icon: "checkmark-circle", color: "#22C55E" },
                  { key: "maintenance", label: "صيانة",        icon: "construct",        color: "#F59E0B" },
                  { key: "coming_soon", label: "قريباً",       icon: "time",             color: "#6366F1" },
                ] as const).map(opt => {
                  const active = transportStatus === opt.key;
                  return (
                    <TouchableOpacity key={opt.key} onPress={() => setTransportStatus(opt.key)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 2, gap: 6,
                        borderColor: active ? opt.color : Colors.divider,
                        backgroundColor: active ? opt.color + "18" : Colors.cardBg }}>
                      <Ionicons name={opt.icon as any} size={20} color={active ? opt.color : Colors.textMuted} />
                      <Text style={{ fontFamily: active ? "Cairo_700Bold" : "Cairo_500Medium", fontSize: 12,
                        color: active ? opt.color : Colors.textMuted }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.fieldHint}>
                {transportStatus === "available"   && "✅ الخدمة متاحة — يرى المستخدمون واجهة الحجز"}
                {transportStatus === "maintenance" && "🔧 قيد الصيانة — يرى المستخدمون إشعار صيانة مؤقتة"}
                {transportStatus === "coming_soon" && "🕐 قريباً — يرى المستخدمون شاشة الإطلاق القادم"}
              </Text>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>رقم هاتف الدعم (اختياري)</Text>
              <TextInput style={s.fieldInput} value={transportPhone} onChangeText={setTransportPhone}
                placeholder="+249..." placeholderTextColor={Colors.textMuted}
                textAlign="right" keyboardType="phone-pad" />

              <Text style={s.fieldLabel}>ملاحظة للمستخدمين عند إيقاف الخدمة</Text>
              <TextInput style={[s.fieldInput, { minHeight: 72, textAlignVertical: "top" }]}
                value={transportNote} onChangeText={setTransportNote}
                placeholder="مثال: سيتم الإطلاق خلال أسبوعين..."
                placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

              <TouchableOpacity onPress={saveSettings} disabled={savingSettings}
                style={[s.saveBtn, { backgroundColor: "#F97316", marginTop: 12 }]}>
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={s.saveBtnText}>{savingSettings ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      )}

      {/* ── Assign Driver Modal ── */}
      <Modal visible={showAssign} transparent animationType="slide"
        onRequestClose={() => { setShowAssign(false); setAssigningTripId(null); }}>
        <Pressable style={s.backdrop} onPress={() => { setShowAssign(false); setAssigningTripId(null); }}>
          <Animated.View entering={FadeInDown.springify().damping(22)} style={s.sheet}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={s.handle} />
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <MaterialCommunityIcons name="steering" size={22} color="#3E9CBF" />
                <View>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary }}>تعيين سائق للرحلة</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>اختر من السائقين المعتمدين</Text>
                </View>
              </View>
              {approvedDrivers.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <MaterialCommunityIcons name="account-off-outline" size={48} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, marginTop: 10 }}>
                    لا يوجد سائقون معتمدون
                  </Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  {approvedDrivers.map(driver => (
                    <TouchableOpacity key={driver.id} onPress={() => assignDriver(driver)}
                      disabled={assigningId === driver.id}
                      style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12,
                        padding: 14, borderRadius: 12, marginBottom: 8,
                        backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider }}>
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#3E9CBF20", alignItems: "center", justifyContent: "center" }}>
                        <MaterialCommunityIcons name="steering" size={20} color="#3E9CBF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary }}>{driver.name}</Text>
                        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{driver.area}</Text>
                      </View>
                      {assigningId === driver.id
                        ? <ActivityIndicator size="small" color="#3E9CBF" />
                        : <Ionicons name="checkmark-circle-outline" size={22} color="#3E9CBF" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.bg },
  header:      { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  backBtn:     { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  statusPill:  { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1, marginTop: 3 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },
  statusText:  { fontFamily: "Cairo_700Bold", fontSize: 11 },
  statsBar:    { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  statCard:    { flex: 1, borderRadius: 10, padding: 8, borderWidth: 1, alignItems: "center", gap: 3 },
  statVal:     { fontFamily: "Cairo_700Bold", fontSize: 16 },
  statLabel:   { fontFamily: "Cairo_400Regular", fontSize: 9, color: Colors.textSecondary, textAlign: "center" },
  navBar:      { gap: 6, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row-reverse" },
  navTab:      { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  navTabText:  { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  content:     { padding: 16, paddingBottom: 40, gap: 12 },
  card:        { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.divider },
  cardRow:     { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 },
  cardIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle:   { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  emptyText:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", paddingVertical: 24 },
  filterChip:  { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg },
  filterChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  driverCard:  { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  driverInfo:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginBottom: 4 },
  fareInput:   { backgroundColor: Colors.cardBg, borderRadius: 6, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 6, paddingVertical: 5, fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary, textAlign: "center", width: "100%" },
  fieldLabel:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginBottom: 8, marginTop: 12 },
  fieldHint:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 8, lineHeight: 18 },
  fieldInput:  { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  saveBtn:     { borderRadius: 14, paddingVertical: 13, alignItems: "center", flexDirection: "row-reverse", justifyContent: "center", gap: 8 },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  backdrop:    { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:       { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  handle:      { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
});
