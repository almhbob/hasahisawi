// تفاصيل عرض وكالة سفر: معرض الصور، ما يشمله العرض، بطاقة الوكالة، ونموذج «اطلب الحجز» (مُعبّأ من الحساب).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet, ActivityIndicator, Modal, TextInput, Share, Linking, useWindowDimensions, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import ViewCount from "@/components/ViewCount";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { LoadError } from "@/components/ui/LoadState";
import { useAuth } from "@/lib/auth-context";
import { useViewCount } from "@/lib/views";
import { notify } from "@/lib/xplatform";
import { WEB_APP_URL } from "@/lib/invites";
import { travelApi, TRV, TRV_DEEP, TRV_SOFT, SAND, SAND_INK, SAND_SOFT, kindInfo, fmtDate, fmtPrice, routeLabel, type Offer, type RequestStatus } from "@/lib/travel";
import { KindBadge, OfferCard, StatusPill, Field, tv } from "@/components/travel/ui";

type Data = Awaited<ReturnType<typeof travelApi.offer>>;

function TravelOfferScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token, isGuest } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = Number(id);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [slide, setSlide] = useState(0);
  const [form, setForm] = useState(false);
  const views = useViewCount("travel_offer", Number.isFinite(oid) && oid > 0 ? oid : null, token);

  const load = useCallback(async () => {
    if (!oid) return setErr("العرض غير موجود");
    try { setD(await travelApi.offer(oid, token)); setErr(""); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [oid, token]);
  useEffect(() => { load(); }, [load]);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/travel", params: { tab: "offers" } } as any));

  if (err) return (
    <View style={[st.center, { paddingTop: insets.top }]}>
      <LoadError message={err} hint="ربما انتهى العرض أو أوقفته الوكالة" onRetry={load} />
      <Pressable onPress={back} style={[tv.ghost, { marginTop: 8 }]} accessibilityRole="button"><Text style={tv.ghostT}>رجوع</Text></Pressable>
    </View>
  );
  if (!d) return <View style={st.center}><ActivityIndicator color={TRV} /></View>;

  const o = d.offer;
  const k = kindInfo(o.kind);
  const price = fmtPrice(o);
  const gw = Math.min(width, 760);
  const imgs = o.images?.length ? o.images : [];
  const full = o.seats_left != null && o.seats_left <= 0;
  const blocked = full || o.status !== "active" || o.is_past;
  const mine = d.my_request && (d.my_request.status === "new" || d.my_request.status === "contacted" || d.my_request.status === "confirmed") ? d.my_request : null;

  const share = () => {
    const url = `${WEB_APP_URL}/travel-offer?id=${o.id}`;
    const msg = `${o.title}\n${routeLabel(o)}${o.depart_date ? ` · ${fmtDate(o.depart_date, true)}` : ""}\n${price ?? "السعر عند الطلب"} — ${o.agency_name}\n${url}`;
    Share.share({ message: msg, url }).catch(() => {});
  };
  const ask = () => {
    if (!token || isGuest) { notify("سجّل الدخول", "سجّل الدخول لإرسال طلب الحجز للوكالة"); router.push("/login" as any); return; }
    setForm(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* المعرض */}
        <View style={{ height: 280, backgroundColor: k.color }}>
          {imgs.length ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / gw))} style={{ width: gw }}>
              {imgs.map((u, i) => <Image key={u + i} source={{ uri: u }} style={{ width: gw, height: 280 }} resizeMode="cover" accessibilityLabel={`صورة ${i + 1} من ${imgs.length}`} />)}
            </ScrollView>
          ) : (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              <MaterialCommunityIcons name={k.icon as any} size={80} color="rgba(255,255,255,0.5)" />
            </View>
          )}
          <View style={st.galleryShade} pointerEvents="none" />
          <View style={[st.topBar, { top: insets.top + 8 }]}>
            <Pressable onPress={back} style={st.roundBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <Pressable onPress={share} style={st.roundBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="مشاركة العرض"><Ionicons name="share-social-outline" size={20} color="#fff" /></Pressable>
          </View>
          {imgs.length > 1 && (
            <View style={st.dots} accessibilityLabel={`الصورة ${slide + 1} من ${imgs.length}`}>
              {imgs.map((_, i) => <View key={i} style={[st.dot, i === slide && { backgroundColor: "#fff", width: 18 }]} />)}
            </View>
          )}
        </View>

        <View style={st.body}>
          <View style={[tv.rowR, { flexWrap: "wrap" }]}>
            <KindBadge kind={o.kind} />
            {o.is_featured && <View style={[tv.pill, { backgroundColor: SAND }]}><Ionicons name="star" size={12} color={SAND_INK} /><Text style={[tv.pillT, { color: SAND_INK }]}>عرض مميز</Text></View>}
            {o.status !== "active" && <View style={[tv.pill, { backgroundColor: Colors.danger + "18" }]}><Text style={[tv.pillT, { color: Colors.danger }]}>{o.status === "paused" ? "موقوف مؤقتاً" : "منتهي"}</Text></View>}
            <View style={{ flex: 1 }} />
            <ViewCount count={views} label />
          </View>
          <Text style={st.title}>{o.title}</Text>
          {!!routeLabel(o) && <View style={tv.rowR}><Ionicons name="location" size={16} color={TRV} /><Text style={st.route}>{routeLabel(o)}{o.country && o.destination ? ` · ${o.country}` : ""}</Text></View>}

          {/* حقائق سريعة */}
          <View style={st.facts}>
            <Fact icon="calendar-outline" label="السفر" value={o.depart_date ? fmtDate(o.depart_date, true) : "مرن"} />
            <Fact icon="return-down-back-outline" label="العودة" value={o.return_date ? fmtDate(o.return_date, true) : "—"} />
            <Fact icon="time-outline" label="المدة" value={o.duration_days ? `${o.duration_days} أيام` : "—"} />
            <Fact icon="people-outline" label="المقاعد" value={o.seats_left == null ? "متاحة" : o.seats_left > 0 ? `${o.seats_left} متبقٍ` : "مكتملة"} danger={o.seats_left != null && o.seats_left <= 5} />
          </View>

          <View style={st.priceBox}>
            <View style={{ flex: 1 }}>
              <Text style={st.priceLabel}>السعر</Text>
              <Text style={st.price}>{price ?? "السعر عند الطلب"}</Text>
              {!!o.price_note && <Text style={st.priceNote}>{o.price_note}</Text>}
            </View>
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={34} color={TRV} />
          </View>

          {mine && (
            <Pressable onPress={() => router.push({ pathname: "/travel", params: { tab: "mine" } } as any)} style={st.mine} accessibilityRole="button" accessibilityLabel="متابعة طلبي">
              <Ionicons name="checkmark-done-outline" size={20} color={TRV} />
              <Text style={[tv.meta, { flex: 1, color: Colors.text }]}>لديك طلب لهذا العرض — تابعه من «حجوزاتي»</Text>
              <StatusPill status={mine.status as RequestStatus} />
            </Pressable>
          )}

          {!!o.description && (<><Text style={st.h}>تفاصيل العرض</Text><Text style={st.desc}>{o.description}</Text></>)}

          {o.includes?.length > 0 && (
            <>
              <Text style={st.h}>يشمل العرض</Text>
              <View style={{ gap: 8 }}>
                {o.includes.map((x) => (
                  <View key={x} style={tv.rowR}>
                    <View style={st.check}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                    <Text style={[st.desc, { flex: 1 }]}>{x}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* الوكالة */}
          <Text style={st.h}>الوكالة المنظِّمة</Text>
          <Pressable onPress={() => router.push({ pathname: "/travel-agency", params: { id: String(o.agency_id) } } as any)} style={st.agency} accessibilityRole="button" accessibilityLabel={`ملف ${o.agency_name}`}>
            <View style={st.logo}>{o.agency_logo ? <Image source={{ uri: o.agency_logo }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name="airplane" size={26} color={TRV} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={[tv.title, { fontSize: 15 }]} numberOfLines={1}>{o.agency_name}</Text>
              <Text style={tv.meta}>{[o.agency_city, o.agency_license ? `ترخيص ${o.agency_license}` : "وكالة معتمدة في حصاحيصاوي"].filter(Boolean).join(" · ")}</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
          </Pressable>
          <View style={[tv.rowR, { gap: 8, marginTop: 10 }]}>
            {!!o.agency_whatsapp && (
              <Pressable onPress={() => Linking.openURL(`https://wa.me/${o.agency_whatsapp!.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`استفسار عن عرض: ${o.title}`)}`)} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="استفسار عبر واتساب">
                <Ionicons name="logo-whatsapp" size={17} color={TRV} /><Text style={tv.ghostT}>استفسار واتساب</Text>
              </Pressable>
            )}
            {!!o.agency_phone && (
              <Pressable onPress={() => Linking.openURL(`tel:${o.agency_phone}`)} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="الاتصال بالوكالة">
                <Ionicons name="call-outline" size={17} color={TRV} /><Text style={tv.ghostT}>اتصال</Text>
              </Pressable>
            )}
          </View>

          {d.is_staff && (
            <Pressable onPress={() => router.push({ pathname: "/travel-agency-portal", params: { tab: "offers" } } as any)} style={[tv.ghost, { marginTop: 14 }]} accessibilityRole="button">
              <Ionicons name="create-outline" size={17} color={TRV} /><Text style={tv.ghostT}>إدارة العرض من لوحة الوكالة</Text>
            </Pressable>
          )}
        </View>

        {d.more.length > 0 && (
          <>
            <Text style={[st.h, { paddingHorizontal: 16 }]}>عروض أخرى من الوكالة</Text>
            <RtlScrollRow contentContainerStyle={{ flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingBottom: 6 }}>
              {d.more.map((m: Offer) => <OfferCard key={m.id} o={m} compact onPress={() => router.push({ pathname: "/travel-offer", params: { id: String(m.id) } } as any)} />)}
            </RtlScrollRow>
          </>
        )}
      </ScrollView>

      {/* شريط الحجز */}
      <View style={[st.bar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.barPrice} numberOfLines={1}>{price ?? "السعر عند الطلب"}</Text>
          <Text style={tv.meta} numberOfLines={1}>{o.seats_left != null ? `${Math.max(0, o.seats_left)} مقعد متبقٍ` : o.agency_name}</Text>
        </View>
        <Pressable onPress={ask} disabled={blocked || !!mine} style={[tv.primary, { flex: 1.3 }, (blocked || !!mine) && { opacity: 0.55 }]} accessibilityRole="button"
          accessibilityLabel={mine ? "تم إرسال طلبك" : blocked ? "الحجز غير متاح" : "اطلب الحجز"} accessibilityState={{ disabled: blocked || !!mine }}>
          <MaterialCommunityIcons name={mine ? "check-circle-outline" : "send-outline"} size={18} color="#fff" />
          <Text style={tv.primaryT}>{mine ? "تم إرسال طلبك" : full ? "اكتملت المقاعد" : blocked ? "غير متاح" : "اطلب الحجز"}</Text>
        </Pressable>
      </View>

      <RequestModal visible={form} onClose={() => setForm(false)} offer={o} me={d.me} token={token}
        onDone={(msg) => { setForm(false); notify("تم إرسال طلبك", msg); load(); }} />
    </View>
  );
}

function Fact({ icon, label, value, danger }: { icon: string; label: string; value: string; danger?: boolean }) {
  return (
    <View style={st.fact}>
      <Ionicons name={icon as any} size={18} color={danger ? Colors.danger : TRV} />
      <Text style={st.factL}>{label}</Text>
      <Text style={[st.factV, danger && { color: Colors.danger }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function RequestModal({ visible, onClose, offer, me, token, onDone }: {
  visible: boolean; onClose: () => void; offer: Offer; me: { name: string; phone: string | null } | null; token: string | null; onDone: (msg: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [travellers, setTravellers] = useState(1); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setName((v) => v || me?.name || ""); setPhone((v) => v || me?.phone || ""); } }, [visible, me]);
  const max = offer.seats_left != null ? Math.max(1, Math.min(50, offer.seats_left)) : 50;
  const send = async () => {
    if (!token) return;
    if (!name.trim() || !phone.trim()) return notify("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان لتتواصل معك الوكالة");
    setBusy(true);
    try { const r = await travelApi.request(token, offer.id, { name: name.trim(), phone: phone.trim(), travellers, notes: notes.trim() || undefined }); onDone(r.message); }
    catch (e: any) { notify("تعذّر الإرسال", e?.message); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.grab} />
          <Text style={[tv.h, { fontSize: 17 }]}>طلب حجز</Text>
          <Text style={[tv.meta, { marginBottom: 12 }]} numberOfLines={2}>{offer.title} — {offer.agency_name}</Text>
          <Field label="الاسم" value={name} onChange={setName} />
          <Field label="رقم الهاتف للتواصل" value={phone} onChange={setPhone} keyboard="phone-pad" hint="ستتصل بك الوكالة على هذا الرقم لتأكيد الحجز" />
          <Text style={tv.label}>عدد المسافرين</Text>
          <View style={[tv.rowR, { gap: 14, marginBottom: 12 }]}>
            <Pressable onPress={() => setTravellers((n) => Math.min(max, n + 1))} style={st.step} accessibilityRole="button" accessibilityLabel="زيادة عدد المسافرين"><Ionicons name="add" size={22} color={TRV} /></Pressable>
            <Text style={st.stepV} accessibilityLabel={`${travellers} مسافر`}>{travellers}</Text>
            <Pressable onPress={() => setTravellers((n) => Math.max(1, n - 1))} style={st.step} accessibilityRole="button" accessibilityLabel="إنقاص عدد المسافرين"><Ionicons name="remove" size={22} color={TRV} /></Pressable>
            {offer.seats_left != null && <Text style={tv.meta}>(المتاح {offer.seats_left})</Text>}
          </View>
          <Field label="ملاحظات للوكالة (اختياري)" value={notes} onChange={setNotes} multiline placeholder="نوع الغرفة، أعمار المسافرين، موعد مفضّل…" />
          <View style={[tv.rowR, { gap: 10 }]}>
            <Pressable onPress={onClose} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button"><Text style={tv.ghostT}>إلغاء</Text></Pressable>
            <Pressable onPress={send} disabled={busy} style={[tv.primary, { flex: 2 }, busy && { opacity: 0.6 }]} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={16} color="#fff" /><Text style={tv.primaryT}>إرسال الطلب</Text></>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 20 },
  galleryShade: { position: "absolute", left: 0, right: 0, top: 0, height: 100, backgroundColor: "rgba(7,59,76,0.35)" },
  topBar: { position: "absolute", left: 14, right: 14, flexDirection: "row-reverse", justifyContent: "space-between" },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(7,59,76,0.7)", alignItems: "center", justifyContent: "center" },
  dots: { position: "absolute", bottom: 26, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.55)" },
  body: { marginTop: -18, backgroundColor: Colors.bg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 16, gap: 8 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 21, lineHeight: 32, color: Colors.text, textAlign: "right" },
  route: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "right", flexShrink: 1 },
  facts: { flexDirection: "row-reverse", gap: 8, marginTop: 6 },
  fact: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderSubtle, paddingVertical: 10, alignItems: "center", gap: 2 },
  factL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  factV: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.text },
  priceBox: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: TRV_SOFT, borderRadius: Colors.radius.lg, padding: 14, marginTop: 6 },
  priceLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 22, color: TRV, textAlign: "right" },
  priceNote: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  mine: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: SAND_SOFT, borderRadius: Colors.radius.md, padding: 12, minHeight: 44 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right", marginTop: 14, marginBottom: 6 },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 23, color: Colors.textSecondary, textAlign: "right" },
  check: { width: 22, height: 22, borderRadius: 11, backgroundColor: TRV, alignItems: "center", justifyContent: "center" },
  agency: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  logo: { width: 50, height: 50, borderRadius: 25, overflow: "hidden", backgroundColor: TRV_SOFT, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 10, backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, ...Colors.shadow.card },
  barPrice: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  sheetWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 18, maxHeight: "92%" },
  grab: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.borderSubtle, marginBottom: 10 },
  step: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: TRV + "55", alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  stepV: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, minWidth: 30, textAlign: "center" },
});

export default TravelOfferScreen;
