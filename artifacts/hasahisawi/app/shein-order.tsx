/** تفاصيل طلب شي إن: الخط الزمني للمراحل، التكلفة، التتبع، الإيصال */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, copyText, notify, openExternal } from "@/lib/xplatform";
import { NeuRaised } from "@/components/auth/neu";
import ImageLightbox from "@/components/ImageLightbox";
import { ACCENT, CostBreakdown, Empty, Shell, SmallBtn, StatusPill, u } from "@/components/shein/ui";
import { FLOW, sheinApi, SheinEvent, SheinOrder, STATUS_META } from "@/lib/shein-api";

const when = (s?: string) => (s ? new Date(s).toLocaleString("ar-SD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function SheinOrderScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<SheinOrder | null>(null);
  const [events, setEvents] = useState<SheinEvent[]>([]);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    try { const r = await sheinApi.get(token, Number(id)); setOrder(r.order); setEvents(r.events); setErr(""); }
    catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [token, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = async () => {
    if (!order || !token) return;
    if (!(await confirmAction("إلغاء الطلب", "هل تريد إلغاء هذا الطلب؟ إن كنت حوّلت المبلغ سيُعاد إليك بعد المراجعة.", "إلغاء الطلب", true))) return;
    try { await sheinApi.cancel(token, order.id); load(); } catch (e: any) { notify("تعذّر الإلغاء", e?.message); }
  };

  if (!order) {
    return <Shell title={`طلب #${id ?? ""}`} insets={insets}>{err ? <Empty icon="alert-circle-outline" text={err} /> : <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />}</Shell>;
  }
  const d = order.item_details;
  const stepIdx = FLOW.indexOf(order.status);
  const at = (s: string) => events.find(e => e.status === s);

  return (
    <Shell title={`طلب #${order.id}`} sub={d.title || "منتج شي إن"} insets={insets}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}>
        <NeuRaised radius={22} style={u.card}>
          <View style={[u.row, { justifyContent: "space-between" }]}>
            <StatusPill status={order.status} />
            <Text style={u.meta}>{when(order.created_at)}</Text>
          </View>
          {order.status === "cancelled" ? (
            <View style={st.cancelBox}>
              <Ionicons name="close-circle" size={20} color="#B91C1C" />
              <Text style={[u.meta, { color: "#B91C1C", flex: 1 }]}>{order.cancel_reason || "أُلغي الطلب"}</Text>
            </View>
          ) : (
            <View style={{ gap: 0, marginTop: 4 }}>
              {FLOW.map((s, i) => {
                const done = i <= stepIdx, cur = i === stepIdx, ev = at(s), m = STATUS_META[s];
                return (
                  <View key={s} style={st.step} accessible accessibilityLabel={`${m.label}${done ? " — تم" : ""}`}>
                    <View style={{ alignItems: "center", width: 30 }}>
                      <View style={[st.dot, done && { backgroundColor: m.color, borderColor: m.color }, cur && st.dotCur]}>
                        <Ionicons name={done ? (cur ? (m.icon as any) : "checkmark") : (m.icon as any)} size={14} color={done ? "#fff" : Colors.textMuted} />
                      </View>
                      {i < FLOW.length - 1 ? <View style={[st.bar, i < stepIdx && { backgroundColor: STATUS_META[FLOW[i + 1]].color }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={[st.stepTitle, !done && { color: Colors.textMuted }]}>{m.label}</Text>
                      {ev ? <Text style={u.meta}>{when(ev.created_at)}{ev.note ? ` · ${ev.note}` : ""}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {order.tracking_number ? (
            <TouchableOpacity onPress={() => copyText(order.tracking_number!).then(r => r === "copied" && notify("تم نسخ رقم التتبع"))} style={st.track}>
              <Ionicons name="barcode-outline" size={20} color={ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={u.meta}>رقم التتبع{order.carrier ? ` · ${order.carrier}` : ""}</Text>
                <Text style={st.trackNo} selectable>{order.tracking_number}</Text>
              </View>
              <Ionicons name="copy-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
          {order.status === "pending_payment_verification" ? <SmallBtn label="إلغاء الطلب" icon="close-outline" color="#B91C1C" onPress={cancel} /> : null}
        </NeuRaised>

        <NeuRaised radius={22} style={u.card}>
          <Text style={u.section}>المنتج</Text>
          <View style={u.row}>
            {d.image_url ? <TouchableOpacity onPress={() => setZoom(d.image_url!)}><Image source={{ uri: d.image_url }} style={st.img} /></TouchableOpacity> : null}
            <View style={{ flex: 1, gap: 3 }}>
              {[["المقاس", d.size], ["اللون", d.color], ["الكمية", String(d.qty)], ["ملاحظات", d.notes]].filter(([, v]) => v).map(([k, v]) => (
                <Text key={k} style={u.meta}><Text style={{ fontFamily: "Cairo_700Bold", color: Colors.textSecondary }}>{k}: </Text>{v}</Text>
              ))}
            </View>
          </View>
          <SmallBtn label="فتح المنتج في شي إن" icon="open-outline" onPress={() => openExternal(order.product_url)} />
        </NeuRaised>

        <NeuRaised radius={22} style={u.card}>
          <Text style={u.section}>التكلفة</Text>
          <CostBreakdown f={order.financials} />
        </NeuRaised>

        {order.payment_receipt_url ? (
          <NeuRaised radius={22} style={u.card}>
            <Text style={u.section}>إيصال التحويل</Text>
            <TouchableOpacity onPress={() => setZoom(order.payment_receipt_url!)}>
              <Image source={{ uri: order.payment_receipt_url }} style={st.receipt} resizeMode="contain" />
            </TouchableOpacity>
          </NeuRaised>
        ) : null}
        {order.delivery?.address || order.delivery?.phone ? (
          <NeuRaised radius={22} style={u.card}>
            <Text style={u.section}>التسليم</Text>
            {order.delivery.address ? <Text style={u.meta}><Ionicons name="location-outline" size={12} /> {order.delivery.address}</Text> : null}
            {order.delivery.phone ? <Text style={u.meta}><Ionicons name="call-outline" size={12} /> {order.delivery.phone}</Text> : null}
          </NeuRaised>
        ) : null}
      </ScrollView>
      <ImageLightbox uri={zoom} onClose={() => setZoom(null)} title="معاينة" />
    </Shell>
  );
}

const st = StyleSheet.create({
  step: { flexDirection: "row-reverse", gap: 10 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.divider, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  dotCur: { transform: [{ scale: 1.12 }] },
  bar: { width: 2, flex: 1, minHeight: 16, backgroundColor: Colors.divider },
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  cancelBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#FEE2E2", borderRadius: 12, padding: 10 },
  track: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: ACCENT + "10", borderRadius: 14, padding: 12 },
  trackNo: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", letterSpacing: 0.5 },
  img: { width: 86, height: 86, borderRadius: 14, backgroundColor: Colors.divider },
  receipt: { width: "100%", height: 320, borderRadius: 14, backgroundColor: Colors.divider },
});
