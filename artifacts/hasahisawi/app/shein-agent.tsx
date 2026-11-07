/**
 * لوحات فريق شي إن:
 *  • مدقق الدفع: مراجعة الإيصالات ← تأكيد (يُسند لوكيل السعودية تلقائياً) أو رفض بسبب.
 *  • وكيل السعودية: الطلبات المسندة ← «تم الشراء» ← تجميعها في طرد برقم بوليصة/تتبع ← «شُحن إلى السودان».
 *  • وكيل الحصاحيصا: استلام الطرود ← التواصل مع العميل والملاحة ← «تم التسليم».
 */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify, openExternal } from "@/lib/xplatform";
import { NeuButton, NeuField, NeuRaised } from "@/components/auth/neu";
import ImageLightbox from "@/components/ImageLightbox";
import { ACCENT, Empty, OrderCard, Shell, SmallBtn, u } from "@/components/shein/ui";
import { fmt, ROLE_LABEL, sheinApi, SheinOrder, SheinPackage, SheinRole } from "@/lib/shein-api";

export default function SheinAgentScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const [roles, setRoles] = useState<SheinRole[]>([]);
  const [role, setRole] = useState<SheinRole>((params.role as SheinRole) || "verifier");
  const [ready, setReady] = useState(false);

  useFocusEffect(useCallback(() => {
    sheinApi.config(token).then(c => {
      const rs: SheinRole[] = c.is_admin ? ["verifier", "saudi", "hasahisa"] : c.roles;
      setRoles(rs);
      if (rs.length && !rs.includes(role)) setRole(rs[0]);
    }).catch(() => {}).finally(() => setReady(true));
  }, [token]));

  return (
    <Shell title={`لوحة ${ROLE_LABEL[role]}`} sub="طلبات شي إن" insets={insets}>
      {!ready ? <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /> : !roles.length || !token ? (
        <Empty icon="lock-closed-outline" text="هذه اللوحة لفريق شي إن فقط — تطلب الإضافة من إدارة التطبيق" />
      ) : (
        <>
          {roles.length > 1 && (
            <View style={st.tabs}>
              {roles.map(r => (
                <TouchableOpacity key={r} onPress={() => setRole(r)} style={[st.tab, role === r && st.tabOn]}>
                  <Text style={[st.tabText, role === r && { color: "#fff" }]}>{ROLE_LABEL[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {role === "verifier" ? <Verifier token={token} /> : role === "saudi" ? <Saudi token={token} /> : <Hasahisa token={token} />}
        </>
      )}
    </Shell>
  );
}

function useList<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(async () => { try { setData(await fn()); } catch (e: any) { notify("تعذّر التحميل", e?.message); } }, [fn]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, load };
}
const Scroll = ({ onRefresh, children }: { onRefresh: () => void; children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={ACCENT} />}>{children}</ScrollView>
  );
};

// ── مدقق الدفع ──────────────────────────────────────────
function Verifier({ token }: { token: string }) {
  const fn = useCallback(() => sheinApi.verifyQueue(token), [token]);
  const { data, load } = useList(fn);
  const [zoom, setZoom] = useState<string | null>(null);
  const [reject, setReject] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const act = async (o: SheinOrder, approve: boolean) => {
    const note = reject[o.id]?.trim();
    if (!approve && !note) { setReject(r => ({ ...r, [o.id]: r[o.id] ?? "" })); return notify("اكتب سبب الرفض", "سيظهر السبب للعميل."); }
    if (approve && !(await confirmAction("تأكيد الدفع", `هل وصل مبلغ ${fmt(o.financials.total_sdg)} ج.س فعلاً؟`, "تأكيد"))) return;
    setBusy(o.id);
    try { await sheinApi.verify(token, o.id, approve, note); await load(); } catch (e: any) { notify("خطأ", e?.message); }
    finally { setBusy(null); }
  };
  if (!data) return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;
  return (
    <Scroll onRefresh={load}>
      <Text style={u.section}>إيصالات بانتظار المراجعة ({data.orders.length})</Text>
      {data.orders.length === 0 ? <Empty icon="checkmark-done-outline" text="لا توجد إيصالات معلقة" /> : data.orders.map(o => (
        <OrderCard key={o.id} o={o} showCustomer footer={
          <View style={{ gap: 8 }}>
            <View style={u.row}>
              {o.payment_receipt_url ? (
                <TouchableOpacity onPress={() => setZoom(o.payment_receipt_url!)} accessibilityLabel="تكبير الإيصال">
                  <Image source={{ uri: o.payment_receipt_url }} style={st.receipt} />
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={st.amount}>{fmt(o.financials.total_sdg)} ج.س</Text>
                <Text style={u.meta}>{fmt(o.financials.total_sar, 2)} ر.س · صرف {fmt(o.financials.sar_to_sdg, 2)}</Text>
                {o.customer_phone ? <Text style={u.meta}>{o.customer_phone}</Text> : null}
              </View>
            </View>
            {reject[o.id] !== undefined ? (
              <TextInput value={reject[o.id]} onChangeText={t => setReject(r => ({ ...r, [o.id]: t }))} placeholder="سبب الرفض (مثلاً: المبلغ ناقص، الإيصال غير واضح)"
                placeholderTextColor={Colors.textMuted} style={st.input} />
            ) : null}
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <SmallBtn label="تأكيد الدفع" icon="checkmark-circle" filled onPress={() => act(o, true)} disabled={busy === o.id} />
              <SmallBtn label={reject[o.id] !== undefined ? "إرسال الرفض" : "رفض"} icon="close-circle-outline" color="#B42323" onPress={() => act(o, false)} disabled={busy === o.id} />
            </View>
          </View>
        } />
      ))}
      <ImageLightbox uri={zoom} onClose={() => setZoom(null)} title="إيصال التحويل" />
    </Scroll>
  );
}

// ── وكيل السعودية ───────────────────────────────────────
function Saudi({ token }: { token: string }) {
  const fn = useCallback(() => sheinApi.saudi(token), [token]);
  const { data, load } = useList(fn);
  const [sel, setSel] = useState<number[]>([]);
  const [orderNo, setOrderNo] = useState<Record<number, string>>({});
  const [tracking, setTracking] = useState("");
  const [waybill, setWaybill] = useState("");
  const [carrier, setCarrier] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;
  const toBuy = data.orders.filter(o => o.status === "paid_and_processing");
  const bought = data.orders.filter(o => o.status === "purchased_saudi" && !o.package_id);
  const run = async (f: () => Promise<unknown>) => { try { await f(); await load(); } catch (e: any) { notify("خطأ", e?.message); } };
  const ship = async () => {
    if (!sel.length) return notify("اختر الطلبات", "حدّد الطلبات التي ستُشحن في هذا الطرد.");
    if (!tracking.trim() && !waybill.trim()) return notify("رقم الشحنة", "أدخل رقم التتبع أو البوليصة.");
    setBusy(true);
    try {
      const r = await sheinApi.createPackage(token, { order_ids: sel, tracking_number: tracking.trim(), waybill: waybill.trim(), carrier: carrier.trim() });
      notify("تم الشحن ✓", `طرد #${r.package.id} يضم ${r.orders} طلب — أُبلغ العملاء ووكيل الحصاحيصا.`);
      setSel([]); setTracking(""); setWaybill(""); setCarrier(""); await load();
    } catch (e: any) { notify("تعذّر إنشاء الطرد", e?.message); } finally { setBusy(false); }
  };
  return (
    <Scroll onRefresh={load}>
      <Text style={u.section}>للشراء ({toBuy.length})</Text>
      {toBuy.length === 0 ? <Empty icon="bag-check-outline" text="لا توجد طلبات بانتظار الشراء" /> : toBuy.map(o => (
        <OrderCard key={o.id} o={o} showCustomer onPress={() => openExternal(o.product_url)} footer={
          o.saudi_agent_id == null ? <SmallBtn label="استلام الطلب" icon="hand-left-outline" filled onPress={() => run(() => sheinApi.claim(token, o.id))} /> : (
            <View style={{ gap: 8 }}>
              <TextInput value={orderNo[o.id] ?? ""} onChangeText={t => setOrderNo(m => ({ ...m, [o.id]: t }))} placeholder="رقم طلب شي إن (اختياري)" placeholderTextColor={Colors.textMuted} style={st.input} autoCapitalize="characters" />
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <SmallBtn label="فتح المنتج" icon="open-outline" onPress={() => openExternal(o.product_url)} />
                <SmallBtn label="تم الشراء" icon="bag-check" filled onPress={() => run(() => sheinApi.purchased(token, o.id, orderNo[o.id]))} />
              </View>
            </View>
          )
        } />
      ))}

      <Text style={[u.section, { marginTop: 8 }]}>جاهزة للشحن ({bought.length})</Text>
      {bought.length === 0 ? <Empty icon="cube-outline" text="لا توجد طلبات مشتراة بانتظار الشحن" /> : (
        <NeuRaised radius={20} style={u.card}>
          {bought.map(o => {
            const on = sel.includes(o.id);
            return (
              <TouchableOpacity key={o.id} onPress={() => setSel(s => (on ? s.filter(x => x !== o.id) : [...s, o.id]))} style={st.pick} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? ACCENT : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={st.pickTitle}>#{o.id} · {o.item_details.title || "منتج"} × {o.item_details.qty}</Text>
                  <Text style={u.meta}>{o.customer_name}{o.shein_order_no ? ` · ${o.shein_order_no}` : ""}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setSel(sel.length === bought.length ? [] : bought.map(o => o.id))}>
            <Text style={[u.meta, { color: ACCENT }]}>{sel.length === bought.length ? "إلغاء التحديد" : "تحديد الكل"}</Text>
          </TouchableOpacity>
          <NeuField label="رقم التتبع" icon="barcode-outline" value={tracking} onChangeText={setTracking} autoCapitalize="characters" />
          <NeuField label="رقم البوليصة (Waybill)" icon="document-text-outline" value={waybill} onChangeText={setWaybill} autoCapitalize="characters" />
          <NeuField label="شركة الشحن (اختياري)" icon="airplane-outline" value={carrier} onChangeText={setCarrier} placeholder="مثال: أرامكس" />
          <NeuButton label={`تجميع ${sel.length || ""} في طرد وشحنه إلى السودان`} icon="airplane" onPress={ship} loading={busy} disabled={!sel.length} />
        </NeuRaised>
      )}

      {data.packages.length > 0 && <Text style={[u.section, { marginTop: 8 }]}>الطرود المرسلة</Text>}
      {data.packages.map(p => <PackageRow key={p.id} p={p} />)}
    </Scroll>
  );
}

function PackageRow({ p, action }: { p: SheinPackage; action?: React.ReactNode }) {
  return (
    <NeuRaised radius={18} depth={5} style={{ padding: 12, gap: 6 }}>
      <View style={[u.row, { justifyContent: "space-between" }]}>
        <Text style={st.pickTitle}><Ionicons name="cube" size={14} color={ACCENT} /> طرد #{p.id} · {p.orders} طلب</Text>
        <Text style={[u.meta, { color: p.status === "received" ? "#006B4A" : "#006B4A" }]}>{p.status === "received" ? "وصل الحصاحيصا" : "في الطريق"}</Text>
      </View>
      <Text style={u.meta}>تتبع: {p.tracking_number || "—"}{p.waybill ? ` · بوليصة ${p.waybill}` : ""}{p.carrier ? ` · ${p.carrier}` : ""}</Text>
      <Text style={u.meta}>شُحن {new Date(p.shipped_at).toLocaleDateString("ar-SD")}{p.saudi_agent_name ? ` · ${p.saudi_agent_name}` : ""}</Text>
      {action}
    </NeuRaised>
  );
}

// ── وكيل الحصاحيصا ──────────────────────────────────────
function Hasahisa({ token }: { token: string }) {
  const fn = useCallback(() => sheinApi.hasahisa(token), [token]);
  const { data, load } = useList(fn);
  if (!data) return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;
  const run = async (f: () => Promise<unknown>, msg?: string) => { try { await f(); if (msg) notify(msg); await load(); } catch (e: any) { notify("خطأ", e?.message); } };
  const wa = (p: string) => { const d = p.replace(/\D/g, ""); return `https://wa.me/${d.startsWith("0") ? "249" + d.slice(1) : d}`; };
  const nav = (o: SheinOrder) => {
    const { lat, lng, address } = o.delivery || {};
    openExternal(lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address || ""} الحصاحيصا`)}`);
  };
  return (
    <Scroll onRefresh={load}>
      <Text style={u.section}>طرود قادمة ({data.packages.length})</Text>
      {data.packages.length === 0 ? <Empty icon="airplane-outline" text="لا توجد طرود في الطريق" /> : data.packages.map(p => (
        <PackageRow key={p.id} p={p} action={
          <SmallBtn label="استلام الطرد في الحصاحيصا" icon="download-outline" filled
            onPress={async () => { if (await confirmAction("استلام الطرد", `تأكيد وصول طرد #${p.id} (${p.orders} طلب)؟ سيُبلغ العملاء.`, "استلام")) run(() => sheinApi.receive(token, p.id), "تم الاستلام ✓"); }} />
        } />
      ))}

      <Text style={[u.section, { marginTop: 8 }]}>بانتظار التسليم ({data.orders.length})</Text>
      {data.orders.length === 0 ? <Empty icon="bicycle-outline" text="لا توجد طلبات بانتظار التسليم" /> : data.orders.map(o => (
        <OrderCard key={o.id} o={o} showCustomer footer={
          <View style={{ gap: 8 }}>
            <View style={st.contact}>
              <Ionicons name="person-circle-outline" size={22} color={ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={st.pickTitle}>{o.delivery?.name || o.customer_name}</Text>
                <Text style={u.meta}>{o.delivery?.phone || o.customer_phone}{o.delivery?.address ? ` · ${o.delivery.address}` : ""}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
              {(o.delivery?.phone || o.customer_phone) ? <SmallBtn label="اتصال" icon="call" onPress={() => Linking.openURL(`tel:${o.delivery?.phone || o.customer_phone}`)} /> : null}
              {(o.delivery?.phone || o.customer_phone) ? <SmallBtn label="واتساب" icon="logo-whatsapp" color="#00966A" onPress={() => openExternal(wa(String(o.delivery?.phone || o.customer_phone)))} /> : null}
              <SmallBtn label="الملاحة" icon="navigate" color="#006B4A" onPress={() => nav(o)} />
            </View>
            <SmallBtn label="تم التسليم" icon="checkmark-done" filled
              onPress={async () => { if (await confirmAction("تأكيد التسليم", `تسليم طلب #${o.id} للعميل؟`, "تم التسليم")) run(() => sheinApi.delivered(token, o.id), "تم التسليم ✓"); }} />
          </View>
        } />
      ))}
      {data.delivered.length > 0 && <Text style={[u.section, { marginTop: 8 }]}>سُلّمت مؤخراً</Text>}
      {data.delivered.map(o => <OrderCard key={o.id} o={o} showCustomer />)}
    </Scroll>
  );
}

const st = StyleSheet.create({
  tabs: { flexDirection: "row-reverse", gap: 6, marginHorizontal: 16, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 5, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  tabOn: { backgroundColor: ACCENT },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  receipt: { width: 70, height: 100, borderRadius: 10, backgroundColor: Colors.divider },
  amount: { fontFamily: "Cairo_700Bold", fontSize: 18, color: ACCENT, textAlign: "right" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, textAlign: "right", borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.cardBg },
  pick: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  contact: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: ACCENT + "0D", borderRadius: 12, padding: 10 },
});
