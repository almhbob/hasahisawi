import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import BizLogo from "@/components/food/BizLogo";
import { foodApi, TYPE_META, CAT_META, CAT_KEYS, ORDER_TYPE_AR, bizColor, fmtMoney, productImage, waLink, type FoodBusiness, type FoodProduct, type FoodCat, type OrderType } from "@/lib/food-api";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

function notify(t: string, m?: string) { if (Platform.OS === "web") (globalThis as any).alert?.(m ? `${t}\n${m}` : t); else Alert.alert(t, m); }

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [biz, setBiz] = useState<FoodBusiness | null>(null);
  const [products, setProducts] = useState<FoodProduct[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<FoodCat | "">("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [sheet, setSheet] = useState(false);
  const [detail, setDetail] = useState<FoodProduct | null>(null);
  const [type, setType] = useState<OrderType>("takeaway");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await foodApi.business(String(id), token);
      setBiz(r.business); setProducts(r.products); setCanManage(r.can_manage);
      const b = r.business;
      setType(b.delivery_enabled ? "delivery" : b.takeaway_enabled ? "takeaway" : "dine_in");
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setForm((f) => ({ ...f, name: f.name || user?.name || "", phone: f.phone || (user as any)?.phone || "" })); }, [user]);

  const available = useMemo(() => products.filter((p) => p.is_available && (p.stock == null || p.stock > 0)), [products]);
  const cats = useMemo(() => CAT_KEYS.filter((k) => available.some((p) => p.category === k)), [available]);
  const shown = cat ? available.filter((p) => p.category === cat) : available;
  const lines = useMemo(() => Object.entries(cart).map(([pid, qty]) => ({ p: products.find((x) => x.id === Number(pid))!, qty })).filter((l) => l.p && l.qty > 0), [cart, products]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const fee = biz && type === "delivery" ? biz.delivery_fee : 0;

  const add = (p: FoodProduct, d = 1) => setCart((c) => {
    const n = Math.max(0, Math.min(p.stock ?? 99, (c[p.id] || 0) + d));
    const next = { ...c }; if (n) next[p.id] = n; else delete next[p.id]; return next;
  });

  if (error) return (
    <View style={[st.center, { paddingTop: insets.top }]}>
      <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} /><Text style={st.muted}>{error}</Text>
      <TouchableOpacity onPress={() => router.back()} style={st.ghost}><Text style={st.ghostTxt}>رجوع</Text></TouchableOpacity>
    </View>
  );
  if (!biz) return <View style={st.center}><ActivityIndicator color={Colors.primary} /></View>;

  const c = bizColor(biz);
  const wa = waLink(biz.whatsapp || biz.phone, `السلام عليكم، تواصلت معكم عبر حصاحيصاوي`);
  const modes = (["delivery", "takeaway", "dine_in"] as OrderType[]).filter((t) => (t === "delivery" ? biz.delivery_enabled : t === "takeaway" ? biz.takeaway_enabled : biz.dine_in_enabled));
  const belowMin = biz.min_order > 0 && subtotal < biz.min_order;

  const send = async () => {
    if (!token) { setSheet(false); return router.push("/login" as any); }
    if (!form.phone.trim()) return notify("رقم الهاتف مطلوب", "ليتواصل معك المطعم بخصوص الطلب.");
    if (type === "delivery" && !form.address.trim()) return notify("عنوان التوصيل مطلوب");
    setSending(true);
    try {
      const r = await foodApi.placeOrder(token, {
        business_id: biz.id, order_type: type, items: lines.map((l) => ({ id: l.p.id, qty: l.qty })),
        customer_name: form.name, customer_phone: form.phone, delivery_address: type === "delivery" ? form.address : undefined, notes: form.notes,
      });
      setCart({}); setSheet(false);
      notify("تم إرسال طلبك ✅", `${r.message}\nرقم الطلب: ${r.order.order_number}\nستصلك إشعارات بكل مرحلة.`);
      router.push("/my-food-orders" as any);
    } catch (e: any) {
      notify("تعذّر إرسال الطلب", e?.message);
      if (e?.status === 409) load();
    } finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: count ? 130 : 60 }} showsVerticalScrollIndicator={false}>
        <View style={[st.cover, { backgroundColor: c, paddingTop: insets.top + 8 }]}>
          {biz.cover_url ? <Image source={{ uri: biz.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.25)" }]} />
          <View style={st.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={st.round} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity onPress={() => Share.share({ message: `${biz.name} على حصاحيصاوي — اطلب الآن:\nhttps://play.google.com/store/apps/details?id=com.almhbob.hasahisawi` }).catch(() => {})} style={st.round} accessibilityLabel="مشاركة"><Ionicons name="share-social-outline" size={19} color="#fff" /></TouchableOpacity>
              {canManage ? <TouchableOpacity onPress={() => router.push({ pathname: "/restaurant-manage", params: { id: String(biz.id) } } as any)} style={st.round} accessibilityLabel="لوحة المطعم"><Ionicons name="speedometer-outline" size={19} color="#fff" /></TouchableOpacity> : null}
            </View>
          </View>
        </View>

        <View style={st.head}>
          <View style={st.logoRing}><BizLogo b={biz} size={76} /></View>
          <Text style={st.name}>{biz.name}</Text>
          <Text style={st.sub}>{TYPE_META[biz.business_type]?.label}{biz.district ? ` · ${biz.district}` : ""}{biz.opening_hours ? ` · ${biz.opening_hours}` : ""}</Text>
          <View style={[st.openPill, { backgroundColor: biz.accepting_orders ? Colors.primarySoft : "#EEEEEE" }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: biz.accepting_orders ? "#0E9C64" : "#8A8A8A" }} />
            <Text style={[st.openTxt, { color: biz.accepting_orders ? "#0B7A4E" : "#555" }]}>{biz.accepting_orders ? "يستقبل الطلبات الآن" : "لا يستقبل طلبات حالياً"}</Text>
          </View>
          {biz.status !== "approved" ? <Text style={st.pending}>قيد مراجعة الإدارة — غير ظاهر للعامة بعد</Text> : null}
          {biz.description ? <Text style={st.desc}>{biz.description}</Text> : null}
          <View style={st.facts}>
            {modes.map((t) => <View key={t} style={st.fact}><Text style={st.factTxt}>{ORDER_TYPE_AR[t]}</Text></View>)}
            {biz.delivery_enabled ? <View style={st.fact}><Text style={st.factTxt}>التوصيل {biz.delivery_fee ? fmtMoney(biz.delivery_fee) : "مجاني"}</Text></View> : null}
            {biz.min_order ? <View style={st.fact}><Text style={st.factTxt}>الحد الأدنى {fmtMoney(biz.min_order)}</Text></View> : null}
          </View>
          {biz.prep_note ? <Text style={st.note}><Ionicons name="time-outline" size={13} color={Colors.textMuted} /> {biz.prep_note}</Text> : null}
          <View style={st.actions}>
            {biz.phone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${biz.phone}`)} style={st.action}><Ionicons name="call" size={17} color={c} /><Text style={[st.actionTxt, { color: c }]}>اتصال</Text></TouchableOpacity> : null}
            {wa ? <TouchableOpacity onPress={() => Linking.openURL(wa)} style={st.action}><Ionicons name="logo-whatsapp" size={18} color="#1FA855" /><Text style={[st.actionTxt, { color: "#1FA855" }]}>واتساب</Text></TouchableOpacity> : null}
            {biz.address ? <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${biz.name} ${biz.address} الحصاحيصا`)}`)} style={st.action}><Ionicons name="location" size={17} color={Colors.textSecondary} /><Text style={st.actionTxt}>الموقع</Text></TouchableOpacity> : null}
          </View>
        </View>

        {cats.length > 1 ? (
          <RtlScrollRow contentContainerStyle={st.cats}>
            <TouchableOpacity onPress={() => setCat("")} style={[st.cat, cat === "" && { backgroundColor: c, borderColor: c }]}><Text style={[st.catTxt, cat === "" && { color: "#fff" }]}>الكل</Text></TouchableOpacity>
            {cats.map((k) => (
              <TouchableOpacity key={k} onPress={() => setCat(k)} style={[st.cat, cat === k && { backgroundColor: c, borderColor: c }]}>
                <MaterialCommunityIcons name={CAT_META[k].icon as any} size={14} color={cat === k ? "#fff" : c} />
                <Text style={[st.catTxt, cat === k && { color: "#fff" }]}>{CAT_META[k].label}</Text>
              </TouchableOpacity>
            ))}
          </RtlScrollRow>
        ) : null}

        <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 6 }}>
          {shown.length === 0 ? <Text style={st.empty}>{products.length ? "لا توجد أصناف متاحة الآن." : "لم يُضف المطعم أصنافاً للمنيو بعد."}</Text> : shown.map((p) => {
            const img = productImage(p); const q = cart[p.id] || 0;
            return (
              <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => setDetail(p)} style={st.item}>
                {img ? <Image source={{ uri: img }} style={st.itemImg} /> : <View style={[st.itemImg, { backgroundColor: c + "16", alignItems: "center", justifyContent: "center" }]}><MaterialCommunityIcons name={CAT_META[p.category]?.icon as any || "food"} size={30} color={c} /></View>}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.itemName} numberOfLines={1}>{p.name}</Text>
                  {p.description ? <Text style={st.itemDesc} numberOfLines={2}>{p.description}</Text> : null}
                  <View style={st.itemFoot}>
                    <Text style={[st.price, { color: c }]}>{fmtMoney(p.price)}</Text>
                    {biz.accepting_orders ? (q ? (
                      <View style={st.stepper}>
                        <TouchableOpacity onPress={() => add(p, 1)} style={[st.stepBtn, { backgroundColor: c }]} accessibilityLabel="زيادة"><Ionicons name="add" size={16} color="#fff" /></TouchableOpacity>
                        <Text style={st.stepNum}>{q}</Text>
                        <TouchableOpacity onPress={() => add(p, -1)} style={[st.stepBtn, { backgroundColor: Colors.bgDeep }]} accessibilityLabel="إنقاص"><Ionicons name="remove" size={16} color={Colors.textPrimary} /></TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => add(p, 1)} style={[st.addBtn, { backgroundColor: c }]}><Ionicons name="add" size={15} color="#fff" /><Text style={st.addTxt}>أضف</Text></TouchableOpacity>
                    )) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {count > 0 ? (
        <View style={[st.cartBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity onPress={() => setSheet(true)} style={[st.cartBtn, { backgroundColor: c }]}>
            <View style={st.cartCount}><Text style={[st.cartCountTxt, { color: c }]}>{count}</Text></View>
            <Text style={st.cartTxt}>عرض السلة</Text>
            <Text style={st.cartTotal}>{fmtMoney(subtotal)}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Product detail */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={st.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            {detail ? (
              <>
                {detail.images?.length ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 16, marginBottom: 12 }}>
                    {detail.images.map((im, i) => <Image key={i} source={{ uri: im.image_url }} style={{ width: 340, height: 220, borderRadius: 16, marginLeft: 8 }} resizeMode="cover" />)}
                  </ScrollView>
                ) : null}
                <Text style={st.sheetTitle}>{detail.name}</Text>
                {detail.description ? <Text style={st.desc}>{detail.description}</Text> : null}
                <Text style={st.muted}>{CAT_META[detail.category]?.label}{detail.prep_minutes ? ` · التحضير ${detail.prep_minutes} دقيقة` : ""}</Text>
                <View style={[st.itemFoot, { marginTop: 14 }]}>
                  <Text style={[st.price, { color: c, fontSize: 20 }]}>{fmtMoney(detail.price)}</Text>
                  {biz.accepting_orders ? <TouchableOpacity onPress={() => { add(detail, 1); setDetail(null); }} style={[st.addBtn, { backgroundColor: c, paddingHorizontal: 18, paddingVertical: 10 }]}><Ionicons name="cart" size={16} color="#fff" /><Text style={st.addTxt}>أضف للسلة</Text></TouchableOpacity> : null}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Checkout */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={st.backdrop} onPress={() => setSheet(false)}>
            <Pressable style={[st.sheet, { maxHeight: "92%" }]} onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={st.sheetTitle}>سلتك من {biz.name}</Text>
                {lines.map((l) => (
                  <View key={l.p.id} style={st.line}>
                    <View style={st.stepper}>
                      <TouchableOpacity onPress={() => add(l.p, 1)} style={[st.stepBtn, { backgroundColor: c }]}><Ionicons name="add" size={15} color="#fff" /></TouchableOpacity>
                      <Text style={st.stepNum}>{l.qty}</Text>
                      <TouchableOpacity onPress={() => add(l.p, -1)} style={[st.stepBtn, { backgroundColor: Colors.bgDeep }]}><Ionicons name={l.qty === 1 ? "trash-outline" : "remove"} size={15} color={Colors.textPrimary} /></TouchableOpacity>
                    </View>
                    <Text style={st.lineName} numberOfLines={1}>{l.p.name}</Text>
                    <Text style={st.linePrice}>{fmtMoney(l.p.price * l.qty)}</Text>
                  </View>
                ))}

                <Text style={st.label}>طريقة الاستلام</Text>
                <View style={st.modeRow}>
                  {modes.map((t) => (
                    <TouchableOpacity key={t} onPress={() => setType(t)} style={[st.mode, type === t && { backgroundColor: c, borderColor: c }]}>
                      <Ionicons name={t === "delivery" ? "bicycle" : t === "takeaway" ? "bag-handle-outline" : "restaurant-outline"} size={16} color={type === t ? "#fff" : c} />
                      <Text style={[st.modeTxt, type === t && { color: "#fff" }]}>{ORDER_TYPE_AR[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.label}>الاسم</Text>
                <TextInput style={st.input} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} textAlign="right" placeholder="اسمك" placeholderTextColor={Colors.textMuted} />
                <Text style={st.label}>رقم الهاتف *</Text>
                <TextInput style={st.input} value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} keyboardType="phone-pad" textAlign="right" placeholder="09xxxxxxxx" placeholderTextColor={Colors.textMuted} />
                {type === "delivery" ? (<>
                  <Text style={st.label}>عنوان التوصيل *</Text>
                  <TextInput style={st.input} value={form.address} onChangeText={(t) => setForm({ ...form, address: t })} textAlign="right" placeholder="الحي، الشارع، علامة مميزة" placeholderTextColor={Colors.textMuted} />
                </>) : null}
                <Text style={st.label}>ملاحظات</Text>
                <TextInput style={[st.input, { minHeight: 60, textAlignVertical: "top" }]} value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} multiline textAlign="right" placeholder="بدون بصل، حار…" placeholderTextColor={Colors.textMuted} />

                <View style={st.sum}>
                  <View style={st.sumRow}><Text style={st.sumLbl}>المجموع</Text><Text style={st.sumVal}>{fmtMoney(subtotal)}</Text></View>
                  {type === "delivery" ? <View style={st.sumRow}><Text style={st.sumLbl}>التوصيل</Text><Text style={st.sumVal}>{fee ? fmtMoney(fee) : "مجاني"}</Text></View> : null}
                  <View style={[st.sumRow, { borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.07)", paddingTop: 8 }]}><Text style={[st.sumLbl, { fontFamily: "Cairo_700Bold", color: Colors.textPrimary }]}>الإجمالي</Text><Text style={[st.sumVal, { fontSize: 18, color: c }]}>{fmtMoney(subtotal + fee)}</Text></View>
                  <Text style={st.muted}>الدفع عند الاستلام</Text>
                </View>
                {belowMin ? <Text style={st.warn}>الحد الأدنى للطلب {fmtMoney(biz.min_order)} — أضف {fmtMoney(biz.min_order - subtotal)}</Text> : null}
                <TouchableOpacity disabled={sending || belowMin} onPress={send} style={[st.sendBtn, { backgroundColor: c }, (sending || belowMin) && { opacity: 0.5 }]}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
                  <Text style={st.sendTxt}>{token ? "تأكيد الطلب" : "سجّل الدخول لإتمام الطلب"}</Text>
                </TouchableOpacity>
                <View style={{ height: 16 }} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.bg },
  muted: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 13, textAlign: "right" },
  ghost: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider },
  ghostTxt: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary },
  cover: { height: 180, paddingHorizontal: 14 },
  topBar: { flexDirection: "row-reverse", justifyContent: "space-between" },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  head: { alignItems: "center", paddingHorizontal: 16, marginTop: -44, gap: 4 },
  logoRing: { padding: 4, backgroundColor: Colors.cardBg, borderRadius: 26 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 21, color: Colors.textPrimary, marginTop: 4, textAlign: "center" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  openPill: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4 },
  openTxt: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  pending: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#8A6400", backgroundColor: "#FFF4D6", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: Colors.textSecondary, textAlign: "center", marginTop: 6 },
  facts: { flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 8 },
  fact: { backgroundColor: Colors.cardBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  factTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary },
  note: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, marginTop: 4, textAlign: "center" },
  actions: { flexDirection: "row-reverse", gap: 8, marginTop: 12, alignSelf: "stretch" },
  action: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  actionTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  cats: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  cat: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  catTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 30 },
  item: { flexDirection: "row-reverse", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 18, padding: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  itemImg: { width: 96, height: 96, borderRadius: 14 },
  itemName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  itemDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 19, color: Colors.textMuted, textAlign: "right" },
  itemFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: "auto" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  addTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepNum: { fontFamily: "Cairo_700Bold", fontSize: 15, minWidth: 18, textAlign: "center", color: Colors.textPrimary },
  cartBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: "rgba(247,249,248,0.96)" },
  cartBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 12, height: 56, borderRadius: 18, paddingHorizontal: 16 },
  cartCount: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  cartCountTxt: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  cartTxt: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right" },
  cartTotal: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right", marginBottom: 6 },
  line: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  lineName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  linePrice: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  modeRow: { flexDirection: "row-reverse", gap: 8 },
  mode: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, height: 44, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  modeTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  sum: { backgroundColor: Colors.bg, borderRadius: 14, padding: 12, marginTop: 16, gap: 6 },
  sumRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  sumLbl: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  sumVal: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  warn: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#8A6400", textAlign: "right", marginTop: 8 },
  sendBtn: { marginTop: 14, height: 52, borderRadius: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  sendTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
