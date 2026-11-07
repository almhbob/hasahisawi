/**
 * 🛍️ طلبات شي إن — شاشة العميل
 * الصق رابط المنتج ← حدّد المقاس واللون والكمية ← شاهد التكلفة كاملة ← حوّل وارفع الإيصال ← تابع طلبك.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { copyText, notify, openExternal } from "@/lib/xplatform";
import { toLatinDigits } from "@/lib/digits";
import { NeuButton, NeuField, NeuInset, NeuRaised } from "@/components/auth/neu";
import { ImageUploadField } from "@/components/union/ImageUploadField";
import { ACCENT, CostBreakdown, Empty, OrderCard, ServiceBadge, SHEIN, Shell, u } from "@/components/shein/ui";
import { computeFinancials, extractUrl, isSheinUrl, ROLE_LABEL, sheinApi, SheinOrder, SheinRole, SheinSettings, usePolicyAccepted } from "@/lib/shein-api";

const STEPS = [
  { icon: "link-outline", t: "الصق رابط المنتج من شي إن" },
  { icon: "calculator-outline", t: "اعرف التكلفة كاملة بالجنيه" },
  { icon: "receipt-outline", t: "حوّل المبلغ وارفع الإيصال" },
  { icon: "airplane-outline", t: "نشتري ونشحن من السعودية" },
  { icon: "home-outline", t: "تستلم طلبك في الحصاحيصا" },
];

export default function SheinScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [settings, setSettings] = useState<SheinSettings | null>(null);
  const [roles, setRoles] = useState<SheinRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [orders, setOrders] = useState<SheinOrder[]>([]);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const c = await sheinApi.config(token);
      setSettings(c.settings); setRoles(c.roles || []); setIsAdmin(!!c.is_admin);
      if (token) { const m = await sheinApi.mine(token); setOrders(m.orders); }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = settings?.status === "active" || isAdmin;
  const active = orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;

  return (
    <Shell title="طلبات شي إن" sub="نشتري لك من شي إن السعودية ونوصّل للحصاحيصا" insets={insets}
      right={settings ? <ServiceBadge state={settings.status} /> : null}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={ACCENT} />}>
        {loading || !settings ? <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /> : (
          <>
            <Hero />
            {(roles.length > 0 || isAdmin) && (
              <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
                {(isAdmin ? (["verifier", "saudi", "hasahisa"] as SheinRole[]) : roles).map(r => (
                  <TouchableOpacity key={r} style={st.roleBtn} onPress={() => router.push({ pathname: "/shein-agent", params: { role: r } } as any)}>
                    <Ionicons name={r === "verifier" ? "shield-checkmark" : r === "saudi" ? "airplane" : "bicycle"} size={15} color={ACCENT} />
                    <Text style={st.roleText}>لوحة {ROLE_LABEL[r]}</Text>
                  </TouchableOpacity>
                ))}
                {isAdmin && (
                  <TouchableOpacity style={[st.roleBtn, { borderColor: SHEIN + "40" }]} onPress={() => router.push("/admin-shein" as any)}>
                    <Ionicons name="settings" size={15} color={SHEIN} />
                    <Text style={[st.roleText, { color: SHEIN }]}>إدارة الخدمة</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {settings.status !== "active" && (
              <NeuInset radius={16} style={{ padding: 14, gap: 4 }}>
                <Text style={[u.section, { color: settings.status === "maintenance" ? "#B42323" : "#946B00" }]}>
                  {settings.status === "maintenance" ? "الخدمة قيد الصيانة مؤقتاً" : "الخدمة ستتوفر قريباً"}
                </Text>
                <Text style={u.meta}>{settings.note || (settings.status === "maintenance" ? "نعمل على تحسين الخدمة — طلباتك الحالية مستمرة كالمعتاد." : "نجهّز فريق الشراء والشحن، وسنعلمك فور الإطلاق.")}</Text>
                {isAdmin ? <Text style={[u.meta, { color: ACCENT }]}>بصفتك مديراً يمكنك تجربة الطلب الآن.</Text> : null}
              </NeuInset>
            )}

            <View style={st.tabs}>
              {([["new", "طلب جديد", "add-circle-outline"], ["mine", `طلباتي${active ? ` (${active})` : ""}`, "list-outline"]] as const).map(([k, l, i]) => (
                <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                  <Ionicons name={i as any} size={16} color={tab === k ? "#fff" : Colors.textSecondary} />
                  <Text style={[st.tabText, tab === k && { color: "#fff" }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === "new" ? (
              !token || !user || (user as any).isGuest ? (
                <NeuRaised radius={20} style={{ padding: 20, alignItems: "center", gap: 12 }}>
                  <Ionicons name="lock-closed-outline" size={36} color={Colors.textMuted} />
                  <Text style={[u.meta, { fontSize: 13.5 }]}>سجّل الدخول لتطلب من شي إن وتتابع شحنتك</Text>
                  <NeuButton label="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/login" as any)} />
                </NeuRaised>
              ) : open ? (
                <OrderForm token={token} settings={settings} defaultPhone={user.phone || ""} defaultName={user.name || ""}
                  onDone={async () => { await load(); setTab("mine"); }} onPolicyChanged={load} />
              ) : (
                <Empty icon="time-outline" text="يمكنك إرسال الطلبات عند تفعيل الخدمة" />
              )
            ) : orders.length === 0 ? (
              <Empty icon="bag-outline" text="لا توجد طلبات بعد — ابدأ أول طلب من «طلب جديد»" />
            ) : orders.map(o => <OrderCard key={o.id} o={o} />)}
          </>
        )}
      </ScrollView>
    </Shell>
  );
}

function Hero() {
  return (
    <NeuRaised radius={24} depth={8} style={{ padding: 16, gap: 12 }}>
      <View style={u.row}>
        <View style={st.logo}><Text style={st.logoText}>SHEIN</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={u.section}>تسوّق من شي إن بسهولة</Text>
          <Text style={u.meta}>أسعار واضحة، دفع عبر بنكك، وتتبّع لكل مرحلة حتى باب بيتك.</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => router.push("/shein-policy" as any)} style={st.policyLink} accessibilityRole="link">
        <Ionicons name="document-text-outline" size={16} color={ACCENT} />
        <Text style={[u.meta, { color: ACCENT, fontFamily: "Cairo_700Bold" }]}>سياسة الخدمة: الأسعار، الإلغاء والاسترداد، الشحن</Text>
        <Ionicons name="chevron-back" size={14} color={ACCENT} />
      </TouchableOpacity>
      <View style={{ gap: 8, flexDirection: "row-reverse", flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <View key={i} style={st.step}>
            <View style={st.stepNum}><Text style={st.stepNumText}>{i + 1}</Text></View>
            <Ionicons name={s.icon as any} size={18} color={ACCENT} />
            <Text style={st.stepText}>{s.t}</Text>
          </View>
        ))}
      </View>
    </NeuRaised>
  );
}

function OrderForm({ token, settings, defaultPhone, defaultName, onDone, onPolicyChanged }: { token: string; settings: SheinSettings; defaultPhone: string; defaultName: string; onDone: () => void; onPolicyChanged: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [address, setAddress] = useState("");
  const [receipt, setReceipt] = useState("");
  const [payRef, setPayRef] = useState("");
  const [accepted, setAccepted] = usePolicyAccepted();
  const agreed = accepted === settings.policy_version;
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const unit = Number(toLatinDigits(price).replace(/[^\d.]/g, "")) || 0;
  const fin = useMemo(() => computeFinancials(unit, qty, settings), [unit, qty, settings]);
  const cleanUrl = extractUrl(url);
  const urlOk = isSheinUrl(cleanUrl);

  const paste = async () => {
    try { const t = await (globalThis as any).navigator?.clipboard?.readText?.(); if (t) setUrl(extractUrl(t)); } catch { notify("تعذّر اللصق", "الصق الرابط يدوياً في الحقل"); }
  };
  const submit = async () => {
    setTried(true);
    if (!urlOk) return notify("الرابط غير صحيح", "انسخ رابط المنتج من تطبيق أو موقع شي إن والصقه هنا.");
    if (unit <= 0) return notify("أدخل سعر القطعة", "اكتب السعر بالريال كما يظهر في صفحة المنتج.");
    if (!receipt) return notify("ارفع إيصال التحويل", "حوّل المبلغ المطلوب ثم ارفع لقطة شاشة الإيصال (بنكك أو غيره).");
    if (toLatinDigits(payRef).replace(/\s/g, "").length < 4) return notify("رقم العملية", "اكتب رقم العملية كما يظهر في إشعار التحويل من بنكك.");
    if (!agreed) return notify("سياسة الخدمة", "اقرأ سياسة الخدمة ووافق عليها قبل إرسال الطلب.");
    setBusy(true);
    try {
      const r = await sheinApi.create(token, {
        product_url: cleanUrl, payment_receipt_url: receipt, payment_ref: toLatinDigits(payRef).trim(),
        accept_policy: true, policy_version: settings.policy_version,
        item_details: { title, size, color, qty, notes, unit_price_sar: unit, image_url: image || undefined },
        delivery: { name: defaultName, phone: toLatinDigits(phone), address },
      });
      notify("تم إرسال الطلب ✓", r.message);
      onDone();
    } catch (e: any) {
      if (e?.code === "POLICY_CHANGED") { setAccepted(null); notify("حُدّثت سياسة الخدمة", "راجع السياسة الجديدة ووافق عليها ثم أرسل الطلب."); onPolicyChanged(); }
      else notify("تعذّر إرسال الطلب", e?.message);
    }
    finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 14 }}>
      <NeuRaised radius={20} style={u.card}>
        <Text style={u.section}>١. المنتج</Text>
        <NeuField label="رابط المنتج من شي إن" icon="link-outline" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url"
          placeholder="https://ar.shein.com/..." error={tried && !urlOk}
          hint={url && !urlOk ? "الرابط ليس من شي إن" : urlOk ? "✓ رابط شي إن صحيح" : "من تطبيق شي إن: مشاركة ← نسخ الرابط"}
          trailing={Platform.OS !== "web" ? undefined : <TouchableOpacity onPress={paste} accessibilityLabel="لصق الرابط"><Ionicons name="clipboard-outline" size={20} color={ACCENT} /></TouchableOpacity>} />
        {urlOk ? <TouchableOpacity onPress={() => openExternal(cleanUrl)}><Text style={[u.meta, { color: ACCENT }]}>فتح المنتج للتأكد ↗</Text></TouchableOpacity> : null}
        <NeuField label="اسم المنتج (اختياري)" icon="pricetag-outline" value={title} onChangeText={setTitle} placeholder="مثال: فستان صيفي" />
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <View style={{ flex: 1 }}><NeuField label="المقاس" icon="resize-outline" value={size} onChangeText={setSize} placeholder="M / 38" /></View>
          <View style={{ flex: 1 }}><NeuField label="اللون" icon="color-palette-outline" value={color} onChangeText={setColor} placeholder="أسود" /></View>
        </View>
        <View style={{ flexDirection: "row-reverse", gap: 10, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <NeuField label="سعر القطعة (ريال سعودي)" icon="cash-outline" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" error={tried && unit <= 0} />
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={u.meta}>الكمية</Text>
            <View style={st.qty}>
              <TouchableOpacity onPress={() => setQty(q => Math.min(50, q + 1))} style={st.qtyBtn} accessibilityLabel="زيادة الكمية"><Ionicons name="add" size={18} color={ACCENT} /></TouchableOpacity>
              <Text style={st.qtyText}>{qty}</Text>
              <TouchableOpacity onPress={() => setQty(q => Math.max(1, q - 1))} style={st.qtyBtn} accessibilityLabel="إنقاص الكمية"><Ionicons name="remove" size={18} color={ACCENT} /></TouchableOpacity>
            </View>
          </View>
        </View>
        <NeuField label="ملاحظات للمشتري (اختياري)" icon="chatbox-ellipses-outline" value={notes} onChangeText={setNotes} multiline placeholder="بديل عند نفاد المقاس، تفاصيل إضافية…" />
        <ImageUploadField label="صورة المنتج (اختياري — تساعدنا على التأكد)" value={image} onChange={setImage} folder="shein" aspect={1} />
      </NeuRaised>

      <NeuRaised radius={20} style={u.card}>
        <Text style={u.section}>٢. التكلفة</Text>
        {unit > 0 ? <CostBreakdown f={fin} /> : <Text style={u.meta}>أدخل سعر القطعة لتظهر التكلفة كاملة.</Text>}
        {settings.rate_updated_at ? (
          <Text style={u.meta}><Ionicons name="time-outline" size={11} /> سعر الصرف محدَّث {new Date(settings.rate_updated_at).toLocaleDateString("ar-SD", { day: "numeric", month: "long" })}، ويُثبَّت لطلبك لحظة الإرسال.</Text>
        ) : null}
      </NeuRaised>

      <NeuRaised radius={20} style={u.card}>
        <Text style={u.section}>٣. الدفع</Text>
        {settings.bank_info ? (
          <NeuInset radius={14} style={{ padding: 12, gap: 6 }}>
            <Text style={[u.meta, { color: Colors.textPrimary, fontSize: 13, lineHeight: 22 }]} selectable>{settings.bank_info}</Text>
            <TouchableOpacity onPress={() => copyText(settings.bank_info).then(r => r === "copied" && notify("تم النسخ"))} style={{ alignSelf: "flex-start" }}>
              <Text style={[u.meta, { color: ACCENT }]}><Ionicons name="copy-outline" size={12} /> نسخ بيانات التحويل</Text>
            </TouchableOpacity>
          </NeuInset>
        ) : <Text style={u.meta}>ستظهر بيانات الحساب هنا — تواصل مع الدعم إن لم تظهر.</Text>}
        <ImageUploadField label={`إيصال التحويل${unit > 0 ? ` (${fin.total_sdg.toLocaleString("en-US")} ج.س)` : ""}`} value={receipt} onChange={setReceipt} folder="shein-receipts" aspect={9 / 16} />
        {tried && !receipt ? <Text style={[u.meta, { color: "#B42323" }]}>الإيصال مطلوب</Text> : null}
        <NeuField label="رقم العملية في إشعار التحويل" icon="receipt-outline" value={payRef} onChangeText={setPayRef} autoCapitalize="characters"
          error={tried && toLatinDigits(payRef).replace(/\s/g, "").length < 4} hint="يساعدنا على التحقق سريعاً — الإيصال الواحد لطلب واحد فقط" />
      </NeuRaised>

      <NeuRaised radius={20} style={u.card}>
        <Text style={u.section}>٤. التسليم في الحصاحيصا</Text>
        <NeuField label="رقم الهاتف للتواصل" icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <NeuField label="العنوان / أقرب معلم" icon="location-outline" value={address} onChangeText={setAddress} placeholder="الحي، الشارع، أقرب معلم" />
      </NeuRaised>

      <TouchableOpacity onPress={() => setAccepted(agreed ? null : settings.policy_version)} style={[st.agree, tried && !agreed && { borderColor: "#D93636" }]}
        accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel="أوافق على سياسة الخدمة">
        <Ionicons name={agreed ? "checkbox" : "square-outline"} size={22} color={agreed ? ACCENT : Colors.textMuted} />
        <Text style={[u.meta, { flex: 1, color: Colors.textPrimary, fontSize: 13 }]}>
          قرأت <Text style={{ color: ACCENT, fontFamily: "Cairo_700Bold" }} onPress={() => router.push({ pathname: "/shein-policy", params: { accept: "1" } } as any)}>سياسة الخدمة</Text> وأوافق عليها، بما في ذلك عدم إمكانية الإلغاء بعد شراء المنتج.
        </Text>
      </TouchableOpacity>
      <NeuButton label={busy ? "جارٍ الإرسال…" : "إرسال الطلب"} icon="send" onPress={submit} loading={busy} />
    </View>
  );
}

const st = StyleSheet.create({
  logo: { width: 58, height: 58, borderRadius: 16, backgroundColor: SHEIN, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13, letterSpacing: 1.5 },
  step: { width: "31%", flexGrow: 1, padding: 10, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, gap: 6, alignItems: "flex-end" },
  stepNum: { position: "absolute", left: 8, top: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: ACCENT },
  stepText: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 18 },
  tabs: { flexDirection: "row-reverse", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 5, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12 },
  tabOn: { backgroundColor: ACCENT },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  roleBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, borderColor: ACCENT + "50", backgroundColor: Colors.cardBg },
  roleText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: ACCENT },
  policyLink: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: ACCENT + "10" },
  agree: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.2, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  qty: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, padding: 4, marginBottom: Platform.OS === "web" ? 4 : 2 },
  qtyBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: ACCENT + "12" },
  qtyText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, minWidth: 26, textAlign: "center" },
});
