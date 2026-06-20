import { readFileSync, writeFileSync } from 'node:fs';

function patch(filePath, transform, label) {
  const file = new URL(filePath, import.meta.url);
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`[transport-live] ${label}`);
  } else {
    console.log(`[transport-live] ${label}: already applied or skipped`);
  }
}

function once(src, from, to) {
  if (src.includes(to)) return src;
  if (!src.includes(from)) return src;
  return src.replace(from, to);
}

patch('../app/_layout.tsx', (src) => {
  src = src.replace(
    'import { I18nManager, Platform, View, LogBox, Text, TextInput } from "react-native";',
    'import { I18nManager, Platform, View, LogBox, Text, TextInput, TouchableOpacity } from "react-native";',
  );
  src = once(
    src,
    '  const unread = useApiUnread(isGuest ? null : (token ?? null));',
    '  const unread = useApiUnread(isGuest ? null : (token ?? null));\n  const [foregroundNotice, setForegroundNotice] = useState<{ title: string; body: string } | null>(null);',
  );
  src = once(
    src,
    '      (_n) => {},',
    `      (n) => {
        setForegroundNotice({ title: n.title || "تنبيه جديد", body: n.body || "" });
        setTimeout(() => setForegroundNotice(null), 5500);
      },`,
  );
  src = once(
    src,
    '  return null;\n}\n\nfunction RootLayoutNav()',
    `  if (!foregroundNotice) return null;
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => setForegroundNotice(null)}
      style={{ position: "absolute", top: Platform.OS === "web" ? 18 : 48, left: 14, right: 14, zIndex: 9999, backgroundColor: "#0B2816", borderRadius: 18, borderWidth: 1, borderColor: "#FBBF24", padding: 14, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, elevation: 10 }}
    >
      <Text style={{ fontFamily: "Cairo_700Bold", color: "#FBBF24", fontSize: 14, textAlign: "right" }}>{foregroundNotice.title}</Text>
      {!!foregroundNotice.body && <Text style={{ fontFamily: "Cairo_400Regular", color: "#fff", fontSize: 12, marginTop: 4, textAlign: "right" }}>{foregroundNotice.body}</Text>}
    </TouchableOpacity>
  );
}

function RootLayoutNav()`,
  );
  return src;
}, 'global in-app notification banner');

patch('../app/(tabs)/transport.tsx', (src) => {
  src = src.replace(
    'import React, { useEffect, useState, useCallback } from "react";',
    'import React, { useEffect, useState, useCallback, useRef } from "react";',
  );
  src = once(
    src,
    'import OrgInviteCard from "@/components/OrgInviteCard";',
    'import OrgInviteCard from "@/components/OrgInviteCard";\nimport { scheduleTransportNotification } from "@/lib/firebase/notifications";',
  );
  src = src.replace(
    'useState<"book" | "drivers" | "mytrips" | "register">("book")',
    'useState<"book" | "drivers" | "driverRequests" | "mytrips" | "register">("book")',
  );
  src = once(
    src,
    '  const [drivers,    setDrivers]    = useState<Driver[]>([]);\n  const [myTrips,    setMyTrips]    = useState<Trip[]>([]);',
    '  const [drivers,    setDrivers]    = useState<Driver[]>([]);\n  const [myTrips,    setMyTrips]    = useState<Trip[]>([]);\n  const [openTrips,  setOpenTrips]  = useState<Trip[]>([]);\n  const [acceptingTripId, setAcceptingTripId] = useState<number | null>(null);\n  const [driverTripNotice, setDriverTripNotice] = useState<string | null>(null);\n  const lastOpenTripsRef = useRef<string>("");',
  );
  src = once(
    src,
    '  const loadMyTrips = useCallback(async () => {\n    if (!token) return;\n    try {\n      const res = await fetchWithTimeout(`${apiUrl}/api/transport/my-trips`, {\n        headers: { Authorization: `Bearer ${token}` },\n      });\n      if (res.ok) setMyTrips(await res.json());\n    } catch {}\n  }, [apiUrl, token]);',
    '  const loadMyTrips = useCallback(async () => {\n    if (!token) return;\n    try {\n      const res = await fetchWithTimeout(`${apiUrl}/api/transport/my-trips`, {\n        headers: { Authorization: `Bearer ${token}` },\n      });\n      if (res.ok) setMyTrips(await res.json());\n    } catch {}\n  }, [apiUrl, token]);\n\n  const loadOpenTrips = useCallback(async (silent = false) => {\n    const endpoints = [`${apiUrl}/api/transport/trips/open`, `${apiUrl}/api/transport/trips?status=pending`, `${apiUrl}/api/transport/driver/trips`];\n    for (const url of endpoints) {\n      try {\n        const res = await fetchWithTimeout(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });\n        if (!res.ok) continue;\n        const json = await res.json();\n        const list = Array.isArray(json) ? json : Array.isArray(json.trips) ? json.trips : [];\n        const pending = list.filter((t: Trip) => ["pending", "waiting", "انتظار"].includes(String(t.status ?? "pending")));\n        const signature = pending.map((t: Trip) => t.id).sort().join(",");\n        setOpenTrips(pending);\n        if (!silent && signature && signature !== lastOpenTripsRef.current) {\n          lastOpenTripsRef.current = signature;\n          setDriverTripNotice(`وصلت ${pending.length} طلبات مشوار بانتظار القبول`);\n          if (Platform.OS !== "web") {\n            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);\n            scheduleTransportNotification({ title: "طلبات مشوار جديدة", body: "توجد طلبات بانتظار السائقين في مشوارك علينا", data: { type: "transport_driver_requests", screen: "transport" } }).catch(() => {});\n          }\n        }\n        return;\n      } catch {}\n    }\n  }, [apiUrl, token]);\n\n  const acceptOpenTrip = useCallback(async (tripId: number) => {\n    setAcceptingTripId(tripId);\n    const endpoints = [\n      { url: `${apiUrl}/api/transport/trips/${tripId}/accept`, method: "POST" },\n      { url: `${apiUrl}/api/transport/driver/trips/${tripId}/accept`, method: "POST" },\n      { url: `${apiUrl}/api/transport/trips/${tripId}`, method: "PATCH" },\n    ];\n    try {\n      for (const ep of endpoints) {\n        const res = await fetchWithTimeout(ep.url, { method: ep.method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: ep.method === "PATCH" ? JSON.stringify({ status: "accepted" }) : JSON.stringify({}) });\n        if (res.ok) {\n          setOpenTrips(prev => prev.filter(t => t.id !== tripId));\n          setDriverTripNotice("تم قبول المشوار بنجاح وسيظهر ضمن رحلاتك");\n          if (Platform.OS !== "web") {\n            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);\n            scheduleTransportNotification({ title: "تم قبول المشوار", body: "تم إسناد الطلب لك بنجاح", data: { type: "transport_trip_accepted", tripId } }).catch(() => {});\n          }\n          loadMyTrips();\n          return;\n        }\n      }\n      Alert.alert("تعذّر القبول", "لم يتمكن الخادم من قبول هذا المشوار الآن.");\n    } catch {\n      Alert.alert("خطأ", "تعذّر الاتصال بالخادم لقبول المشوار");\n    } finally {\n      setAcceptingTripId(null);\n    }\n  }, [apiUrl, token, loadMyTrips]);',
  );
  src = src.replace('if (enabled) { loadDrivers(); loadMyTrips(); }', 'if (enabled) { loadDrivers(); loadMyTrips(); loadOpenTrips(true); }');
  src = src.replace('await Promise.all([loadDrivers(), loadMyTrips(), loadFares()]);', 'await Promise.all([loadDrivers(), loadMyTrips(), loadOpenTrips(true), loadFares()]);');
  src = once(src, '  // تقييم رحلة مكتملة', '  useEffect(() => {\n    if (!enabled) return;\n    const interval = setInterval(() => { loadOpenTrips(false); }, 15000);\n    return () => clearInterval(interval);\n  }, [enabled, loadOpenTrips]);\n\n  // تقييم رحلة مكتملة');
  src = once(src, '    { key: "drivers",  label: "السائقون",   icon: "people-outline"    as const },', '    { key: "drivers",  label: "السائقون",   icon: "people-outline"    as const },\n    { key: "driverRequests", label: "طلبات السائقين", icon: "notifications-outline" as const },');
  src = once(src, '      >\n\n        {/* ──── طلب رحلة / توصيل ──── */}', '      >\n\n        {driverTripNotice && (\n          <TouchableOpacity onPress={() => setDriverTripNotice(null)} activeOpacity={0.9} style={{ marginBottom: 12 }}>\n            <LinearGradient colors={[GREEN + "25", ACCENT2 + "20"]} style={{ borderRadius: 14, padding: 12, borderWidth: 1, borderColor: GREEN + "45", flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>\n              <MaterialCommunityIcons name="bell-ring-outline" size={22} color={ACCENT2} />\n              <Text style={{ flex: 1, color: Colors.text, fontFamily: "Cairo_700Bold", textAlign: "right", fontSize: 13 }}>{driverTripNotice}</Text>\n              <Ionicons name="close" size={16} color={Colors.textMuted} />\n            </LinearGradient>\n          </TouchableOpacity>\n        )}\n\n        {/* ──── طلب رحلة / توصيل ──── */}');
  src = once(src, '        {/* ──── السائقون ──── */}\n        {activeTab === "drivers" && (', '        {/* ───ـ طلبات السائقين ───ـ */}\n        {activeTab === "driverRequests" && (\n          <Animated.View entering={FadeInDown.springify()}>\n            <View style={s.sectionHeader}><LinearGradient colors={[GREEN, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.secBar} /><Text style={s.secTitle}>طلبات بانتظار السائقين</Text></View>\n            <TouchableOpacity onPress={() => loadOpenTrips(false)} activeOpacity={0.85} style={{ marginBottom: 12 }}><LinearGradient colors={["#0D2B17", "#12381F"]} style={{ borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderColor: GREEN + "35" }}><MaterialCommunityIcons name="refresh" size={20} color={GREEN} /><Text style={{ flex: 1, color: "#fff", fontFamily: "Cairo_700Bold", textAlign: "right" }}>تحديث الطلبات المتاحة</Text><View style={{ backgroundColor: ACCENT2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: "#111", fontFamily: "Cairo_700Bold", fontSize: 12 }}>{openTrips.length}</Text></View></LinearGradient></TouchableOpacity>\n            {openTrips.length === 0 ? (<View style={s.emptyCard}><MaterialCommunityIcons name="bell-sleep-outline" size={48} color={Colors.textMuted} /><Text style={s.emptyText}>لا توجد طلبات معلقة الآن</Text><Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", textAlign: "center", marginTop: 6 }}>ستظهر الطلبات هنا لجميع السائقين حتى يقبلها أحدهم.</Text></View>) : openTrips.map(trip => (<View key={trip.id} style={s.formCard}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 10 }}><MaterialCommunityIcons name={trip.trip_type === "delivery" ? "package-variant" : "car-side"} size={24} color={ACCENT} /><View style={{ flex: 1 }}><Text style={{ color: Colors.text, fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" }}>{trip.trip_type === "delivery" ? "طلب توصيل" : "طلب مشوار"}</Text><Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" }}>{trip.user_name} · {trip.vehicle_preference || "مركبة مناسبة"}</Text></View></View><Text style={s.fieldLabel}>من</Text><Text style={{ color: Colors.textSecondary, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginBottom: 8 }}>{trip.from_location}</Text><Text style={s.fieldLabel}>إلى</Text><Text style={{ color: Colors.textSecondary, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginBottom: 8 }}>{trip.to_location}</Text>{!!trip.delivery_desc && <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 8 }}>الشحنة: {trip.delivery_desc}</Text>} {!!trip.notes && <Text style={{ color: Colors.textMuted, fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 8 }}>ملاحظات: {trip.notes}</Text>}<TouchableOpacity onPress={() => acceptOpenTrip(trip.id)} disabled={acceptingTripId === trip.id} activeOpacity={0.85} style={{ borderRadius: 12, overflow: "hidden", marginTop: 6 }}><LinearGradient colors={[GREEN, ACCENT2]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.submitBtn}>{acceptingTripId === trip.id ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="check-decagram" size={18} color="#fff" />}<Text style={s.submitBtnText}>قبول المشوار</Text></LinearGradient></TouchableOpacity></View>))}\n          </Animated.View>\n        )}\n\n        {/* ───ـ السائقون ───ـ */}\n        {activeTab === "drivers" && (');
  return src;
}, 'transport live driver requests');
