// تبويبات مركز السفريات الخاصة بالوكالات: عروض الوكالات، دليل الوكالات، وطلباتي لدى الوكالات.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, Image, Linking, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { notify, confirmAction } from "@/lib/xplatform";
import { LoadError } from "@/components/ui/LoadState";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { travelApi, TRV, TRV_DEEP, TRV_SOFT, SAND, SAND_INK, SAND_SOFT, kindInfo, fmtDate, fmtPrice, type Offer, type Agency, type OfferRequest, type PortalMe } from "@/lib/travel";
import { KindChips, OfferCard, AgencyCard, EmptyState, SectionTitle, StatusPill, tv } from "@/components/travel/ui";
import AgencyJoinForm from "@/components/travel/AgencyJoinForm";

const openOffer = (id: number) => router.push({ pathname: "/travel-offer", params: { id: String(id) } } as any);
const openAgency = (id: number) => router.push({ pathname: "/travel-agency", params: { id: String(id) } } as any);
const waLink = (p: string, text = "") => Linking.openURL(`https://wa.me/${p.replace(/[^\d]/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`).catch(() => {});

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={18} color={TRV} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textMuted} style={s.searchInput}
        returnKeyType="search" accessibilityLabel={placeholder} />
      {!!value && (
        <Pressable onPress={() => onChange("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="مسح البحث">
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

// ═══ عروض الوكالات ═══════════════════════════════════════════════
export function OffersFeed({ initialKind = "" }: { initialKind?: string }) {
  const [kind, setKind] = useState(initialKind);
  const [q, setQ] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await travelApi.offers({ kind: kind || undefined, q: q.trim() || undefined });
      if (my !== seq.current) return;
      setOffers(d.offers); setCounts(d.counts || {}); setErr(false);
    } catch { if (my === seq.current) setErr(true); }
  }, [kind, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const featured = useMemo(() => (!kind && !q ? (offers || []).filter((o) => o.is_featured) : []), [offers, kind, q]);
  const rest = useMemo(() => (featured.length ? (offers || []).filter((o) => !o.is_featured) : offers || []), [offers, featured]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={TRV} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <SearchBox value={q} onChange={setQ} placeholder="ابحث عن وجهة، عمرة، وكالة…" />
      </View>
      <View style={{ marginTop: 10 }}><KindChips value={kind} onChange={setKind} counts={counts} /></View>

      {err ? <LoadError onRetry={load} /> : offers === null ? (
        <ActivityIndicator color={TRV} style={{ marginTop: 40 }} />
      ) : offers.length === 0 ? (
        <EmptyState icon="airplane-search" title={q || kind ? "لا توجد عروض مطابقة" : "لا توجد عروض منشورة بعد"}
          hint={q || kind ? "جرّب نوعاً آخر أو كلمة بحث مختلفة" : "تنشر الوكالات المعتمدة عروض العمرة والطيران والرحلات هنا فور اعتمادها"}
          action={q || kind ? "عرض كل العروض" : undefined} onAction={() => { setQ(""); setKind(""); }} />
      ) : (
        <>
          {featured.length > 0 && (
            <>
              <SectionTitle title="عروض مميزة" icon="star-four-points-outline" />
              <RtlScrollRow contentContainerStyle={{ flexGrow: 1, gap: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
                {featured.map((o) => <OfferCard key={o.id} o={o} compact onPress={() => openOffer(o.id)} />)}
              </RtlScrollRow>
            </>
          )}
          {rest.length > 0 && (
            <>
              <SectionTitle title={kind ? kindInfo(kind).label : featured.length ? "كل العروض" : "أحدث العروض"} icon="tag-multiple-outline" />
              <View style={{ paddingHorizontal: 16, gap: 14 }}>
                {rest.map((o) => <OfferCard key={o.id} o={o} onPress={() => openOffer(o.id)} />)}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ═══ دليل الوكالات ════════════════════════════════════════════════
export function AgenciesDirectory({ inviteToken, children }: { inviteToken?: string; children?: React.ReactNode }) {
  const { token, isGuest } = useAuth();
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [portal, setPortal] = useState<PortalMe | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [invite, setInvite] = useState<any>(null);

  const load = useCallback(async () => {
    try { const d = await travelApi.agencies(); setAgencies(d.agencies); setErr(false); } catch { setErr(true); }
    if (token && !isGuest) travelApi.portal(token).then(setPortal).catch(() => setPortal(null));
  }, [token, isGuest]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`${getApiUrl()}/api/travel-agencies/invite/${encodeURIComponent(inviteToken)}`)
      .then((r) => r.json()).then((d) => { if (d && !d.error) setInvite(d); setShowForm(true); }).catch(() => setShowForm(true));
  }, [inviteToken]);

  const list = useMemo(() => {
    const t = q.trim();
    if (!t) return agencies || [];
    return (agencies || []).filter((a) => [a.name, a.city, ...(a.destinations || []), ...(a.services_offered || [])].join(" ").includes(t));
  }, [agencies, q]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
      {portal?.agency ? (
        <Pressable onPress={() => router.push("/travel-agency-portal" as any)} style={[s.portalCard]} accessibilityRole="button" accessibilityLabel="فتح لوحة الوكالة">
          <View style={s.portalIcon}><MaterialCommunityIcons name="view-dashboard-outline" size={24} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.portalT}>لوحة {portal.agency.name}</Text>
            <Text style={s.portalS}>{portal.counts?.new_requests ? `${portal.counts.new_requests} طلب حجز جديد بانتظارك` : "انشر العروض وتابع طلبات الحجز"}</Text>
          </View>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
      ) : portal?.application && portal.application.status !== "approved" ? (
        <View style={[s.joinCard, { backgroundColor: TRV_SOFT }]}>
          <Ionicons name="time-outline" size={24} color={TRV} />
          <View style={{ flex: 1 }}>
            <Text style={[s.joinT, { color: TRV }]}>طلب «{portal.application.agency_name}» قيد المراجعة</Text>
            <Text style={[s.joinS, { color: Colors.textSecondary }]}>ستظهر لوحة الوكالة هنا فور اعتمادها.</Text>
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <SearchBox value={q} onChange={setQ} placeholder="ابحث باسم الوكالة أو المدينة أو الوجهة" />
      </View>

      <SectionTitle title="الوكالات المعتمدة" icon="shield-check-outline" />
      {err ? <LoadError onRetry={load} /> : agencies === null ? <ActivityIndicator color={TRV} style={{ marginTop: 20 }} /> : list.length === 0 ? (
        <EmptyState icon="office-building-marker-outline" title={q ? "لا توجد وكالة مطابقة" : "لا توجد وكالات معتمدة بعد"} hint="الوكالات المعتمدة تظهر هنا مع عروضها" />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {list.map((a) => <AgencyCard key={a.id} a={a} onPress={() => openAgency(a.id)} />)}
        </View>
      )}

      {!portal?.agency && (
        <Pressable onPress={() => setShowForm(true)} style={s.joinCard} accessibilityRole="button" accessibilityLabel="سجّل وكالتك">
          <View style={[s.portalIcon, { backgroundColor: SAND_INK }]}><MaterialCommunityIcons name="airplane-plus" size={24} color={SAND} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.joinT}>تملك وكالة سفر؟</Text>
            <Text style={s.joinS}>سجّلها لتنشر عروض العمرة والطيران والرحلات وتستقبل طلبات الحجز مباشرة.</Text>
          </View>
          <Ionicons name="chevron-back" size={20} color={SAND_INK} />
        </Pressable>
      )}

      {children}

      <AgencyJoinForm visible={showForm} prefill={invite} inviteToken={inviteToken}
        onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); load(); }} />
    </ScrollView>
  );
}

// ═══ طلباتي لدى الوكالات ══════════════════════════════════════════
export function MyAgencyRequests() {
  const { token } = useAuth();
  const [items, setItems] = useState<OfferRequest[] | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    try { const d = await travelApi.myRequests(token); setItems(d.requests); setErr(false); } catch { setErr(true); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (r: OfferRequest) => {
    if (!token || !(await confirmAction("إلغاء الطلب", `إلغاء طلبك في «${r.offer_title}»؟`, "إلغاء الطلب", true))) return;
    try { await travelApi.cancelMine(token, r.id); load(); } catch (e: any) { notify("تعذّر الإلغاء", e?.message); }
  };

  if (err) return <LoadError onRetry={load} />;
  if (items === null) return <ActivityIndicator color={TRV} style={{ marginTop: 30 }} />;
  if (!items.length) return <EmptyState icon="clipboard-text-outline" title="لا توجد طلبات لدى الوكالات" hint="اطلب حجز عرض من «عروض الوكالات» وتابع حالته هنا" />;
  return (
    <View style={{ gap: 12 }}>
      {items.map((r) => {
        const k = kindInfo(r.kind);
        const price = r.price != null ? fmtPrice({ price: r.price, currency: r.currency || "SDG" }) : null;
        return (
          <View key={r.id} style={s.reqCard}>
            <Pressable onPress={() => openOffer(r.offer_id)} style={[tv.rowR, { gap: 10, alignItems: "flex-start" }]} accessibilityRole="button" accessibilityLabel={`فتح العرض ${r.offer_title}`}>
              <View style={[s.reqThumb, { backgroundColor: k.color }]}>
                {r.image ? <Image source={{ uri: r.image }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name={k.icon as any} size={24} color="#fff" />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[tv.title, { fontSize: 14.5 }]} numberOfLines={2}>{r.offer_title}</Text>
                <Text style={tv.meta} numberOfLines={1}>{r.agency_name}{r.depart_date ? ` · ${fmtDate(r.depart_date)}` : ""} · {r.travellers} مسافر</Text>
                {!!price && <Text style={[tv.meta, { color: TRV, fontFamily: "Cairo_700Bold" }]}>{price}</Text>}
              </View>
              <StatusPill status={r.status} />
            </Pressable>
            {!!r.agency_note && (
              <View style={s.note}>
                <Ionicons name="chatbox-ellipses-outline" size={15} color={TRV} />
                <Text style={s.noteT}>ردّ الوكالة: {r.agency_note}</Text>
              </View>
            )}
            <View style={[tv.rowR, { gap: 8, marginTop: 10 }]}>
              {!!r.agency_whatsapp && (
                <Pressable onPress={() => waLink(r.agency_whatsapp!, `بخصوص طلبي رقم ${r.id}: ${r.offer_title}`)} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="مراسلة الوكالة عبر واتساب">
                  <Ionicons name="logo-whatsapp" size={16} color={TRV} /><Text style={tv.ghostT}>واتساب</Text>
                </Pressable>
              )}
              {!!r.agency_phone && (
                <Pressable onPress={() => Linking.openURL(`tel:${r.agency_phone}`)} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="الاتصال بالوكالة">
                  <Ionicons name="call-outline" size={16} color={TRV} /><Text style={tv.ghostT}>اتصال</Text>
                </Pressable>
              )}
              {(r.status === "new" || r.status === "contacted") && (
                <Pressable onPress={() => cancel(r)} style={[tv.ghost, { flex: 1, borderColor: Colors.danger + "55" }]} accessibilityRole="button" accessibilityLabel="إلغاء الطلب">
                  <Text style={[tv.ghostT, { color: Colors.danger }]}>إلغاء</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.pill, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 14, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", paddingVertical: 8 },
  portalCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, margin: 16, marginBottom: 0, padding: 14, borderRadius: Colors.radius.lg, backgroundColor: TRV_DEEP },
  portalIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  portalT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right" },
  portalS: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  joinCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, margin: 16, marginBottom: 0, padding: 14, borderRadius: Colors.radius.lg, backgroundColor: SAND },
  joinT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: SAND_INK, textAlign: "right" },
  joinS: { fontFamily: "Cairo_400Regular", fontSize: 13, color: SAND_INK, textAlign: "right", lineHeight: 20 },
  reqCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.borderSubtle, ...Colors.shadow.card },
  reqThumb: { width: 56, height: 56, borderRadius: Colors.radius.md, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row-reverse", gap: 6, alignItems: "flex-start", backgroundColor: SAND_SOFT, borderRadius: Colors.radius.sm, padding: 10, marginTop: 10 },
  noteT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right", lineHeight: 20 },
});
