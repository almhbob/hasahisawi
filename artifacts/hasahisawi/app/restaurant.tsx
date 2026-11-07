import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EntityNotice, useEntityStatus } from "@/components/EntityNotice";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, Share, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import ImageLightbox from "@/components/ImageLightbox";
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
  const ent = useEntityStatus("food", id);
  const [layout, setLayout] = useState<"gallery" | "list">("gallery");
  const [menuQ, setMenuQ] = useState("");
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [slide, setSlide] = useState(0);
  const { width: winW } = useWindowDimensions();

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
  const shown = useMemo(() => {
    const t = menuQ.trim();
    return (cat ? available.filter((p) => p.category === cat) : available)
      .filter((p) => !t || p.name.includes(t) || String(p.description || "").includes(t));
  }, [available, cat, menuQ]);
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
  // الإيقاف (إداري أو مؤقت) يمنع الطلب ويُظهر شاشة التنبيه
  const canOrder = biz.accepting_orders && !ent.unavailable;
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
          <View style={[st.openPill, { backgroundColor: canOrder ? Colors.primarySoft : "#EEEEEE" }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: canOrder ? "#0E9C64" : "#8A8A8A" }} />
            <Text style={[st.openTxt, { color: canOrder ? "#0B7A4E" : "#555" }]}>{canOrder ? "يستقبل الطلبات الآن" : "لا يستقبل طلبات حالياً"}</Text>
          </View>
          {ent.status && ent.unavailable ? <View style={{ alignSelf: "stretch", marginTop: 8 }}><EntityNotice status={ent.status} isOwner={ent.isOwner} /></View> : null}
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

        {/* ── المنيو ── */}
        <View style={st.menuHead}>
          <View style={{ flex: 1 }}>
            <Text style={st.menuTitle}>المنيو</Text>
            <Text style={st.menuSub}>{available.length} صنف متاح{canOrder ? " · اطلب الآن" : ""}</Text>
          </View>
          <View style={st.layoutSwitch}>
            {(["gallery", "list"] as const).map((k) => (
              <TouchableOpacity key={k} onPress={() => setLayout(k)} style={[st.layoutBtn, layout === k && { backgroundColor: c }]} accessibilityLabel={k === "gallery" ? "عرض المعرض" : "عرض القائمة"}>
                <Ionicons name={k === "gallery" ? "grid" : "list"} size={16} color={layout === k ? "#fff" : Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {available.length > 5 ? (
          <View style={st.menuSearch}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput value={menuQ} onChangeText={setMenuQ} placeholder="ابحث في المنيو…" placeholderTextColor={Colors.textMuted} style={st.menuSearchInput} textAlign="right" />
            {menuQ ? <Ionicons name="close-circle" size={16} color={Colors.textMuted} onPress={() => setMenuQ("")} /> : null}
          </View>
        ) : null}

        {cats.length > 1 ? (
          <RtlScrollRow contentContainerStyle={st.cats}>
            <TouchableOpacity onPress={() => setCat("")} style={[st.cat, cat === "" && { backgroundColor: c, borderColor: c }]}>
              <Ionicons name="restaurant" size={14} color={cat === "" ? "#fff" : c} />
              <Text style={[st.catTxt, cat === "" && { color: "#fff" }]}>الكل</Text>
              <View style={[st.catCount, cat === "" && { backgroundColor: "rgba(255,255,255,0.25)" }]}><Text style={[st.catCountTxt, cat === "" && { color: "#fff" }]}>{available.length}</Text></View>
            </TouchableOpacity>
            {cats.map((k) => (
              <TouchableOpacity key={k} onPress={() => setCat(k)} style={[st.cat, cat === k && { backgroundColor: c, borderColor: c }]}>
                <MaterialCommunityIcons name={CAT_META[k].icon as any} size={14} color={cat === k ? "#fff" : c} />
                <Text style={[st.catTxt, cat === k && { color: "#fff" }]}>{CAT_META[k].label}</Text>
                <View style={[st.catCount, cat === k && { backgroundColor: "rgba(255,255,255,0.25)" }]}><Text style={[st.catCountTxt, cat === k && { color: "#fff" }]}>{available.filter((p) => p.category === k).length}</Text></View>
              </TouchableOpacity>
            ))}
          </RtlScrollRow>
        ) : <View style={{ height: 10 }} />}

        {shown.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 36, gap: 8 }}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={42} color={Colors.textMuted} />
            <Text style={st.empty}>{menuQ ? "لا يوجد صنف بهذا الاسم" : products.length ? "لا توجد أصناف متاحة الآن." : "لم يُضف المطعم أصنافاً للمنيو بعد."}</Text>
          </View>
        ) : layout === "gallery" ? (
          <View style={st.grid}>
            {shown.map((p, i) => {
              const img = productImage(p); const q = cart[p.id] || 0;
              const cardW = (Math.min(winW, 720) - 16 * 2 - 12) / 2;
              return (
                <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 10) * 40)} style={{ width: cardW }}>
                  <Pressable onPress={() => { setDetail(p); setDetailQty(1); setSlide(0); }} style={({ pressed }) => [st.gCard, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityLabel={`${p.name} ${fmtMoney(p.price)}`}>
                    <View style={{ width: "100%", aspectRatio: 1 }}>
                      {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
                        <LinearGradient colors={[c + "30", c + "10"]} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                          <MaterialCommunityIcons name={(CAT_META[p.category]?.icon as any) || "food"} size={44} color={c} />
                        </LinearGradient>
                      )}
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} style={st.gShade} />
                      <View style={st.gPrice}><Text style={st.gPriceTxt}>{fmtMoney(p.price)}</Text></View>
                      {p.images?.length > 1 ? <View style={st.gMore}><Ionicons name="images" size={11} color="#fff" /><Text style={st.gMoreTxt}>{p.images.length}</Text></View> : null}
                      {canOrder ? (q ? (
                        <Animated.View entering={ZoomIn} style={[st.gQty, { backgroundColor: c }]}>
                          <TouchableOpacity onPress={() => add(p, -1)} hitSlop={6} accessibilityLabel="إنقاص"><Ionicons name={q === 1 ? "trash-outline" : "remove"} size={15} color="#fff" /></TouchableOpacity>
                          <Text style={st.gQtyTxt}>{q}</Text>
                          <TouchableOpacity onPress={() => add(p, 1)} hitSlop={6} accessibilityLabel="زيادة"><Ionicons name="add" size={16} color="#fff" /></TouchableOpacity>
                        </Animated.View>
                      ) : (
                        <TouchableOpacity onPress={() => add(p, 1)} style={[st.gAdd, { backgroundColor: c }]} accessibilityLabel={`أضف ${p.name}`}>
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      )) : null}
                    </View>
                    <View style={st.gBody}>
                      <Text style={st.gName} numberOfLines={1}>{p.name}</Text>
                      {p.description ? <Text style={st.gDesc} numberOfLines={2}>{p.description}</Text> : <Text style={st.gDesc}>{CAT_META[p.category]?.label}</Text>}
                      {p.prep_minutes ? <View style={st.gMeta}><Ionicons name="time-outline" size={11} color={Colors.textMuted} /><Text style={st.gMetaTxt}>{p.prep_minutes} د</Text></View> : null}
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {shown.map((p) => {
              const img = productImage(p); const q = cart[p.id] || 0;
              return (
                <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => { setDetail(p); setDetailQty(1); setSlide(0); }} style={st.item}>
                  {img ? <Image source={{ uri: img }} style={st.itemImg} /> : <View style={[st.itemImg, { backgroundColor: c + "16", alignItems: "center", justifyContent: "center" }]}><MaterialCommunityIcons name={CAT_META[p.category]?.icon as any || "food"} size={30} color={c} /></View>}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={st.itemName} numberOfLines={1}>{p.name}</Text>
                    {p.description ? <Text style={st.itemDesc} numberOfLines={2}>{p.description}</Text> : null}
                    <View style={st.itemFoot}>
                      <Text style={[st.price, { color: c }]}>{fmtMoney(p.price)}</Text>
                      {canOrder ? (q ? (
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
        )}
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

      {/* Product detail — صور قابلة للتمرير والتكبير، كمية، وإضافة للسلة */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={st.backdrop} onPress={() => setDetail(null)}>
          <Pressable style={[st.sheet, { padding: 0, overflow: "hidden", maxWidth: 620, width: "100%", alignSelf: "center" }]} onPress={(e) => e.stopPropagation()}>
            {detail ? (() => {
              const imgs = detail.images?.length ? detail.images.map((x) => x.image_url) : [];
              const sw = Math.min(winW, 620);
              return (
                <>
                  {imgs.length ? (
                    <View>
                      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / sw))}>
                        {imgs.map((u, i) => (
                          <Pressable key={i} onPress={() => setZoomUri(u)} accessibilityLabel="تكبير الصورة">
                            <Image source={{ uri: u }} style={{ width: sw, height: sw * 0.72 }} resizeMode="cover" />
                          </Pressable>
                        ))}
                      </ScrollView>
                      <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 70 }} pointerEvents="none" />
                      <TouchableOpacity onPress={() => setDetail(null)} style={[st.round, { position: "absolute", top: 12, right: 12 }]} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
                      <View style={[st.round, { position: "absolute", top: 12, left: 12 }]} pointerEvents="none"><Ionicons name="expand" size={17} color="#fff" /></View>
                      {imgs.length > 1 ? (
                        <View style={st.dots}>{imgs.map((_, i) => <View key={i} style={[st.dotI, i === slide && { width: 18, backgroundColor: "#fff" }]} />)}</View>
                      ) : null}
                    </View>
                  ) : (
                    <LinearGradient colors={[c + "35", c + "10"]} style={{ height: 150, alignItems: "center", justifyContent: "center" }}>
                      <MaterialCommunityIcons name={(CAT_META[detail.category]?.icon as any) || "food"} size={56} color={c} />
                      <TouchableOpacity onPress={() => setDetail(null)} style={[st.round, { position: "absolute", top: 12, right: 12 }]} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
                    </LinearGradient>
                  )}
                  <View style={{ padding: 18, gap: 6 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
                      <Text style={[st.sheetTitle, { flex: 1, marginBottom: 0 }]}>{detail.name}</Text>
                      <Text style={[st.price, { color: c, fontSize: 20 }]}>{fmtMoney(detail.price)}</Text>
                    </View>
                    <View style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" }}>
                      <View style={[st.fact, { flexDirection: "row-reverse", alignItems: "center", gap: 4 }]}><MaterialCommunityIcons name={(CAT_META[detail.category]?.icon as any) || "food"} size={12} color={c} /><Text style={st.factTxt}>{CAT_META[detail.category]?.label}</Text></View>
                      {detail.prep_minutes ? <View style={[st.fact, { flexDirection: "row-reverse", alignItems: "center", gap: 4 }]}><Ionicons name="time-outline" size={12} color={Colors.textMuted} /><Text style={st.factTxt}>التحضير {detail.prep_minutes} دقيقة</Text></View> : null}
                    </View>
                    {detail.description ? <Text style={[st.desc, { textAlign: "right" }]}>{detail.description}</Text> : null}
                    {canOrder ? (
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 12 }}>
                        <View style={st.qtyBox}>
                          <TouchableOpacity onPress={() => setDetailQty((n) => Math.min(n + 1, detail.stock ?? 99))} style={[st.stepBtn, { backgroundColor: c }]} accessibilityLabel="زيادة"><Ionicons name="add" size={16} color="#fff" /></TouchableOpacity>
                          <Text style={[st.stepNum, { fontSize: 17 }]}>{detailQty}</Text>
                          <TouchableOpacity onPress={() => setDetailQty((n) => Math.max(1, n - 1))} style={[st.stepBtn, { backgroundColor: Colors.bgDeep }]} accessibilityLabel="إنقاص"><Ionicons name="remove" size={16} color={Colors.textPrimary} /></TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => { add(detail, detailQty); setDetail(null); }} style={[st.addBig, { backgroundColor: c }]}>
                          <Ionicons name="cart" size={17} color="#fff" />
                          <Text style={st.addTxt}>أضف للسلة · {fmtMoney(detail.price * detailQty)}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : <Text style={[st.muted, { marginTop: 8 }]}>المطعم لا يستقبل الطلبات حالياً</Text>}
                    <View style={{ height: 8 }} />
                  </View>
                </>
              );
            })() : null}
          </Pressable>
        </Pressable>
      </Modal>
      <ImageLightbox uri={zoomUri} onClose={() => setZoomUri(null)} title={detail?.name || "صورة الصنف"} />

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
  menuHead: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, marginTop: 20, gap: 10 },
  menuTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "right" },
  menuSub: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  layoutSwitch: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  layoutBtn: { width: 34, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  menuSearch: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  menuSearchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, paddingVertical: 9, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  catCount: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  catCountTxt: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: Colors.textSecondary },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, maxWidth: 720, alignSelf: "center", width: "100%" },
  gCard: { backgroundColor: Colors.cardBg, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.05)", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  gShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  gPrice: { position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  gPriceTxt: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#1A2C25" },
  gMore: { position: "absolute", top: 8, right: 8, flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  gMoreTxt: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff" },
  gAdd: { position: "absolute", bottom: 8, left: 8, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  gQty: { position: "absolute", bottom: 8, left: 8, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderRadius: 18, paddingHorizontal: 10, height: 34, borderWidth: 2, borderColor: "#fff" },
  gQtyTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", minWidth: 14, textAlign: "center" },
  gBody: { padding: 10, gap: 2 },
  gName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  gDesc: { fontFamily: "Cairo_400Regular", fontSize: 11.5, lineHeight: 17, color: Colors.textMuted, textAlign: "right", minHeight: 17 },
  gMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  gMetaTxt: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },
  dots: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row-reverse", gap: 5 },
  dotI: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.55)" },
  qtyBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.bg, borderRadius: 14, padding: 6 },
  addBig: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: 16 },
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
  cartBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: Colors.bg + "F5" },
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
