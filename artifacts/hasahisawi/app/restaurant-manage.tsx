import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Modal, Pressable, TextInput, Platform, Alert, Share, Switch, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import BizLogo from "@/components/food/BizLogo";
import BusinessFormModal from "@/components/food/BusinessFormModal";
import ProductFormModal from "@/components/food/ProductFormModal";
import {
  foodApi, CAT_META, STATUS_META, NEXT_STATUS, ORDER_TYPE_AR, fmtMoney, productImage, timeAgo, waLink,
  type FoodBusiness, type FoodProduct, type FoodOrder, type FoodInvoice, type FoodReport,
} from "@/lib/food-api";

type Tab = "orders" | "menu" | "pos" | "reports";
const PAY: { k: string; l: string }[] = [{ k: "cash", l: "كاش" }, { k: "bankak", l: "بنكك" }, { k: "transfer", l: "تحويل" }];

function notify(t: string, m?: string) { if (Platform.OS === "web") (globalThis as any).alert?.(m ? `${t}\n${m}` : t); else Alert.alert(t, m); }
function receiptText(b: FoodBusiness, inv: FoodInvoice) {
  const lines = inv.items.map((i) => `${i.qty} × ${i.name} — ${fmtMoney(i.price * i.qty)}`).join("\n");
  return `${b.name}\nفاتورة ${inv.invoice_number}\n${new Date(inv.issued_at).toLocaleString("ar-EG")}\n────────\n${lines}\n────────\n${inv.discount ? `الخصم: ${fmtMoney(inv.discount)}\n` : ""}الإجمالي: ${fmtMoney(inv.total)}\nالمدفوع: ${fmtMoney(inv.paid_amount)}${inv.change_amount ? `\nالباقي: ${fmtMoney(inv.change_amount)}` : ""}\nشكراً لزيارتكم 🌿`;
}

export default function RestaurantManage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [biz, setBiz] = useState<FoodBusiness | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [scope, setScope] = useState<"active" | "done">("active");
  const [refreshing, setRefreshing] = useState(false);
  const [editBiz, setEditBiz] = useState(false);
  const [prodModal, setProdModal] = useState<{ open: boolean; p?: FoodProduct | null }>({ open: false });
  const [report, setReport] = useState<FoodReport | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [invoices, setInvoices] = useState<FoodInvoice[]>([]);
  // POS
  const [cart, setCart] = useState<Record<number, number>>({});
  const [discount, setDiscount] = useState(""); const [paid, setPaid] = useState(""); const [pay, setPay] = useState("cash");
  const [receipt, setReceipt] = useState<FoodInvoice | null>(null); const [issuing, setIssuing] = useState(false);

  const loadBiz = useCallback(async () => {
    try {
      const r = await foodApi.business(String(id), token);
      if (!r.can_manage) { setError("هذه اللوحة لصاحب المطعم فقط"); return; }
      setBiz(r.business); setProducts(r.products); setCanModerate(r.can_moderate);
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  const loadOrders = useCallback(async () => {
    if (!id) return;
    try { setOrders((await foodApi.orders(token, Number(id), scope)).orders); } catch {}
    finally { setRefreshing(false); }
  }, [id, token, scope]);
  const loadReport = useCallback(async (p = period) => {
    try { const [r, i] = await Promise.all([foodApi.report(token, Number(id), p), foodApi.invoices(token, Number(id))]); setReport(r); setInvoices(i.invoices); } catch (e: any) { notify("تعذّر تحميل التقرير", e?.message); }
  }, [id, token, period]);

  useEffect(() => { loadBiz(); }, [loadBiz]);
  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { if (tab !== "orders") return; const t = setInterval(loadOrders, 15000); return () => clearInterval(t); }, [tab, loadOrders]);
  useEffect(() => { if (tab === "reports") loadReport(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const posLines = useMemo(() => Object.entries(cart).map(([pid, q]) => ({ p: products.find((x) => x.id === Number(pid))!, q })).filter((l) => l.p), [cart, products]);
  const posSub = posLines.reduce((s, l) => s + l.p.price * l.q, 0);
  const posDisc = Math.min(posSub, Number(discount || 0));
  const posTotal = posSub - posDisc;
  const posChange = paid ? Math.max(0, Number(paid) - posTotal) : 0;

  if (error) return (
    <View style={[st.center, { paddingTop: insets.top }]}><Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} /><Text style={st.muted}>{error}</Text>
      <TouchableOpacity onPress={() => router.back()} style={st.ghost}><Text style={st.ghostTxt}>رجوع</Text></TouchableOpacity></View>
  );
  if (!biz) return <View style={st.center}><ActivityIndicator color={Colors.primary} /></View>;

  const newCount = orders.filter((o) => o.status === "new").length;

  const move = async (o: FoodOrder, to: FoodOrder["status"]) => {
    try { const r = await foodApi.setOrderStatus(token, o.id, to); setOrders((p) => p.map((x) => x.id === o.id ? r.order : x)); }
    catch (e: any) { notify("تعذّر التحديث", e?.message); }
  };
  const reject = (o: FoodOrder) => {
    const go = () => move(o, "cancelled");
    if (Platform.OS === "web") { if ((globalThis as any).confirm?.("رفض/إلغاء الطلب؟")) go(); return; }
    Alert.alert("إلغاء الطلب", "سيصل العميل إشعار بالإلغاء.", [{ text: "رجوع", style: "cancel" }, { text: "إلغاء الطلب", style: "destructive", onPress: go }]);
  };
  const invoiceFromOrder = async (o: FoodOrder) => {
    try { const r = await foodApi.invoice(token, { business_id: biz.id, order_id: o.id, payment_method: "cash" }); setReceipt(r.invoice); }
    catch (e: any) { notify("تعذّر إصدار الفاتورة", e?.message); }
  };
  const toggleOpen = async (v: boolean) => {
    setBiz({ ...biz, accepting_orders: v });
    try { await foodApi.updateBusiness(token, biz.id, { accepting_orders: v }); } catch (e: any) { setBiz({ ...biz, accepting_orders: !v }); notify("تعذّر الحفظ", e?.message); }
  };
  const toggleAvail = async (p: FoodProduct) => {
    setProducts((l) => l.map((x) => x.id === p.id ? { ...x, is_available: !p.is_available } : x));
    try { await foodApi.updateProduct(token, p.id, { is_available: !p.is_available }); } catch (e: any) { loadBiz(); notify("تعذّر الحفظ", e?.message); }
  };
  const issue = async () => {
    if (!posLines.length) return;
    if (paid && Number(paid) < posTotal) return notify("المبلغ المدفوع أقل من الإجمالي");
    setIssuing(true);
    try {
      const r = await foodApi.invoice(token, { business_id: biz.id, items: posLines.map((l) => ({ id: l.p.id, qty: l.q })), discount: posDisc, paid_amount: paid ? Number(paid) : undefined, payment_method: pay });
      setReceipt(r.invoice); setCart({}); setDiscount(""); setPaid("");
      loadBiz();
    } catch (e: any) { notify("تعذّر إصدار الفاتورة", e?.message); } finally { setIssuing(false); }
  };
  const moderate = async (status: "approved" | "rejected") => {
    try { await foodApi.updateBusiness(token, biz.id, { status }); loadBiz(); notify(status === "approved" ? "تم اعتماد المطعم" : "تم رفض المطعم"); } catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };

  const tabs: [Tab, string, any][] = [["orders", `الطلبات${newCount ? ` (${newCount})` : ""}`, "notifications-outline"], ["menu", "المنيو", "restaurant-outline"], ["pos", "الكاشير", "calculator-outline"], ["reports", "التقارير", "bar-chart-outline"]];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.header, { paddingTop: insets.top + 6 }]}>
        <View style={st.headRow}>
          <TouchableOpacity onPress={() => router.back()} style={st.back} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={22} color={Colors.textPrimary} /></TouchableOpacity>
          <BizLogo b={biz} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1}>{biz.name}</Text>
            <Text style={st.muted}>{biz.status === "approved" ? "لوحة المطعم" : biz.status === "pending" ? "قيد مراجعة الإدارة" : "مرفوض"}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push({ pathname: "/restaurant", params: { id: String(biz.id) } } as any)} style={st.iconBtn} accessibilityLabel="معاينة صفحة المطعم"><Ionicons name="eye-outline" size={19} color={Colors.textPrimary} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setEditBiz(true)} style={st.iconBtn} accessibilityLabel="إعدادات المطعم"><Ionicons name="settings-outline" size={19} color={Colors.textPrimary} /></TouchableOpacity>
        </View>
        <View style={st.openRow}>
          <Switch value={biz.accepting_orders} onValueChange={toggleOpen} trackColor={{ true: Colors.primary + "88", false: Colors.divider }} thumbColor={biz.accepting_orders ? Colors.primary : "#fff"} />
          <Text style={[st.openTxt, { color: biz.accepting_orders ? Colors.primaryDeep : Colors.textMuted }]}>{biz.accepting_orders ? "مفتوح — يستقبل الطلبات" : "مغلق — لا يستقبل طلبات"}</Text>
        </View>
        {canModerate && biz.status !== "approved" ? (
          <View style={st.modRow}>
            <TouchableOpacity onPress={() => moderate("approved")} style={[st.modBtn, { backgroundColor: Colors.primarySoft }]}><Text style={[st.modTxt, { color: "#0B7A4E" }]}>اعتماد ونشر</Text></TouchableOpacity>
            {biz.status === "pending" ? <TouchableOpacity onPress={() => moderate("rejected")} style={st.modBtn}><Text style={[st.modTxt, { color: "#B3261E" }]}>رفض</Text></TouchableOpacity> : null}
          </View>
        ) : null}
        <View style={st.tabs}>
          {tabs.map(([k, l, ic]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]}>
              <Ionicons name={ic} size={15} color={tab === k ? "#fff" : Colors.textSecondary} />
              <Text style={[st.tabTxt, tab === k && { color: "#fff" }]} numberOfLines={1}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: tab === "pos" && posLines.length ? 300 : 60 }}
        refreshControl={tab === "orders" ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={Colors.primary} /> : undefined}>

        {tab === "orders" ? (<>
          <View style={st.seg}>
            {(["active", "done"] as const).map((k) => (
              <TouchableOpacity key={k} onPress={() => setScope(k)} style={[st.segBtn, scope === k && st.segOn]}><Text style={[st.segTxt, scope === k && { color: Colors.primaryDeep }]}>{k === "active" ? "الجارية" : "المنتهية"}</Text></TouchableOpacity>
            ))}
          </View>
          {biz.status !== "approved" ? <Text style={st.info}>ستصلك الطلبات هنا بعد اعتماد المطعم. جهّز المنيو الآن.</Text> : null}
          {orders.length === 0 ? <Text style={st.empty}>{scope === "active" ? "لا توجد طلبات جارية — تُحدَّث القائمة تلقائياً" : "لا توجد طلبات منتهية"}</Text> : orders.map((o) => {
            const m = STATUS_META[o.status]; const next = NEXT_STATUS[o.status];
            const wa = waLink(o.customer_phone, `مرحباً، بخصوص طلبك ${o.order_number} من ${biz.name}`);
            return (
              <View key={o.id} style={[st.order, o.status === "new" && { borderColor: "#F2B8B5", borderWidth: 1.5 }]}>
                <View style={st.rowBetween}>
                  <View style={[st.pill, { backgroundColor: m.bg }]}><Ionicons name={m.icon as any} size={13} color={m.color} /><Text style={[st.pillTxt, { color: m.color }]}>{m.label}</Text></View>
                  <Text style={st.muted}>{timeAgo(o.created_at)} · {o.order_number}</Text>
                </View>
                <View style={[st.rowBetween, { marginTop: 8 }]}>
                  <Text style={st.cust}>{o.customer_name || "عميل"}</Text>
                  <Text style={st.typeTag}>{ORDER_TYPE_AR[o.order_type]}</Text>
                </View>
                {o.delivery_address ? <Text style={st.addr}><Ionicons name="location-outline" size={13} color={Colors.textMuted} /> {o.delivery_address}</Text> : null}
                <View style={st.items}>
                  {o.items.map((it, i) => <View key={i} style={st.rowBetween}><Text style={st.itemTxt}>{it.qty} × {it.name}</Text><Text style={st.itemTxt}>{fmtMoney(it.price * it.qty)}</Text></View>)}
                  {o.delivery_fee ? <View style={st.rowBetween}><Text style={st.itemMuted}>التوصيل</Text><Text style={st.itemMuted}>{fmtMoney(o.delivery_fee)}</Text></View> : null}
                  <View style={[st.rowBetween, { marginTop: 4 }]}><Text style={st.totalLbl}>الإجمالي</Text><Text style={st.total}>{fmtMoney(o.total)}</Text></View>
                </View>
                {o.notes ? <Text style={st.notes}>📝 {o.notes}</Text> : null}
                <View style={st.orderActions}>
                  {next ? <TouchableOpacity onPress={() => move(o, next.to)} style={[st.nextBtn, o.status === "new" && { backgroundColor: "#0E9C64" }]}><Text style={st.nextTxt}>{next.label}</Text></TouchableOpacity> : null}
                  {o.customer_phone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.customer_phone}`)} style={st.sqBtn} accessibilityLabel="اتصال بالعميل"><Ionicons name="call" size={17} color={Colors.primary} /></TouchableOpacity> : null}
                  {wa ? <TouchableOpacity onPress={() => Linking.openURL(wa)} style={st.sqBtn} accessibilityLabel="واتساب العميل"><Ionicons name="logo-whatsapp" size={18} color="#1FA855" /></TouchableOpacity> : null}
                  {o.status === "delivered" ? <TouchableOpacity onPress={() => invoiceFromOrder(o)} style={st.sqBtn} accessibilityLabel="فاتورة"><Ionicons name="receipt-outline" size={17} color={Colors.textPrimary} /></TouchableOpacity> : null}
                  {["new", "accepted", "preparing"].includes(o.status) ? <TouchableOpacity onPress={() => reject(o)} style={st.sqBtn} accessibilityLabel="إلغاء الطلب"><Ionicons name="close" size={18} color="#B3261E" /></TouchableOpacity> : null}
                </View>
              </View>
            );
          })}
        </>) : null}

        {tab === "menu" ? (<>
          <TouchableOpacity onPress={() => setProdModal({ open: true, p: null })} style={st.addProd}><Ionicons name="add-circle" size={20} color="#fff" /><Text style={st.addProdTxt}>إضافة صنف</Text></TouchableOpacity>
          {products.length === 0 ? <Text style={st.empty}>المنيو فارغ — أضف أصنافك بالصور والأسعار</Text> : products.map((p) => {
            const img = productImage(p);
            return (
              <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => setProdModal({ open: true, p })} style={[st.prod, !p.is_available && { opacity: 0.55 }]}>
                {img ? <Image source={{ uri: img }} style={st.prodImg} /> : <View style={[st.prodImg, { backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center" }]}><MaterialCommunityIcons name={CAT_META[p.category]?.icon as any || "food"} size={24} color={Colors.primary} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.prodName} numberOfLines={1}>{p.name}</Text>
                  <Text style={st.muted}>{CAT_META[p.category]?.label} · {fmtMoney(p.price)}{p.stock != null ? ` · متبقٍ ${p.stock}` : ""}</Text>
                </View>
                <Switch value={p.is_available} onValueChange={() => toggleAvail(p)} trackColor={{ true: Colors.primary + "88", false: Colors.divider }} thumbColor={p.is_available ? Colors.primary : "#fff"} />
              </TouchableOpacity>
            );
          })}
        </>) : null}

        {tab === "pos" ? (<>
          <Text style={st.info}>للطلبات داخل المحل: اضغط الأصناف، ثم أصدر الفاتورة.</Text>
          <View style={st.posGrid}>
            {products.filter((p) => p.is_available).map((p) => {
              const q = cart[p.id] || 0;
              return (
                <TouchableOpacity key={p.id} onPress={() => setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }))} style={[st.posItem, q > 0 && { borderColor: Colors.primary, backgroundColor: "#F0F8F3" }]}>
                  {q ? <View style={st.posBadge}><Text style={st.posBadgeTxt}>{q}</Text></View> : null}
                  <Text style={st.posName} numberOfLines={2}>{p.name}</Text>
                  <Text style={st.posPrice}>{fmtMoney(p.price)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {products.length === 0 ? <Text style={st.empty}>أضف أصنافاً من تبويب المنيو أولاً</Text> : null}
        </>) : null}

        {tab === "reports" ? (<>
          <View style={st.seg}>
            {(["day", "week", "month", "year"] as const).map((k) => (
              <TouchableOpacity key={k} onPress={() => { setPeriod(k); loadReport(k); }} style={[st.segBtn, period === k && st.segOn]}><Text style={[st.segTxt, period === k && { color: Colors.primaryDeep }]}>{k === "day" ? "اليوم" : k === "week" ? "7 أيام" : k === "month" ? "الشهر" : "السنة"}</Text></TouchableOpacity>
            ))}
          </View>
          {!report ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} /> : (<>
            <View style={st.kpis}>
              <View style={[st.kpi, { backgroundColor: Colors.primary }]}><Text style={[st.kpiVal, { color: "#fff" }]}>{fmtMoney(report.summary.sales_total)}</Text><Text style={[st.kpiLbl, { color: Colors.primarySoft }]}>المبيعات</Text></View>
              <View style={st.kpi}><Text style={st.kpiVal}>{report.summary.invoice_count}</Text><Text style={st.kpiLbl}>فاتورة</Text></View>
            </View>
            <View style={st.kpis}>
              <View style={st.kpi}><Text style={st.kpiVal}>{fmtMoney(report.summary.avg_ticket)}</Text><Text style={st.kpiLbl}>متوسط الفاتورة</Text></View>
              <View style={st.kpi}><Text style={[st.kpiVal, { color: report.summary.profit >= 0 ? "#0B7A4E" : "#B3261E" }]}>{report.summary.cost_total ? fmtMoney(report.summary.profit) : "—"}</Text><Text style={st.kpiLbl}>الربح التقديري</Text></View>
            </View>
            {Object.keys(report.orders_by_status).length ? (
              <View style={st.card}>
                <Text style={st.cardTitle}>طلبات التطبيق</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                  {Object.entries(report.orders_by_status).map(([k, n]) => <View key={k} style={[st.pill, { backgroundColor: STATUS_META[k as keyof typeof STATUS_META]?.bg || "#eee" }]}><Text style={[st.pillTxt, { color: STATUS_META[k as keyof typeof STATUS_META]?.color }]}>{STATUS_META[k as keyof typeof STATUS_META]?.label}: {n}</Text></View>)}
                </View>
              </View>
            ) : null}
            <View style={st.card}>
              <Text style={st.cardTitle}>الأكثر مبيعاً</Text>
              {report.top_products.length === 0 ? <Text style={st.muted}>لا مبيعات في هذه الفترة</Text> : report.top_products.map((t, i) => {
                const max = report.top_products[0].total || 1;
                return (
                  <View key={t.name} style={{ marginBottom: 8 }}>
                    <View style={st.rowBetween}><Text style={st.itemTxt}>{i + 1}. {t.name} <Text style={st.itemMuted}>× {t.qty}</Text></Text><Text style={st.itemTxt}>{fmtMoney(t.total)}</Text></View>
                    <View style={st.barBg}><View style={[st.bar, { width: `${Math.max(4, (t.total / max) * 100)}%` }]} /></View>
                  </View>
                );
              })}
            </View>
            <View style={st.card}>
              <Text style={st.cardTitle}>آخر الفواتير</Text>
              {invoices.length === 0 ? <Text style={st.muted}>لا توجد فواتير بعد</Text> : invoices.slice(0, 30).map((inv) => (
                <TouchableOpacity key={inv.id} onPress={() => setReceipt(inv)} style={st.invRow}>
                  <Text style={st.itemTxt}>{fmtMoney(inv.total)}</Text>
                  <Text style={st.itemMuted}>{inv.invoice_number} · {timeAgo(inv.issued_at)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>)}
        </>) : null}
      </ScrollView>

      {tab === "pos" && posLines.length ? (
        <View style={[st.posBar, { paddingBottom: insets.bottom + 10 }]}>
          <ScrollView style={{ maxHeight: 110 }}>
            {posLines.map((l) => (
              <View key={l.p.id} style={st.posLine}>
                <TouchableOpacity onPress={() => setCart((c) => { const n = { ...c }; if ((n[l.p.id] || 0) > 1) n[l.p.id]--; else delete n[l.p.id]; return n; })} accessibilityLabel="إنقاص"><Ionicons name="remove-circle" size={22} color="#B3261E" /></TouchableOpacity>
                <Text style={[st.itemTxt, { flex: 1 }]} numberOfLines={1}>{l.q} × {l.p.name}</Text>
                <Text style={st.itemTxt}>{fmtMoney(l.p.price * l.q)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={st.posInputs}>
            <TextInput style={st.posInput} value={discount} onChangeText={(t) => setDiscount(t.replace(/[^\d.]/g, ""))} keyboardType="numeric" placeholder="خصم" placeholderTextColor={Colors.textMuted} textAlign="right" />
            <TextInput style={st.posInput} value={paid} onChangeText={(t) => setPaid(t.replace(/[^\d.]/g, ""))} keyboardType="numeric" placeholder="المدفوع" placeholderTextColor={Colors.textMuted} textAlign="right" />
            {PAY.map((m) => <TouchableOpacity key={m.k} onPress={() => setPay(m.k)} style={[st.payBtn, pay === m.k && st.payOn]}><Text style={[st.payTxt, pay === m.k && { color: "#fff" }]}>{m.l}</Text></TouchableOpacity>)}
          </View>
          <TouchableOpacity disabled={issuing} onPress={issue} style={[st.issue, issuing && { opacity: 0.6 }]}>
            {issuing ? <ActivityIndicator color="#fff" /> : <Ionicons name="receipt" size={17} color="#fff" />}
            <Text style={st.issueTxt}>إصدار فاتورة · {fmtMoney(posTotal)}{posChange ? ` · الباقي ${fmtMoney(posChange)}` : ""}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <BusinessFormModal visible={editBiz} initial={biz} token={token} onClose={() => setEditBiz(false)} onSaved={(b) => setBiz({ ...biz, ...b })} />
      <ProductFormModal visible={prodModal.open} businessId={biz.id} initial={prodModal.p} token={token} onClose={() => setProdModal({ open: false })}
        onSaved={(p) => setProducts((l) => l.some((x) => x.id === p.id) ? l.map((x) => x.id === p.id ? p : x) : [p, ...l])}
        onDeleted={(pid) => setProducts((l) => l.filter((x) => x.id !== pid))} />

      <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <Pressable style={st.backdrop} onPress={() => setReceipt(null)}>
          <Pressable style={st.receipt} onPress={(e) => e.stopPropagation()}>
            {receipt ? (<>
              <Ionicons name="checkmark-circle" size={40} color={Colors.primary} style={{ alignSelf: "center" }} />
              <Text style={[st.cardTitle, { textAlign: "center" }]}>{biz.name}</Text>
              <Text style={[st.muted, { textAlign: "center" }]}>فاتورة {receipt.invoice_number}</Text>
              <View style={{ marginVertical: 10, gap: 4 }}>
                {receipt.items.map((it, i) => <View key={i} style={st.rowBetween}><Text style={st.itemTxt}>{it.qty} × {it.name}</Text><Text style={st.itemTxt}>{fmtMoney(it.price * it.qty)}</Text></View>)}
                {receipt.discount ? <View style={st.rowBetween}><Text style={st.itemMuted}>الخصم</Text><Text style={st.itemMuted}>- {fmtMoney(receipt.discount)}</Text></View> : null}
                <View style={[st.rowBetween, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)", paddingTop: 6 }]}><Text style={st.totalLbl}>الإجمالي</Text><Text style={st.total}>{fmtMoney(receipt.total)}</Text></View>
                <View style={st.rowBetween}><Text style={st.itemMuted}>المدفوع</Text><Text style={st.itemMuted}>{fmtMoney(receipt.paid_amount)}</Text></View>
                {receipt.change_amount ? <View style={st.rowBetween}><Text style={st.itemMuted}>الباقي للعميل</Text><Text style={[st.itemTxt, { color: Colors.primaryDeep }]}>{fmtMoney(receipt.change_amount)}</Text></View> : null}
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity onPress={() => Share.share({ message: receiptText(biz, receipt) }).catch(() => {})} style={[st.issue, { flex: 1 }]}><Ionicons name="share-social" size={16} color="#fff" /><Text style={st.issueTxt}>مشاركة</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setReceipt(null)} style={[st.issue, { flex: 1, backgroundColor: Colors.bgDeep }]}><Text style={[st.issueTxt, { color: Colors.textPrimary }]}>إغلاق</Text></TouchableOpacity>
              </View>
            </>) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.bg, padding: 20 },
  muted: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 13, textAlign: "right" },
  ghost: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider },
  ghostTxt: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary },
  header: { backgroundColor: Colors.cardBg, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)", gap: 8 },
  headRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  back: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  openRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  openTxt: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  modRow: { flexDirection: "row-reverse", gap: 8 },
  modBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.bg },
  modTxt: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  tabs: { flexDirection: "row-reverse", gap: 6 },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 12, backgroundColor: Colors.bg },
  tabOn: { backgroundColor: Colors.primary },
  tabTxt: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textSecondary, flexShrink: 1 },
  seg: { flexDirection: "row-reverse", backgroundColor: "#E9EEEB", borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10 },
  segOn: { backgroundColor: Colors.cardBg },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  info: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#0E5A80", backgroundColor: "#E2EEF5", borderRadius: 12, padding: 10, textAlign: "right" },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 34 },
  order: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  cust: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  typeTag: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primaryDeep, backgroundColor: Colors.primarySoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  addr: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 4 },
  items: { backgroundColor: Colors.bg, borderRadius: 12, padding: 10, marginTop: 8, gap: 3 },
  itemTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  itemMuted: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  totalLbl: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary },
  total: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.primaryDeep },
  notes: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#6E5410", backgroundColor: "#FFF8E1", borderRadius: 10, padding: 8, marginTop: 8, textAlign: "right" },
  orderActions: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
  nextBtn: { flex: 1, height: 42, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  nextTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  sqBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  addProd: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 14, backgroundColor: Colors.primary },
  addProdTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  prod: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  prodImg: { width: 56, height: 56, borderRadius: 12 },
  prodName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  posGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  posItem: { width: "31.5%", minHeight: 78, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 10, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.06)", justifyContent: "space-between" },
  posBadge: { position: "absolute", top: -6, left: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  posBadgeTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  posName: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  posPrice: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primaryDeep, textAlign: "right" },
  posBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: Colors.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 14, gap: 8, borderTopWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  posLine: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 3 },
  posInputs: { flexDirection: "row-reverse", gap: 6, alignItems: "center" },
  posInput: { flex: 1, height: 40, backgroundColor: Colors.bg, borderRadius: 10, paddingHorizontal: 10, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary },
  payBtn: { paddingHorizontal: 10, height: 40, borderRadius: 10, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  payOn: { backgroundColor: Colors.primaryDeep },
  payTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  issue: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 14, backgroundColor: Colors.primary },
  issueTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  kpis: { flexDirection: "row-reverse", gap: 10 },
  kpi: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  kpiVal: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  kpiLbl: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", marginBottom: 8 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: Colors.bgDeep, marginTop: 4 },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  invRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  receipt: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 18 },
});
