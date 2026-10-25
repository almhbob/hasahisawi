import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, RefreshControl, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { foodApi, STATUS_META, ORDER_TYPE_AR, fmtMoney, timeAgo, waLink, type FoodOrder, type OrderStatus } from "@/lib/food-api";

const STEPS: OrderStatus[] = ["new", "accepted", "preparing", "ready", "delivered"];

export default function MyFoodOrders() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [orders, setOrders] = useState<FoodOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setError("سجّل الدخول لعرض طلباتك"); return; }
    try { setError(null); setOrders((await foodApi.myOrders(token)).orders); }
    catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setRefreshing(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // تحديث تلقائي ما دام هناك طلب جارٍ
  useEffect(() => {
    if (!orders?.some((o) => !["delivered", "cancelled"].includes(o.status))) return;
    const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [orders, load]);

  const cancel = (o: FoodOrder) => {
    const go = async () => { try { await foodApi.setOrderStatus(token, o.id, "cancelled"); load(); } catch (e: any) { Alert.alert("تعذّر الإلغاء", e?.message); } };
    if (Platform.OS === "web") { if ((globalThis as any).confirm?.("إلغاء الطلب؟")) go(); return; }
    Alert.alert("إلغاء الطلب", "هل تريد إلغاء هذا الطلب؟", [{ text: "لا", style: "cancel" }, { text: "إلغاء الطلب", style: "destructive", onPress: go }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={22} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.title}>طلباتي من المطاعم</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {error ? (
          <View style={st.empty}><Ionicons name="alert-circle-outline" size={34} color={Colors.textMuted} /><Text style={st.emptyTxt}>{error}</Text>
            {!token ? <TouchableOpacity onPress={() => router.push("/login" as any)} style={st.cta}><Text style={st.ctaTxt}>تسجيل الدخول</Text></TouchableOpacity> : null}</View>
        ) : orders === null ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : orders.length === 0 ? (
          <View style={st.empty}><Ionicons name="receipt-outline" size={38} color={Colors.textMuted} /><Text style={st.emptyTxt}>لم تطلب من أي مطعم بعد</Text>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/restaurants" as any)} style={st.cta}><Text style={st.ctaTxt}>تصفّح المطاعم</Text></TouchableOpacity></View>
        ) : orders.map((o) => {
          const m = STATUS_META[o.status]; const step = STEPS.indexOf(o.status);
          const wa = waLink(o.business_whatsapp || o.business_phone, `بخصوص طلبي رقم ${o.order_number}`);
          return (
            <View key={o.id} style={st.card}>
              <View style={st.row}>
                <Text style={st.biz} numberOfLines={1}>{o.business_name || "مطعم"}</Text>
                <View style={[st.pill, { backgroundColor: m.bg }]}><Ionicons name={m.icon as any} size={13} color={m.color} /><Text style={[st.pillTxt, { color: m.color }]}>{m.label}</Text></View>
              </View>
              <Text style={st.meta}>{o.order_number} · {ORDER_TYPE_AR[o.order_type]} · {timeAgo(o.created_at)}</Text>
              {o.status !== "cancelled" ? (
                <View style={st.track}>
                  {STEPS.map((s, i) => <View key={s} style={[st.seg, { backgroundColor: i <= step ? Colors.primary : "#E3E8E5" }]} />)}
                </View>
              ) : o.cancel_reason ? <Text style={st.meta}>السبب: {o.cancel_reason}</Text> : null}
              <View style={{ gap: 3, marginTop: 6 }}>
                {o.items.map((it, i) => <Text key={i} style={st.item}>{it.qty} × {it.name}</Text>)}
              </View>
              <View style={[st.row, { marginTop: 8 }]}>
                <Text style={st.total}>{fmtMoney(o.total)}</Text>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {o.business_phone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.business_phone}`)} style={st.iconBtn} accessibilityLabel="اتصال بالمطعم"><Ionicons name="call" size={17} color={Colors.primary} /></TouchableOpacity> : null}
                  {wa ? <TouchableOpacity onPress={() => Linking.openURL(wa)} style={st.iconBtn} accessibilityLabel="واتساب المطعم"><Ionicons name="logo-whatsapp" size={18} color="#1FA855" /></TouchableOpacity> : null}
                  {o.status === "new" ? <TouchableOpacity onPress={() => cancel(o)} style={[st.iconBtn, { paddingHorizontal: 12, width: "auto" }]}><Text style={st.cancel}>إلغاء</Text></TouchableOpacity> : null}
                  <TouchableOpacity onPress={() => router.push({ pathname: "/restaurant", params: { id: String(o.business_id) } } as any)} style={[st.iconBtn, { paddingHorizontal: 12, width: "auto" }]}><Text style={st.again}>اطلب مجدداً</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  empty: { alignItems: "center", gap: 10, paddingVertical: 50 },
  emptyTxt: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textMuted, textAlign: "center" },
  cta: { backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10 },
  ctaTxt: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 13.5 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  biz: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  track: { flexDirection: "row-reverse", gap: 4, marginTop: 10 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  item: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  total: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  iconBtn: { height: 36, width: 36, borderRadius: 12, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  cancel: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#B3261E" },
  again: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary },
});
