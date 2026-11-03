// بوابة المصمم — دخول المصمم لمتجره: الحالة، المنتجات (إضافة/تعديل/إخفاء/حذف مع الصور)، الطلبات الواردة، وإعدادات المتجر.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Image, Switch, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { notify, confirmAction } from "@/lib/xplatform";
import { uploadLibraryFile } from "@/lib/ithraa";

const ACCENT = "#3B78A6";
const DEEP = "#173F5F";
type Product = { id: number; title: string; description: string | null; category: string; price: number; images: string[]; delivery_days: number; is_active: boolean; orders_count: number; views: number };
type Shop = { id: number; shop_name: string; bio: string | null; whatsapp: string | null; instagram: string | null; facebook: string | null; status: string; package_name?: string; max_products?: number; is_unlimited?: boolean; views: number; products: Product[] };
type Order = { id: number; customer_name: string; customer_phone: string; customer_notes: string | null; status: string; created_at: string; product_title: string | null };
const CATS: [string, string][] = [["invitations", "دعوات"], ["logos", "شعارات"], ["social", "تصاميم سوشيال"], ["cards", "كروت"], ["banners", "بنرات"], ["prints", "مطبوعات"], ["other", "أخرى"]];
const ORDER_ST: Record<string, { l: string; c: string }> = { new: { l: "جديد", c: "#B7791F" }, processing: { l: "قيد التنفيذ", c: ACCENT }, done: { l: "مكتمل", c: "#0E8A5F" }, cancelled: { l: "ملغي", c: "#B42318" } };
const STATUS: Record<string, { l: string; c: string; d: string }> = {
  pending: { l: "قيد المراجعة", c: "#B7791F", d: "طلب متجرك عند الإدارة. يمكنك تجهيز بياناتك، وتظهر منتجاتك للعامة بعد التفعيل." },
  active: { l: "مفعّل", c: "#0E8A5F", d: "متجرك ظاهر في معرض التصاميم." },
  suspended: { l: "موقوف", c: "#B42318", d: "أوقفت الإدارة متجرك مؤقتاً. تواصل مع الإدارة." },
  expired: { l: "منتهٍ", c: "#7A8794", d: "انتهت مدة المتجر. تواصل مع الإدارة للتجديد." },
};

export default function DesignerPortal() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [missing, setMissing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"products" | "orders" | "settings">("products");
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const api = getApiUrl();
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${api}/api/design-gallery/my-shop`, { headers: H }).catch(() => null);
    if (r?.status === 404) { setMissing(true); return; }
    if (r?.ok) { setShop(await r.json()); setMissing(false); }
    const o = await fetch(`${api}/api/design-gallery/my-orders`, { headers: H }).then((x) => x.json()).catch(() => ({ orders: [] }));
    setOrders(o.orders || []);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/design-gallery" as any));

  if (!token) return <Center icon="log-in-outline" t="سجّل الدخول لإدارة متجرك" />;
  if (missing) return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top + 40, padding: 24, alignItems: "center", gap: 10 }}>
      <Ionicons name="color-palette-outline" size={56} color={ACCENT} />
      <Text style={st.h1}>ليس لديك متجر تصاميم بعد</Text>
      <Text style={st.muted}>انضم كمصمم من معرض التصاميم، وبعد موافقة الإدارة تدير متجرك ومنتجاتك من هنا.</Text>
      <Pressable onPress={() => router.replace("/(tabs)/design-gallery" as any)} style={st.primary}><Text style={st.primaryT}>انضم كمصمم</Text></Pressable>
    </View>
  );
  if (!shop) return <View style={[st.center]}><ActivityIndicator color={ACCENT} /></View>;
  const stt = STATUS[shop.status] || STATUS.pending;
  const newOrders = orders.filter((o) => o.status === "new").length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={[DEEP, ACCENT]} style={[st.hero, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={back} style={st.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
        <Text style={st.kicker}>بوابة المصمم</Text>
        <Text style={st.title}>{shop.shop_name}</Text>
        <View style={[st.badge, { backgroundColor: stt.c }]}><Text style={st.badgeT}>{stt.l}</Text></View>
        <Text style={st.heroSub}>{stt.d}</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
          <Stat n={shop.products.length} l={shop.is_unlimited || !shop.max_products ? "منتج" : `من ${shop.max_products} منتج`} />
          <Stat n={orders.length} l="طلب" />
          <Stat n={shop.views} l="مشاهدة" />
        </View>
      </LinearGradient>
      <View style={st.tabs}>
        {([["products", "منتجاتي"], ["orders", `الطلبات${newOrders ? ` (${newOrders})` : ""}`], ["settings", "الإعدادات"]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { backgroundColor: ACCENT }]}><Text style={[st.tabT, tab === k && { color: "#fff" }]}>{l}</Text></Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {tab === "products" && (edit ? <ProductForm p={edit} onDone={() => { setEdit(null); load(); }} /> : (
          <>
            <Pressable onPress={() => shop.status === "active" ? setEdit({ category: "invitations", price: 0, delivery_days: 3, images: [] }) : notify("المتجر غير مفعّل", "تضيف منتجاتك بعد تفعيل الإدارة لمتجرك")} style={st.add}>
              <Ionicons name="add-circle" size={20} color={ACCENT} /><Text style={st.addT}>إضافة تصميم جديد</Text>
            </Pressable>
            {shop.products.map((p) => (
              <View key={p.id} style={[st.card, !p.is_active && { opacity: 0.55 }]}>
                {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={st.thumb} /> : <View style={[st.thumb, st.thumbEmpty]}><Ionicons name="image-outline" size={24} color={Colors.textMuted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.pTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={st.muted}>{(CATS.find((c) => c[0] === p.category) || ["", p.category])[1]} · {p.price ? `${p.price.toLocaleString("ar-EG")} ج.س` : "حسب الطلب"} · {p.delivery_days} أيام</Text>
                  <Text style={st.muted}>{p.orders_count} طلب · {p.views} مشاهدة{!p.is_active ? " · مخفي" : ""}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="تعديل" hitSlop={8} onPress={() => setEdit(p)} style={st.sBtn}><Ionicons name="create-outline" size={16} color={ACCENT} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="حذف" hitSlop={8} onPress={async () => { if (await confirmAction("حذف التصميم", p.title, "حذف", true)) { await fetch(`${api}/api/design-gallery/my-products/${p.id}`, { method: "DELETE", headers: H }); load(); } }} style={st.sBtn}><Ionicons name="trash-outline" size={16} color="#B42318" /></Pressable>
                </View>
              </View>
            ))}
            {!shop.products.length && <Text style={[st.muted, { textAlign: "center", marginTop: 20 }]}>لا توجد تصاميم بعد</Text>}
          </>
        ))}

        {tab === "orders" && (
          <>
            {orders.map((o) => (
              <View key={o.id} style={[st.card, { flexDirection: "column", alignItems: "stretch" }]}>
                <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={st.pTitle}>{o.customer_name}</Text>
                  <Text style={[st.chip, { color: ORDER_ST[o.status]?.c, backgroundColor: (ORDER_ST[o.status]?.c || "#999") + "18" }]}>{ORDER_ST[o.status]?.l || o.status}</Text>
                </View>
                <Text style={st.muted}>{o.product_title || "طلب تصميم خاص"} · {new Date(o.created_at).toLocaleDateString("ar-EG")}</Text>
                {!!o.customer_notes && <Text style={st.notes}>{o.customer_notes}</Text>}
                <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <Pressable onPress={() => Linking.openURL(`https://wa.me/${o.customer_phone.replace(/\D/g, "").replace(/^0/, "249")}`)} style={[st.sBtnWide, { backgroundColor: "#128C7E" }]}><Ionicons name="logo-whatsapp" size={15} color="#fff" /><Text style={st.sBtnWideT}>تواصل</Text></Pressable>
                  {(["processing", "done", "cancelled"] as const).filter((x) => x !== o.status).map((x) => (
                    <Pressable key={x} onPress={async () => { await fetch(`${api}/api/design-gallery/my-orders/${o.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: x }) }); load(); }} style={[st.sBtnWide, { backgroundColor: ORDER_ST[x].c }]}>
                      <Text style={st.sBtnWideT}>{ORDER_ST[x].l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            {!orders.length && <Text style={[st.muted, { textAlign: "center", marginTop: 20 }]}>لا توجد طلبات بعد — يصلك إشعار فوري مع كل طلب</Text>}
          </>
        )}

        {tab === "settings" && <Settings shop={shop} onSaved={load} />}
      </ScrollView>
    </View>
  );

  function ProductForm({ p, onDone }: { p: Partial<Product>; onDone: () => void }) {
    const [f, setF] = useState({ title: p.title || "", description: p.description || "", category: p.category || "invitations", price: String(p.price ?? ""), delivery_days: String(p.delivery_days ?? 3), images: p.images || [], is_active: p.is_active !== false });
    const [busy, setBusy] = useState<string | null>(null);
    const addImage = async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      setBusy("0%");
      try { const url = await uploadLibraryFile(token!, r.assets[0], (x) => setBusy(`${x}%`)); setF((o) => ({ ...o, images: [...o.images, url].slice(0, 8) })); }
      catch (e: any) { notify("تعذّر رفع الصورة", e?.message); } finally { setBusy(null); }
    };
    const save = async () => {
      if (f.title.trim().length < 2) return notify("العنوان", "اكتب عنوان التصميم");
      const body = { ...f, title: f.title.trim(), price: Number(f.price) || 0, delivery_days: Number(f.delivery_days) || 3 };
      const r = p.id
        ? await fetch(`${api}/api/design-gallery/my-products/${p.id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) })
        : await fetch(`${api}/api/design-gallery/my-products`, { method: "POST", headers: H, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return notify("تعذّر الحفظ", d.error);
      onDone();
    };
    return (
      <View style={{ gap: 4 }}>
        <Text style={st.h2}>{p.id ? "تعديل التصميم" : "تصميم جديد"}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
          <Pressable onPress={addImage} style={[st.thumbBig, st.thumbEmpty]}>{busy ? <Text style={st.muted}>{busy}</Text> : <Ionicons name="camera-outline" size={26} color={ACCENT} />}</Pressable>
          {f.images.map((u, i) => (
            <Pressable key={u} onLongPress={() => setF({ ...f, images: f.images.filter((_, j) => j !== i) })}><Image source={{ uri: u }} style={st.thumbBig} /></Pressable>
          ))}
        </ScrollView>
        <Text style={st.muted}>اضغط مطوّلاً على صورة لحذفها · حتى 8 صور</Text>
        <Text style={st.label}>العنوان</Text><TextInput value={f.title} onChangeText={(t) => setF({ ...f, title: t })} style={st.input} />
        <Text style={st.label}>التصنيف</Text>
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
          {CATS.map(([k, l]) => <Pressable key={k} onPress={() => setF({ ...f, category: k })} style={[st.pill, f.category === k && { backgroundColor: ACCENT, borderColor: ACCENT }]}><Text style={[st.pillT, f.category === k && { color: "#fff" }]}>{l}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={st.label}>السعر (ج.س) — 0 = حسب الطلب</Text><TextInput value={f.price} onChangeText={(t) => setF({ ...f, price: t.replace(/\D/g, "") })} keyboardType="numeric" style={st.input} /></View>
          <View style={{ flex: 1 }}><Text style={st.label}>مدة التنفيذ (أيام)</Text><TextInput value={f.delivery_days} onChangeText={(t) => setF({ ...f, delivery_days: t.replace(/\D/g, "") })} keyboardType="numeric" style={st.input} /></View>
        </View>
        <Text style={st.label}>الوصف</Text><TextInput value={f.description} onChangeText={(t) => setF({ ...f, description: t })} multiline style={[st.input, { minHeight: 80, textAlignVertical: "top" }]} />
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Switch value={f.is_active} onValueChange={(v) => setF({ ...f, is_active: v })} trackColor={{ false: Colors.divider, true: ACCENT + "55" }} thumbColor={f.is_active ? ACCENT : "#999"} />
          <Text style={st.label}>ظاهر في المعرض</Text>
        </View>
        <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 12 }}>
          <Pressable onPress={save} style={[st.primary, { flex: 1 }]}><Text style={st.primaryT}>حفظ</Text></Pressable>
          <Pressable onPress={onDone} style={[st.primary, { backgroundColor: Colors.divider, paddingHorizontal: 20 }]}><Text style={[st.primaryT, { color: Colors.textPrimary }]}>إلغاء</Text></Pressable>
        </View>
      </View>
    );
  }

  function Settings({ shop, onSaved }: { shop: Shop; onSaved: () => void }) {
    const [f, setF] = useState({ shop_name: shop.shop_name, bio: shop.bio || "", whatsapp: shop.whatsapp || "", instagram: shop.instagram || "", facebook: shop.facebook || "" });
    const save = async () => {
      const r = await fetch(`${api}/api/design-gallery/my-shop`, { method: "PATCH", headers: H, body: JSON.stringify(f) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return notify("تعذّر الحفظ", d.error);
      notify("تم", "حُفظت بيانات المتجر"); onSaved();
    };
    return (
      <View>
        {([["shop_name", "اسم المتجر / الاستوديو"], ["bio", "نبذة وتخصص"], ["whatsapp", "واتساب"], ["instagram", "إنستجرام"], ["facebook", "فيسبوك"]] as const).map(([k, l]) => (
          <View key={k}><Text style={st.label}>{l}</Text><TextInput value={f[k]} onChangeText={(t) => setF({ ...f, [k]: t })} style={[st.input, k === "bio" && { minHeight: 80, textAlignVertical: "top" }]} multiline={k === "bio"} autoCapitalize="none" /></View>
        ))}
        <Pressable onPress={save} style={[st.primary, { marginTop: 16 }]}><Text style={st.primaryT}>حفظ الإعدادات</Text></Pressable>
      </View>
    );
  }
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{l}</Text></View>;
}
function Center({ icon, t }: { icon: any; t: string }) {
  return <View style={st.center}><Ionicons name={icon} size={40} color={Colors.textMuted} /><Text style={st.muted}>{t}</Text></View>;
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.8)", textAlign: "right", marginTop: 6 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff", textAlign: "right" },
  badge: { alignSelf: "flex-end", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, marginTop: 4 },
  badgeT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.85)", textAlign: "right", marginTop: 6, lineHeight: 20 },
  stat: { flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingVertical: 8 },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  tabs: { flexDirection: "row-reverse", gap: 6, padding: 12 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  add: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: ACCENT, marginBottom: 10 },
  addT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: ACCENT },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, marginBottom: 8 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbBig: { width: 96, height: 96, borderRadius: 12 },
  thumbEmpty: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  pTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  notes: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 4, backgroundColor: Colors.bg, padding: 8, borderRadius: 8 },
  chip: { fontFamily: "Cairo_700Bold", fontSize: 12, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8, overflow: "hidden" },
  sBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  sBtnWide: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  sBtnWideT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  h1: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center" },
  h2: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider },
  pillT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  primary: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
