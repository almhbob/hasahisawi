// لوحة وكالة السفر — لمالك الوكالة المعتمدة وفريقها حسب الصلاحيات:
// العروض (نشر/تعديل/إيقاف/حذف)، الطلبات (مسار الحالة + اتصال/واتساب + ملاحظة)، ملف الوكالة، والفريق.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Image, Linking, Modal, Switch, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import {
  travelApi, TRV, TRV_DEEP, TRV_SOFT, SAND, SAND_INK, SAND_SOFT, TRV_GRADIENT, OFFER_KINDS, CURRENCIES, INCLUDE_SUGGESTIONS, REQUEST_STATUS,
  kindInfo, fmtDate, fmtPrice, routeLabel, type Offer, type OfferRequest, type PortalMe, type PortalPerm, type RequestStatus, type StaffMember, type Agency,
} from "@/lib/travel";
import { Chip, StatusPill, KindBadge, EmptyState, Field, ImagesField, DateField, tv } from "@/components/travel/ui";

type Tab = "offers" | "requests" | "profile" | "team";
const TABS: { key: Tab; label: string; icon: string; perm: PortalPerm }[] = [
  { key: "offers", label: "العروض", icon: "tag-multiple-outline", perm: "offers" },
  { key: "requests", label: "الطلبات", icon: "clipboard-text-outline", perm: "requests" },
  { key: "profile", label: "ملف الوكالة", icon: "office-building-cog-outline", perm: "profile" },
  { key: "team", label: "الفريق", icon: "account-group-outline", perm: "staff" },
];
const tel = (p?: string | null) => p && Linking.openURL(`tel:${p}`);
const wa = (p?: string | null, text = "") => p && Linking.openURL(`https://wa.me/${p.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`);

function TravelAgencyPortal() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.key === params.tab) ? params.tab : "offers") as Tab);

  const load = useCallback(async () => {
    if (!token) return;
    try { setMe(await travelApi.portal(token)); setErr(""); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (params.tab && TABS.some((t) => t.key === params.tab)) setTab(params.tab as Tab); }, [params.tab]);
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/travel", params: { tab: "agencies" } } as any));

  if (!token || isGuest) return <Center icon="lock-closed-outline" text="سجّل الدخول للوصول إلى لوحة الوكالة" onBack={back} />;
  if (err) return <Center icon="alert-circle-outline" text={err} onBack={back} />;
  if (!me) return <View style={st.center}><ActivityIndicator color={TRV} /></View>;
  if (!me.agency) {
    return (
      <Center icon="airplane-outline" text={me.application && me.application.status !== "approved"
        ? `طلب «${me.application.agency_name}» قيد مراجعة الإدارة. ستفتح اللوحة تلقائياً بعد الاعتماد.`
        : "هذه اللوحة لفريق وكالة سفر معتمدة. سجّل وكالتك أو اطلب من مالك الوكالة إضافتك للفريق."} onBack={back}>
        <Pressable style={[tv.primary, { marginTop: 14, paddingHorizontal: 22 }]} onPress={() => router.replace({ pathname: "/travel", params: { tab: "agencies" } } as any)} accessibilityRole="button">
          <Text style={tv.primaryT}>دليل الوكالات والتسجيل</Text>
        </Pressable>
      </Center>
    );
  }
  const a = me.agency;
  const perms = me.perms || [];
  const tabs = TABS.filter((t) => perms.includes(t.perm));
  const cur = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ModernHeader title={a.name} subtitle={`لوحة الوكالة · ${me.role_label}`} icon="airplane-outline" gradient={TRV_GRADIENT} showBack onBack={back}
        rightSlot={
          <Pressable onPress={() => router.push({ pathname: "/travel-agency", params: { id: String(a.id) } } as any)} style={st.hBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="عرض الملف العام">
            <Ionicons name="eye-outline" size={18} color="#fff" />
          </Pressable>
        }>
        <View style={st.kpis}>
          <Kpi n={me.counts?.active_offers ?? 0} l="عرض نشط" />
          <Kpi n={me.counts?.new_requests ?? 0} l="طلب جديد" hot={!!me.counts?.new_requests} />
          <Kpi n={me.counts?.confirmed_requests ?? 0} l="حجز مؤكد" />
        </View>
      </ModernHeader>
      <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        {tabs.map((t) => (
          <Chip key={t.key} label={t.label} icon={t.icon} active={cur === t.key} onPress={() => setTab(t.key)}
            count={t.key === "requests" ? me.counts?.new_requests : undefined} />
        ))}
      </RtlScrollRow>
      <View style={{ flex: 1 }}>
        {cur === "offers" && <OffersTab onChanged={load} />}
        {cur === "requests" && <RequestsTab onChanged={load} />}
        {cur === "profile" && <ProfileTab agency={a} onSaved={load} />}
        {cur === "team" && <TeamTab />}
      </View>
    </View>
  );
}

function Kpi({ n, l, hot }: { n: number; l: string; hot?: boolean }) {
  return (
    <View style={[st.kpi, hot && { backgroundColor: SAND }]}>
      <Text style={[st.kpiN, hot && { color: SAND_INK }]}>{n}</Text>
      <Text style={[st.kpiL, hot && { color: SAND_INK }]}>{l}</Text>
    </View>
  );
}
function Center({ icon, text, onBack, children }: { icon: string; text: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <View style={st.center}>
      <View style={st.centerIcon}><Ionicons name={icon as any} size={36} color={TRV} /></View>
      <Text style={[tv.meta, { textAlign: "center", marginTop: 10, fontSize: 14, lineHeight: 22 }]}>{text}</Text>
      {children}
      <Pressable onPress={onBack} style={[tv.ghost, { marginTop: 10 }]} accessibilityRole="button"><Text style={tv.ghostT}>رجوع</Text></Pressable>
    </View>
  );
}

// ═══ العروض ═════════════════════════════════════════════════════
const STATUS_LABEL: Record<string, { l: string; c: string }> = { active: { l: "منشور", c: "#15803D" }, paused: { l: "موقوف", c: "#8A6100" }, expired: { l: "منتهي", c: "#B42318" } };

function OffersTab({ onChanged }: { onChanged: () => void }) {
  const { token } = useAuth();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [edit, setEdit] = useState<Offer | "new" | null>(null);
  const load = useCallback(async () => { if (token) try { setOffers((await travelApi.portalOffers(token)).offers); } catch (e: any) { notify("تعذّر التحميل", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); onChanged(); };

  const toggle = async (o: Offer) => {
    if (!token) return;
    try { await travelApi.offerStatus(token, o.id, o.status === "active" ? "paused" : "active"); refresh(); } catch (e: any) { notify("تعذّر التحديث", e?.message); }
  };
  const del = async (o: Offer) => {
    if (!token || !(await confirmAction("حذف العرض", `حذف «${o.title}» نهائياً؟`, "حذف", true))) return;
    try { await travelApi.deleteOffer(token, o.id); refresh(); } catch (e: any) { notify("تعذّر الحذف", e?.message); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 60, gap: 12 }}>
      <Pressable onPress={() => setEdit("new")} style={tv.primary} accessibilityRole="button" accessibilityLabel="نشر عرض جديد">
        <Ionicons name="add-circle-outline" size={20} color="#fff" /><Text style={tv.primaryT}>نشر عرض جديد</Text>
      </Pressable>
      {offers === null ? <ActivityIndicator color={TRV} style={{ marginTop: 20 }} /> : offers.length === 0 ? (
        <EmptyState icon="tag-plus-outline" title="لم تنشر أي عرض بعد" hint="انشر عروض العمرة والطيران والرحلات لتظهر لكل مستخدمي التطبيق" />
      ) : offers.map((o) => {
        const k = kindInfo(o.kind); const sl = STATUS_LABEL[o.status] ?? STATUS_LABEL.active;
        return (
          <View key={o.id} style={[st.card, o.status !== "active" && { opacity: 0.85 }]}>
            <View style={[tv.rowR, { alignItems: "flex-start", gap: 10 }]}>
              <View style={[st.thumb, { backgroundColor: k.color }]}>
                {o.images?.[0] ? <Image source={{ uri: o.images[0] }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name={k.icon as any} size={26} color="#fff" />}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={[tv.rowR, { flexWrap: "wrap" }]}>
                  <KindBadge kind={o.kind} />
                  <View style={[tv.pill, { backgroundColor: sl.c + "18" }]}><Text style={[tv.pillT, { color: sl.c }]}>{o.is_past && o.status === "active" ? "انتهى موعده" : sl.l}</Text></View>
                  {o.is_featured && <Ionicons name="star" size={14} color="#8A6100" accessibilityLabel="مميز" />}
                </View>
                <Text style={[tv.title, { fontSize: 14.5 }]} numberOfLines={2}>{o.title}</Text>
                <Text style={tv.meta} numberOfLines={1}>{[routeLabel(o), o.depart_date ? fmtDate(o.depart_date, true) : "", fmtPrice(o) ?? "السعر عند الطلب"].filter(Boolean).join(" · ")}</Text>
              </View>
            </View>
            <View style={st.statsRow}>
              <MiniStat icon="eye-outline" v={o.views ?? 0} l="مشاهدة" />
              <MiniStat icon="document-text-outline" v={o.requests_count ?? 0} l="طلب" />
              <MiniStat icon="sparkles-outline" v={o.new_requests ?? 0} l="جديد" hot={!!o.new_requests} />
              <MiniStat icon="people-outline" v={o.seats_left ?? "—"} l="مقعد متبقٍ" />
            </View>
            <View style={[tv.rowR, { gap: 8 }]}>
              <Pressable onPress={() => setEdit(o)} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={`تعديل ${o.title}`}><Ionicons name="create-outline" size={16} color={TRV} /><Text style={tv.ghostT}>تعديل</Text></Pressable>
              <Pressable onPress={() => toggle(o)} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={o.status === "active" ? "إيقاف العرض" : "إعادة نشر العرض"}>
                <Ionicons name={o.status === "active" ? "pause-circle-outline" : "play-circle-outline"} size={16} color={TRV} /><Text style={tv.ghostT}>{o.status === "active" ? "إيقاف" : "نشر"}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: "/travel-offer", params: { id: String(o.id) } } as any)} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel="معاينة العرض"><Ionicons name="eye-outline" size={16} color={TRV} /></Pressable>
              <Pressable onPress={() => del(o)} style={[tv.ghost, st.act, { borderColor: Colors.danger + "55" }]} accessibilityRole="button" accessibilityLabel="حذف العرض"><Ionicons name="trash-outline" size={16} color={Colors.danger} /></Pressable>
            </View>
          </View>
        );
      })}
      <OfferEditor offer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />
    </ScrollView>
  );
}
function MiniStat({ icon, v, l, hot }: { icon: string; v: number | string; l: string; hot?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }} accessibilityLabel={`${v} ${l}`}>
      <View style={tv.rowR}><Ionicons name={icon as any} size={14} color={hot ? "#8A6100" : TRV} /><Text style={[st.msV, hot && { color: "#8A6100" }]}>{v}</Text></View>
      <Text style={st.msL}>{l}</Text>
    </View>
  );
}

const blankOffer = { kind: "umrah", title: "", from_city: "", destination: "", country: "", depart_date: "", return_date: "", duration_days: "", price: "", currency: "SDG", price_note: "", seats: "", includes: [] as string[], images: [] as string[], description: "", is_featured: false };

function OfferEditor({ offer, onClose, onSaved }: { offer: Offer | "new" | null; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [f, setF] = useState(blankOffer);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!offer) return;
    if (offer === "new") { setF(blankOffer); return; }
    setF({
      kind: offer.kind, title: offer.title, from_city: offer.from_city || "", destination: offer.destination || "", country: offer.country || "",
      depart_date: offer.depart_date || "", return_date: offer.return_date || "", duration_days: offer.duration_days ? String(offer.duration_days) : "",
      price: offer.price != null ? String(offer.price) : "", currency: offer.currency || "SDG", price_note: offer.price_note || "", seats: offer.seats ? String(offer.seats) : "",
      includes: offer.includes || [], images: offer.images || [], description: offer.description || "", is_featured: !!offer.is_featured,
    });
  }, [offer]);
  const set = (k: keyof typeof blankOffer) => (v: any) => setF((p) => ({ ...p, [k]: v }));
  const toggleInc = (x: string) => setF((p) => ({ ...p, includes: p.includes.includes(x) ? p.includes.filter((i) => i !== x) : [...p.includes, x] }));
  const addExtra = () => { const t = extra.trim(); if (t && !f.includes.includes(t)) setF((p) => ({ ...p, includes: [...p.includes, t] })); setExtra(""); };
  // المدة تُحسب تلقائياً من التاريخين
  useEffect(() => {
    if (f.depart_date && f.return_date && f.return_date >= f.depart_date) {
      const days = Math.round((Date.parse(f.return_date) - Date.parse(f.depart_date)) / 86400000) + 1;
      setF((p) => (p.duration_days ? p : { ...p, duration_days: String(days) }));
    }
  }, [f.depart_date, f.return_date]);

  const save = async () => {
    if (!token) return;
    if (f.title.trim().length < 3) return notify("بيانات ناقصة", "اكتب عنواناً واضحاً للعرض");
    setBusy(true);
    try {
      const r = await travelApi.saveOffer(token, { ...f, duration_days: f.duration_days || null, price: f.price || null, seats: f.seats || null }, offer && offer !== "new" ? offer.id : undefined);
      notify(offer === "new" ? "تم النشر" : "تم الحفظ", r.message || "حُفظت تعديلات العرض");
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!offer} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={[st.edHead, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onClose} style={st.hBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color="#fff" /></Pressable>
          <Text style={st.edTitle}>{offer === "new" ? "عرض جديد" : "تعديل العرض"}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Text style={tv.label}>نوع العرض</Text>
          <View style={[tv.rowR, { flexWrap: "wrap", gap: 8, marginBottom: 12 }]}>
            {OFFER_KINDS.map((k) => <Chip key={k.key} label={k.label} icon={k.icon} color={k.color} active={f.kind === k.key} onPress={() => set("kind")(k.key)} />)}
          </View>
          <Field label="عنوان العرض *" value={f.title} onChange={set("title")} placeholder="مثال: عمرة رجب 15 يوماً" />
          <View style={st.two}>
            <View style={{ flex: 1 }}><Field label="من" value={f.from_city} onChange={set("from_city")} placeholder="الخرطوم" /></View>
            <View style={{ flex: 1 }}><Field label="إلى / الوجهة" value={f.destination} onChange={set("destination")} placeholder="مكة المكرمة" /></View>
          </View>
          <Field label="الدولة" value={f.country} onChange={set("country")} placeholder="السعودية" />
          <View style={st.two}>
            <DateField label="تاريخ السفر" value={f.depart_date} onChange={set("depart_date")} />
            <DateField label="تاريخ العودة" value={f.return_date} onChange={set("return_date")} min={f.depart_date || undefined} />
          </View>
          <View style={st.two}>
            <View style={{ flex: 1 }}><Field label="المدة (أيام)" value={f.duration_days} onChange={set("duration_days")} keyboard="numeric" /></View>
            <View style={{ flex: 1 }}><Field label="عدد المقاعد" value={f.seats} onChange={set("seats")} keyboard="numeric" hint="اتركه فارغاً إن لم يكن محدوداً" /></View>
          </View>
          <View style={st.two}>
            <View style={{ flex: 1.4 }}><Field label="السعر" value={f.price} onChange={set("price")} keyboard="numeric" hint="فارغ = «السعر عند الطلب»" /></View>
            <View style={{ flex: 1 }}>
              <Text style={tv.label}>العملة</Text>
              <View style={[tv.rowR, { flexWrap: "wrap", gap: 6 }]}>
                {CURRENCIES.map((c) => (
                  <Pressable key={c.key} onPress={() => set("currency")(c.key)} style={[st.cur, f.currency === c.key && { backgroundColor: TRV, borderColor: TRV }]} accessibilityRole="radio" accessibilityState={{ checked: f.currency === c.key }} accessibilityLabel={c.key}>
                    <Text style={[st.curT, f.currency === c.key && { color: "#fff" }]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <Field label="ملاحظة السعر" value={f.price_note} onChange={set("price_note")} placeholder="للفرد في غرفة رباعية" />
          <Text style={tv.label}>يشمل العرض</Text>
          <View style={[tv.rowR, { flexWrap: "wrap", gap: 6, marginBottom: 8 }]}>
            {[...new Set([...INCLUDE_SUGGESTIONS, ...f.includes])].map((x) => {
              const on = f.includes.includes(x);
              return (
                <Pressable key={x} onPress={() => toggleInc(x)} style={[st.inc, on && { backgroundColor: TRV_SOFT, borderColor: TRV }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={x}>
                  <Ionicons name={on ? "checkmark-circle" : "add-circle-outline"} size={15} color={on ? TRV : Colors.textMuted} />
                  <Text style={[st.incT, on && { color: TRV }]}>{x}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[tv.rowR, { gap: 8, marginBottom: 12 }]}>
            <TextInput value={extra} onChangeText={setExtra} onSubmitEditing={addExtra} placeholder="أضف بنداً آخر…" placeholderTextColor={Colors.textMuted} style={[tv.input, { flex: 1 }]} accessibilityLabel="بند إضافي" />
            <Pressable onPress={addExtra} style={[tv.primary, { width: 48, paddingHorizontal: 0 }]} accessibilityRole="button" accessibilityLabel="إضافة البند"><Ionicons name="add" size={22} color="#fff" /></Pressable>
          </View>
          <ImagesField label="صور العرض (الأولى غلاف)" value={f.images} onChange={set("images")} max={8} />
          <Field label="التفاصيل" value={f.description} onChange={set("description")} multiline placeholder="البرنامج اليومي، الفنادق، شروط الحجز والإلغاء…" />
          <View style={[tv.rowR, { justifyContent: "space-between", backgroundColor: SAND_SOFT, borderRadius: Colors.radius.md, padding: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[tv.h, { fontSize: 14 }]}>إبراز كعرض مميز</Text>
              <Text style={tv.meta}>يظهر في أعلى عروض الوكالات</Text>
            </View>
            <Switch value={f.is_featured} onValueChange={set("is_featured")} trackColor={{ true: TRV, false: Colors.borderSubtle }} accessibilityLabel="إبراز كعرض مميز" />
          </View>
        </ScrollView>
        <View style={[st.edFoot, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={onClose} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button"><Text style={tv.ghostT}>إلغاء</Text></Pressable>
          <Pressable onPress={save} disabled={busy} style={[tv.primary, { flex: 2 }, busy && { opacity: 0.6 }]} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={tv.primaryT}>{offer === "new" ? "نشر العرض" : "حفظ التعديلات"}</Text></>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ═══ الطلبات ════════════════════════════════════════════════════
const PIPELINE: RequestStatus[] = ["new", "contacted", "confirmed", "cancelled"];

function RequestsTab({ onChanged }: { onChanged: () => void }) {
  const { token } = useAuth();
  const [filter, setFilter] = useState<RequestStatus | "">("");
  const [items, setItems] = useState<OfferRequest[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    try { const d = await travelApi.portalRequests(token, filter || undefined); setItems(d.requests); setCounts(d.counts); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [token, filter]);
  useEffect(() => { load(); }, [load]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={TRV} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Chip label="الكل" active={!filter} onPress={() => setFilter("")} count={total} />
        {PIPELINE.map((s) => <Chip key={s} label={REQUEST_STATUS[s].label} color={REQUEST_STATUS[s].color} active={filter === s} onPress={() => setFilter(s)} count={counts[s]} />)}
      </RtlScrollRow>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {items === null ? <ActivityIndicator color={TRV} style={{ marginTop: 20 }} /> : items.length === 0 ? (
          <EmptyState icon="inbox-outline" title={filter ? "لا توجد طلبات بهذه الحالة" : "لا توجد طلبات حجز بعد"} hint="تصلك الطلبات هنا مع إشعار فور إرسالها من المستخدمين" />
        ) : items.map((r) => <RequestCard key={r.id} r={r} onChanged={() => { load(); onChanged(); }} />)}
      </View>
    </ScrollView>
  );
}

function RequestCard({ r, onChanged }: { r: OfferRequest; onChanged: () => void }) {
  const { token } = useAuth();
  const [note, setNote] = useState(r.agency_note || "");
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (status?: RequestStatus) => {
    if (!token) return;
    if (status === "cancelled" && !(await confirmAction("إلغاء الطلب", "سيُبلَّغ العميل باعتذار الوكالة. متابعة؟", "إلغاء الطلب", true))) return;
    setBusy(status || "note");
    try { await travelApi.updateRequest(token, r.id, { ...(status ? { status } : {}), agency_note: note }); onChanged(); }
    catch (e: any) { notify("تعذّر التحديث", e?.message); } finally { setBusy(null); }
  };
  const step = PIPELINE.indexOf(r.status);
  return (
    <View style={[st.card, r.status === "new" && { borderColor: TRV, borderWidth: 1.5 }]}>
      <View style={[tv.rowR, { alignItems: "flex-start", gap: 10 }]}>
        <UserAvatar name={r.name} avatarUrl={r.avatar_url || undefined} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[tv.title, { fontSize: 15 }]}>{r.name}</Text>
          <Text style={tv.meta} numberOfLines={2}>{r.offer_title}</Text>
          <Text style={tv.meta}>{r.travellers} مسافر · {r.phone} · {new Date(r.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</Text>
        </View>
        <StatusPill status={r.status} />
      </View>
      {!!r.notes && <View style={st.noteBox}><Ionicons name="chatbox-outline" size={15} color={TRV} /><Text style={st.noteT}>{r.notes}</Text></View>}

      {/* مسار الحالة */}
      <View style={st.pipe} accessibilityLabel={`مرحلة الطلب: ${REQUEST_STATUS[r.status].label}`}>
        {(["new", "contacted", "confirmed"] as RequestStatus[]).map((s, i) => {
          const done = r.status !== "cancelled" && step >= i;
          return (
            <React.Fragment key={s}>
              {i > 0 && <View style={[st.pipeLine, done && { backgroundColor: TRV }]} />}
              <View style={{ alignItems: "center", gap: 2 }}>
                <View style={[st.pipeDot, done && { backgroundColor: TRV, borderColor: TRV }]}>{done && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
                <Text style={[st.pipeT, done && { color: TRV }]}>{REQUEST_STATUS[s].label}</Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة للعميل (تصله مع الإشعار)…" placeholderTextColor={Colors.textMuted} style={[tv.input, { marginTop: 4 }]} accessibilityLabel="ملاحظة الوكالة" />
      <View style={[tv.rowR, { gap: 8, marginTop: 8, flexWrap: "wrap" }]}>
        <Pressable onPress={() => tel(r.phone)} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={`اتصال بـ ${r.name}`}><Ionicons name="call-outline" size={16} color={TRV} /><Text style={tv.ghostT}>اتصال</Text></Pressable>
        <Pressable onPress={() => wa(r.phone, `مرحباً ${r.name}، بخصوص طلبك «${r.offer_title}»`)} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={`واتساب ${r.name}`}><Ionicons name="logo-whatsapp" size={16} color={TRV} /><Text style={tv.ghostT}>واتساب</Text></Pressable>
        {note !== (r.agency_note || "") && (
          <Pressable onPress={() => update()} style={[tv.ghost, st.act]} accessibilityRole="button">{busy === "note" ? <ActivityIndicator color={TRV} /> : <Text style={tv.ghostT}>حفظ الملاحظة</Text>}</Pressable>
        )}
      </View>
      {r.status !== "cancelled" && r.status !== "confirmed" && (
        <View style={[tv.rowR, { gap: 8, marginTop: 8 }]}>
          {r.status === "new" && (
            <Pressable onPress={() => update("contacted")} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button">{busy === "contacted" ? <ActivityIndicator color={TRV} /> : <Text style={tv.ghostT}>تم التواصل</Text>}</Pressable>
          )}
          <Pressable onPress={() => update("confirmed")} style={[tv.primary, { flex: 1 }]} accessibilityRole="button">{busy === "confirmed" ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={17} color="#fff" /><Text style={tv.primaryT}>تأكيد</Text></>}</Pressable>
          <Pressable onPress={() => update("cancelled")} style={[tv.ghost, { flex: 0.8, borderColor: Colors.danger + "55" }]} accessibilityRole="button">{busy === "cancelled" ? <ActivityIndicator color={Colors.danger} /> : <Text style={[tv.ghostT, { color: Colors.danger }]}>اعتذار</Text>}</Pressable>
        </View>
      )}
      {r.status === "confirmed" && (
        <Pressable onPress={() => update("cancelled")} style={[tv.ghost, { marginTop: 8, borderColor: Colors.danger + "55" }]} accessibilityRole="button"><Text style={[tv.ghostT, { color: Colors.danger }]}>إلغاء الحجز وتحرير المقاعد</Text></Pressable>
      )}
    </View>
  );
}

// ═══ ملف الوكالة ════════════════════════════════════════════════
function ProfileTab({ agency, onSaved }: { agency: Agency; onSaved: () => void }) {
  const { token } = useAuth();
  const list = (v?: string[] | null) => (v || []).join("، ");
  const [f, setF] = useState({
    name: agency.name || "", description: agency.description || "", phone: agency.phone || "", whatsapp: agency.whatsapp || "", email: agency.email || "",
    address: agency.address || "", city: agency.city || "", license_number: agency.license_number || "", website: agency.website || "",
    services_offered: list(agency.services_offered), destinations: list(agency.destinations),
  });
  const [logo, setLogo] = useState<string[]>(agency.logo_url ? [agency.logo_url] : []);
  const [cover, setCover] = useState<string[]>(agency.cover_url ? [agency.cover_url] : []);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!token) return;
    setBusy(true);
    try { await travelApi.saveAgency(token, { ...f, logo_url: logo[0] || null, cover_url: cover[0] || null }); notify("تم الحفظ", "حُدّث ملف الوكالة"); onSaved(); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={st.two}>
        <View style={{ flex: 1 }}><ImagesField label="الشعار" value={logo} onChange={setLogo} max={1} /></View>
        <View style={{ flex: 1 }}><ImagesField label="صورة الغلاف" value={cover} onChange={setCover} max={1} /></View>
      </View>
      <Field label="اسم الوكالة" value={f.name} onChange={set("name")} />
      <Field label="نبذة" value={f.description} onChange={set("description")} multiline />
      <View style={st.two}>
        <View style={{ flex: 1 }}><Field label="الهاتف" value={f.phone} onChange={set("phone")} keyboard="phone-pad" /></View>
        <View style={{ flex: 1 }}><Field label="واتساب" value={f.whatsapp} onChange={set("whatsapp")} keyboard="phone-pad" /></View>
      </View>
      <Field label="البريد الإلكتروني" value={f.email} onChange={set("email")} keyboard="email-address" />
      <View style={st.two}>
        <View style={{ flex: 1 }}><Field label="المدينة" value={f.city} onChange={set("city")} /></View>
        <View style={{ flex: 1 }}><Field label="رقم الترخيص" value={f.license_number} onChange={set("license_number")} /></View>
      </View>
      <Field label="العنوان" value={f.address} onChange={set("address")} placeholder="الشارع، الحي، المعلم القريب" />
      <Field label="الخدمات المقدمة (افصل بفاصلة)" value={f.services_offered} onChange={set("services_offered")} placeholder="تذاكر طيران، تأشيرات، عمرة" />
      <Field label="الوجهات (افصل بفاصلة)" value={f.destinations} onChange={set("destinations")} placeholder="القاهرة، جدة، دبي" />
      <Field label="الموقع الإلكتروني" value={f.website} onChange={set("website")} />
      <Pressable onPress={save} disabled={busy} style={[tv.primary, busy && { opacity: 0.6 }]} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={tv.primaryT}>حفظ الملف</Text></>}
      </Pressable>
    </ScrollView>
  );
}

// ═══ الفريق ═════════════════════════════════════════════════════
function TeamTab() {
  const { token, user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; avatar_url: string | null }[]>([]);
  const load = useCallback(async () => { if (token) try { setStaff((await travelApi.staff(token)).staff); } catch (e: any) { notify("تعذّر التحميل", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!token || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => travelApi.lookup(token, q.trim()).then((d) => setFound(d.users)).catch(() => setFound([])), 350);
    return () => clearTimeout(t);
  }, [q, token]);
  const add = async (uid: number, role: "manager" | "agent") => {
    if (!token) return;
    try { await travelApi.setStaff(token, uid, role); setQ(""); setFound([]); load(); } catch (e: any) { notify("تعذّر الإضافة", e?.message); }
  };
  const remove = async (m: StaffMember) => {
    if (!token || !(await confirmAction("إزالة من الفريق", `إزالة ${m.name} من فريق الوكالة؟`, "إزالة", true))) return;
    try { await travelApi.removeStaff(token, m.user_id); load(); } catch (e: any) { notify("تعذّر الإزالة", e?.message); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 60, gap: 10 }} keyboardShouldPersistTaps="handled">
      <View style={[st.card, { backgroundColor: TRV_SOFT, borderColor: "transparent" }]}>
        <Text style={[tv.h, { fontSize: 14 }]}>صلاحيات الأدوار</Text>
        <Text style={tv.meta}>المدير: العروض والطلبات وملف الوكالة · موظف الحجوزات: الطلبات فقط · المالك: كل شيء والفريق</Text>
      </View>
      <Field label="أضف عضواً بالاسم أو رقم الهاتف" value={q} onChange={setQ} placeholder="مثال: 0912…" />
      {found.map((u) => (
        <View key={u.id} style={[st.card, tv.rowR, { gap: 10 }]}>
          <UserAvatar name={u.name} avatarUrl={u.avatar_url || undefined} size={40} />
          <Text style={[tv.title, { flex: 1, fontSize: 14 }]} numberOfLines={1}>{u.name}</Text>
          <Pressable onPress={() => add(u.id, "agent")} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={`إضافة ${u.name} موظف حجوزات`}><Text style={tv.ghostT}>موظف</Text></Pressable>
          <Pressable onPress={() => add(u.id, "manager")} style={[tv.primary, st.act]} accessibilityRole="button" accessibilityLabel={`إضافة ${u.name} مديراً`}><Text style={tv.primaryT}>مدير</Text></Pressable>
        </View>
      ))}
      <Text style={[tv.h, { marginTop: 8 }]}>أعضاء الفريق</Text>
      {staff === null ? <ActivityIndicator color={TRV} /> : staff.map((m) => (
        <View key={m.user_id} style={[st.card, tv.rowR, { gap: 10 }]}>
          <UserAvatar name={m.name} avatarUrl={m.avatar_url || undefined} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[tv.title, { fontSize: 14.5 }]} numberOfLines={1}>{m.name}{m.user_id === user?.id ? " (أنت)" : ""}</Text>
            <Text style={tv.meta}>{m.role_label}{m.phone ? ` · ${m.phone}` : ""}</Text>
          </View>
          {m.role !== "owner" && (
            <>
              <Pressable onPress={() => add(m.user_id, m.role === "manager" ? "agent" : "manager")} style={[tv.ghost, st.act]} accessibilityRole="button" accessibilityLabel={m.role === "manager" ? "تحويل إلى موظف" : "ترقية إلى مدير"}>
                <Text style={tv.ghostT}>{m.role === "manager" ? "موظف" : "مدير"}</Text>
              </Pressable>
              <Pressable onPress={() => remove(m)} style={[tv.ghost, st.act, { borderColor: Colors.danger + "55" }]} accessibilityRole="button" accessibilityLabel={`إزالة ${m.name}`}><Ionicons name="person-remove-outline" size={16} color={Colors.danger} /></Pressable>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  centerIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: TRV_SOFT, alignItems: "center", justifyContent: "center" },
  hBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  kpis: { flexDirection: "row-reverse", gap: 8 },
  kpi: { flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: Colors.radius.md, paddingVertical: 8, alignItems: "center" },
  kpiN: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff" },
  kpiL: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.9)" },
  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.borderSubtle, ...Colors.shadow.card },
  thumb: { width: 64, height: 64, borderRadius: Colors.radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row-reverse", backgroundColor: TRV_SOFT, borderRadius: Colors.radius.md, paddingVertical: 8 },
  msV: { fontFamily: "Cairo_700Bold", fontSize: 14, color: TRV_DEEP },
  msL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  act: { minHeight: 44, paddingHorizontal: 12 },
  two: { flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" },
  cur: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  curT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text },
  inc: { flexDirection: "row-reverse", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: 10, borderRadius: Colors.radius.pill, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  incT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  edHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: TRV_DEEP },
  edTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  edFoot: { flexDirection: "row-reverse", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, backgroundColor: Colors.bg },
  noteBox: { flexDirection: "row-reverse", gap: 6, alignItems: "flex-start", backgroundColor: SAND_SOFT, borderRadius: Colors.radius.sm, padding: 10 },
  noteT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right", lineHeight: 20 },
  pipe: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "center", paddingVertical: 4 },
  pipeLine: { flex: 1, height: 2, backgroundColor: Colors.borderSubtle, marginTop: 10 },
  pipeDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  pipeT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
});

export default TravelAgencyPortal;
