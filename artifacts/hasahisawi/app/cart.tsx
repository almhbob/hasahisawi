// 🛒 سلتي — سلة موحّدة لكل المتاجر والمطاعم والكافتيريات، مع إتمام الطلب لكل جهة
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Image, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { foodApi } from "@/lib/food-api";
import { notify, confirmAction } from "@/lib/xplatform";
import { useCart, basketSubtotal, basketCount, fmtSdg, type Basket } from "@/lib/cart";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";
type Mode = "delivery" | "takeaway" | "dine_in" | "pickup";
const MODE_AR: Record<Mode, { label: string; icon: string }> = {
  delivery: { label: "توصيل", icon: "bicycle" }, takeaway: { label: "استلام", icon: "bag-handle" },
  dine_in: { label: "في المطعم", icon: "restaurant" }, pickup: { label: "استلام من المتجر", icon: "storefront" },
};

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [checkout, setCheckout] = useState<Basket | null>(null);
  const [done, setDone] = useState<{ basket: Basket; number: string; total: number } | null>(null);

  useEffect(() => { // فتح إتمام الطلب مباشرة عند القدوم من متجر/مطعم
    if (focus && cart.ready) { const b = cart.baskets.find((x) => x.key === focus); if (b) setCheckout(b); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, cart.ready]);

  const grand = useMemo(() => cart.baskets.reduce((t, b) => t + basketSubtotal(b), 0), [cart.baskets]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
        <View style={st.headRow}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.round} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
          <Text style={st.headT}>سلتي</Text>
          <View style={st.countPill}><Text style={st.countT}>{cart.count}</Text></View>
        </View>
        {cart.baskets.length ? (
          <Text style={st.headS}>{cart.baskets.length > 1 ? `${cart.baskets.length} جهات · كل جهة تستلم طلبها منفصلاً` : "جاهزة لإتمام الطلب"} · الإجمالي التقريبي {fmtSdg(grand)}</Text>
        ) : null}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        {!cart.ready ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : done ? (
          <Animated.View entering={ZoomIn.springify()} style={st.success}>
            <View style={st.successIcon}><Ionicons name="checkmark-done" size={40} color="#fff" /></View>
            <Text style={st.successT}>تم إرسال طلبك 🎉</Text>
            <Text style={st.successS}>{done.basket.name} · رقم الطلب {done.number}</Text>
            <Text style={st.successS}>الإجمالي {fmtSdg(done.total)} — تصلك إشعارات بكل مرحلة.</Text>
            <Pressable onPress={() => router.push((done.basket.source === "food" ? "/my-food-orders" : { pathname: "/stores", params: { tab: "myorders" } }) as any)} style={st.primary}>
              <Ionicons name="navigate" size={18} color="#fff" /><Text style={st.primaryT}>تتبّع الطلب</Text>
            </Pressable>
            {cart.baskets.length ? <Pressable onPress={() => setDone(null)} style={st.ghost}><Text style={st.ghostT}>متابعة بقية السلة ({cart.baskets.length})</Text></Pressable> : null}
          </Animated.View>
        ) : !cart.baskets.length ? (
          <View style={st.empty}>
            <View style={st.emptyIcon}><MaterialCommunityIcons name="cart-outline" size={44} color={GREEN} /></View>
            <Text style={st.emptyT}>سلتك فارغة</Text>
            <Text style={st.emptyS}>أضف منتجات من المتاجر أو وجبات من المطاعم والكافتيريات — تبقى السلة محفوظة حتى تكمل طلبك.</Text>
            <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 6 }}>
              <Pressable onPress={() => router.push("/stores" as any)} style={[st.primary, { flex: 1 }]}><Ionicons name="storefront" size={17} color="#fff" /><Text style={st.primaryT}>المتاجر</Text></Pressable>
              <Pressable onPress={() => router.push("/(tabs)/restaurants" as any)} style={[st.primary, { flex: 1, backgroundColor: GOLD }]}><Ionicons name="restaurant" size={17} color="#3D2C00" /><Text style={[st.primaryT, { color: "#3D2C00" }]}>المطاعم</Text></Pressable>
            </View>
          </View>
        ) : cart.baskets.map((b, i) => <BasketCard key={b.key} b={b} index={i} onCheckout={() => setCheckout(b)} />)}
      </ScrollView>

      {checkout ? (
        <CheckoutSheet basket={cart.get(checkout.source, checkout.id) ?? checkout} onClose={() => setCheckout(null)}
          onDone={(number, total) => { const b = checkout; cart.clear(b.source, b.id); setCheckout(null); setDone({ basket: b, number, total }); }} />
      ) : null}
    </View>
  );
}

function BasketCard({ b, index, onCheckout }: { b: Basket; index: number; onCheckout: () => void }) {
  const cart = useCart();
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const sub = basketSubtotal(b);
  const below = !!b.minOrder && sub < b.minOrder;
  const color = b.color || GREEN;
  const openVendor = () => router.push((b.source === "food" ? { pathname: "/restaurant", params: { id: String(b.id) } } : { pathname: "/stores", params: { open: String(b.id) } }) as any);
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(16)} style={st.basket}>
      <Pressable onPress={openVendor} style={st.vendor}>
        <View style={[st.vLogo, { backgroundColor: color + "1A" }]}>
          {b.logo && /^https?:/.test(b.logo) ? <Image source={{ uri: b.logo }} style={st.vLogoImg} /> : <Ionicons name={b.source === "food" ? "restaurant" : "storefront"} size={20} color={color} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.vName} numberOfLines={1}>{b.name}</Text>
          <Text style={st.muted}>{b.kindLabel || (b.source === "food" ? "مطعم" : "متجر")} · {basketCount(b)} صنف</Text>
        </View>
        <Pressable onPress={async () => { if (await confirmAction("إفراغ السلة", `حذف كل أصناف ${b.name}؟`, "إفراغ", true)) cart.clear(b.source, b.id); }} hitSlop={8} accessibilityLabel="إفراغ سلة الجهة">
          <Ionicons name="trash-outline" size={19} color={Colors.textMuted} />
        </Pressable>
      </Pressable>

      {b.lines.map((l) => (
        <View key={l.id} style={st.line}>
          {l.image ? <Image source={{ uri: l.image }} style={st.lImg} /> : <View style={[st.lImg, { alignItems: "center", justifyContent: "center", backgroundColor: color + "12" }]}><Ionicons name="cube-outline" size={20} color={color} /></View>}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.lName} numberOfLines={2}>{l.name}</Text>
            <Text style={st.lPrice}>{fmtSdg(l.price * l.qty)}{l.qty > 1 ? <Text style={st.muted}>  ({fmtSdg(l.price)} × {l.qty})</Text> : null}</Text>
            {noteFor === l.id ? (
              <TextInput autoFocus value={l.note || ""} onChangeText={(v) => cart.setNote(b.source, b.id, l.id, v)} onBlur={() => setNoteFor(null)}
                placeholder="مثال: بدون بصل / حجم كبير" placeholderTextColor={Colors.textMuted} style={st.noteIn} maxLength={200} />
            ) : (
              <Pressable onPress={() => setNoteFor(l.id)} hitSlop={6}><Text style={st.noteLink}>{l.note ? `📝 ${l.note}` : "+ إضافة ملاحظة"}</Text></Pressable>
            )}
          </View>
          <View style={st.stepper}>
            <Pressable onPress={() => cart.setQty(b.source, b.id, l.id, l.qty + 1)} disabled={!!l.max && l.qty >= l.max} style={st.stepBtn} accessibilityLabel={`زيادة ${l.name}`}><Ionicons name="add" size={16} color={DEEP} /></Pressable>
            <Text style={st.stepN}>{l.qty}</Text>
            <Pressable onPress={() => cart.setQty(b.source, b.id, l.id, l.qty - 1)} style={st.stepBtn} accessibilityLabel={`إنقاص ${l.name}`}><Ionicons name={l.qty === 1 ? "trash-outline" : "remove"} size={16} color={l.qty === 1 ? "#C62828" : DEEP} /></Pressable>
          </View>
        </View>
      ))}

      <View style={st.sumRow}><Text style={st.sumL}>المجموع</Text><Text style={st.sumV}>{fmtSdg(sub)}</Text></View>
      {below ? (
        <View style={st.warn}><Ionicons name="information-circle" size={16} color="#8A6100" /><Text style={st.warnT}>الحد الأدنى للطلب {fmtSdg(b.minOrder!)} — أضف {fmtSdg(b.minOrder! - sub)}</Text></View>
      ) : null}
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <Pressable onPress={openVendor} style={[st.ghost, { flex: 1 }]}><Ionicons name="add-circle-outline" size={16} color={DEEP} /><Text style={st.ghostT}>أضف المزيد</Text></Pressable>
        <Pressable onPress={onCheckout} disabled={below} style={[st.primary, { flex: 1.4 }, below && { opacity: 0.5 }]}><Ionicons name="card" size={17} color="#fff" /><Text style={st.primaryT}>إتمام الطلب</Text></Pressable>
      </View>
    </Animated.View>
  );
}

function CheckoutSheet({ basket: b, onClose, onDone }: { basket: Basket; onClose: () => void; onDone: (number: string, total: number) => void }) {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { user, token } = useAuth();
  const modes: Mode[] = b.source === "food" ? (b.modes?.length ? b.modes : ["takeaway"]) : b.deliveryAvailable ? ["delivery", "pickup"] : ["pickup"];
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [name, setName] = useState(cart.profile.name || user?.name || "");
  const [phone, setPhone] = useState(cart.profile.phone || (user as any)?.phone || "");
  const [address, setAddress] = useState(cart.profile.address || "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const sub = basketSubtotal(b);
  const fee = mode === "delivery" ? Number(b.deliveryFee || 0) : 0;
  const lineNotes = b.lines.filter((l) => l.note).map((l) => `• ${l.name}: ${l.note}`).join("\n");

  const submit = async () => {
    setErr("");
    if (name.trim().length < 2) return setErr("اكتب اسمك");
    if (phone.replace(/\D/g, "").length < 9) return setErr("رقم الهاتف غير صحيح");
    if (mode === "delivery" && address.trim().length < 3) return setErr("اكتب عنوان التوصيل");
    if (b.source === "food" && !token) { onClose(); return router.push("/login" as any); }
    setBusy(true);
    cart.saveProfile({ name: name.trim(), phone: phone.trim(), address: address.trim() || cart.profile.address });
    try {
      if (b.source === "food") {
        const r = await foodApi.placeOrder(token, {
          business_id: b.id, order_type: mode, items: b.lines.map((l) => ({ id: l.id, qty: l.qty, note: l.note || undefined })),
          customer_name: name.trim(), customer_phone: phone.trim(), delivery_address: mode === "delivery" ? address.trim() : undefined,
          notes: [notes.trim(), lineNotes].filter(Boolean).join("\n") || undefined,
        });
        onDone(r.order.order_number, r.order.total);
      } else {
        const res = await fetch(`${getApiUrl()}/api/stores/${b.id}/orders`, {
          method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            customer_name: name.trim(), customer_phone: phone.trim(), customer_address: mode === "delivery" ? address.trim() : "",
            customer_notes: [mode === "pickup" ? "استلام من المتجر" : "", notes.trim(), lineNotes].filter(Boolean).join("\n"),
            items: b.lines.map((l) => ({ id: l.id, qty: l.qty })),
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || "تعذّر إرسال الطلب");
        onDone(`#${j.order?.id ?? j.id}`, Number(j.order?.total ?? sub + fee));
      }
    } catch (e: any) { setErr(e?.message || "تعذّر إرسال الطلب"); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={st.handle} />
          <Text style={st.sheetT}>إتمام الطلب من {b.name}</Text>
          <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 6 }} keyboardShouldPersistTaps="handled">
            {modes.length > 1 ? (
              <View style={st.modes}>
                {modes.map((m) => (
                  <Pressable key={m} onPress={() => setMode(m)} style={[st.mode, mode === m && { backgroundColor: DEEP, borderColor: DEEP }]} accessibilityRole="radio" accessibilityState={{ selected: mode === m }}>
                    <Ionicons name={MODE_AR[m].icon as any} size={17} color={mode === m ? "#fff" : DEEP} />
                    <Text style={[st.modeT, mode === m && { color: "#fff" }]}>{MODE_AR[m].label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Field icon="person-outline" value={name} onChange={setName} placeholder="الاسم" />
            <Field icon="call-outline" value={phone} onChange={setPhone} placeholder="رقم الهاتف" keyboard="phone-pad" />
            {mode === "delivery" ? <Field icon="location-outline" value={address} onChange={setAddress} placeholder="عنوان التوصيل (الحي، أقرب معلم)" /> : null}
            <Field icon="chatbubble-ellipses-outline" value={notes} onChange={setNotes} placeholder="ملاحظات للطلب (اختياري)" multiline />

            <View style={st.summary}>
              {b.lines.map((l) => (
                <View key={l.id} style={st.sumLine}><Text style={st.sumLV}>{fmtSdg(l.price * l.qty)}</Text><Text style={st.sumLL} numberOfLines={1}>{l.name} × {l.qty}</Text></View>
              ))}
              <View style={st.div} />
              <View style={st.sumLine}><Text style={st.sumLV}>{fmtSdg(sub)}</Text><Text style={st.sumLL}>المجموع</Text></View>
              {mode === "delivery" ? <View style={st.sumLine}><Text style={st.sumLV}>{fee ? fmtSdg(fee) : "مجاني"}</Text><Text style={st.sumLL}>التوصيل</Text></View> : null}
              <View style={st.sumLine}><Text style={[st.sumLV, st.total]}>{fmtSdg(sub + fee)}</Text><Text style={[st.sumLL, st.total]}>الإجمالي</Text></View>
              <Text style={st.fine}>السعر النهائي يؤكده {b.source === "food" ? "المطعم" : "المتجر"} عند استلام الطلب · الدفع عند الاستلام</Text>
            </View>
            {err ? <Text style={st.err}>{err}</Text> : null}
            <Pressable onPress={submit} disabled={busy} style={[st.primary, { paddingVertical: 15 }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={st.primaryT}>تأكيد الطلب · {fmtSdg(sub + fee)}</Text></>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ icon, value, onChange, placeholder, keyboard, multiline }: { icon: any; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: any; multiline?: boolean }) {
  return (
    <View style={[st.field, multiline && { alignItems: "flex-start" }]}>
      <Ionicons name={icon} size={18} color={Colors.textMuted} style={multiline ? { marginTop: 12 } : undefined} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={keyboard}
        multiline={multiline} style={[st.input, multiline && { minHeight: 64, textAlignVertical: "top" }]} />
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, gap: 6 },
  headRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  headT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", textAlign: "right" },
  headS: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  countPill: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#3D2C00" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  empty: { alignItems: "center", gap: 8, padding: 24, backgroundColor: Colors.cardBg, borderRadius: 24, borderWidth: 1, borderColor: Colors.divider, marginTop: 20 },
  emptyIcon: { width: 86, height: 86, borderRadius: 30, backgroundColor: GREEN + "14", alignItems: "center", justifyContent: "center" },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptyS: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  basket: { backgroundColor: Colors.cardBg, borderRadius: 24, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.divider },
  vendor: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  vLogo: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  vLogoImg: { width: 44, height: 44 },
  vName: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.textPrimary, textAlign: "right" },
  line: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  lImg: { width: 58, height: 58, borderRadius: 14, backgroundColor: Colors.bg },
  lName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  lPrice: { fontFamily: "Cairo_700Bold", fontSize: 13, color: DEEP, textAlign: "right" },
  noteLink: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#8A6100", textAlign: "right" },
  noteIn: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right", borderWidth: 1, borderColor: GOLD + "80", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#FFFBEF" },
  stepper: { alignItems: "center", gap: 2, backgroundColor: Colors.bg, borderRadius: 14, padding: 3 },
  stepBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  sumRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingTop: 4 },
  sumL: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },
  sumV: { fontFamily: "Cairo_700Bold", fontSize: 17, color: DEEP },
  warn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: GOLD + "1F", borderRadius: 12, padding: 9 },
  warnT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 12, color: "#8A6100", textAlign: "right" },
  primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 16, backgroundColor: DEEP },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  ghost: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: DEEP },
  success: { alignItems: "center", gap: 8, padding: 24, backgroundColor: Colors.cardBg, borderRadius: 26, borderWidth: 1, borderColor: GREEN + "40", marginTop: 20 },
  successIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  successT: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  successS: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textSecondary, textAlign: "center" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "92%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 10 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  modes: { flexDirection: "row-reverse", gap: 8 },
  mode: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 11, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  modeT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: DEEP },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 11 },
  summary: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.divider },
  sumLine: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10 },
  sumLL: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  sumLV: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  total: { fontSize: 15.5, color: DEEP },
  div: { height: 1, backgroundColor: Colors.divider, marginVertical: 2 },
  fine: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "center", marginTop: 4 },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
});
