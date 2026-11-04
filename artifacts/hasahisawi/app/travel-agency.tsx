// ملف وكالة السفر العام: الغلاف والشعار، نبذة وخدمات ووجهات، وسائل التواصل، وعروضها الحالية.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet, ActivityIndicator, Linking, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";
import { LoadError } from "@/components/ui/LoadState";
import { useAuth } from "@/lib/auth-context";
import { WEB_APP_URL } from "@/lib/invites";
import { travelApi, TRV, TRV_DEEP, TRV_SOFT, SAND_INK, SAND_SOFT, TRV_GRADIENT } from "@/lib/travel";
import { OfferCard, KindChips, EmptyState, AGENCY_TYPE_LABEL, tv } from "@/components/travel/ui";

type Data = Awaited<ReturnType<typeof travelApi.agency>>;

function TravelAgencyScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const aid = Number(id);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("");

  const load = useCallback(async () => {
    if (!aid) return setErr("الوكالة غير موجودة");
    try { setD(await travelApi.agency(aid, token)); setErr(""); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [aid, token]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of d?.offers || []) c[o.kind] = (c[o.kind] || 0) + 1;
    return c;
  }, [d]);
  const offers = useMemo(() => (d?.offers || []).filter((o) => !kind || o.kind === kind), [d, kind]);
  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/travel", params: { tab: "agencies" } } as any));

  if (err) return (
    <View style={[st.center, { paddingTop: insets.top }]}>
      <LoadError message={err} onRetry={load} />
      <Pressable onPress={back} style={tv.ghost} accessibilityRole="button"><Text style={tv.ghostT}>رجوع</Text></Pressable>
    </View>
  );
  if (!d) return <View style={st.center}><ActivityIndicator color={TRV} /></View>;
  const a = d.agency;
  const share = () => {
    const url = `${WEB_APP_URL}/travel-agency?id=${a.id}`;
    Share.share({ message: `${a.name} — ${d.stats.offers} عرض سفر متاح على حصاحيصاوي\n${url}`, url }).catch(() => {});
  };
  const wa = a.whatsapp?.replace(/[^\d]/g, "");
  const chips = [...new Set([...(a.services_offered || []), ...(a.specialties || [])])].slice(0, 10);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={{ height: 190 }}>
          {a.cover_url ? <Image source={{ uri: a.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
            <LinearGradient colors={TRV_GRADIENT as unknown as [string, string]} style={StyleSheet.absoluteFill}>
              <MaterialCommunityIcons name="earth" size={150} color="rgba(255,255,255,0.08)" style={{ position: "absolute", left: -20, top: 10 }} />
            </LinearGradient>
          )}
          <View style={[st.topBar, { top: insets.top + 8 }]}>
            <Pressable onPress={back} style={st.roundBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <Pressable onPress={share} style={st.roundBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="مشاركة ملف الوكالة"><Ionicons name="share-social-outline" size={20} color="#fff" /></Pressable>
          </View>
        </View>

        <View style={st.card}>
          <View style={st.logo}>{a.logo_url ? <Image source={{ uri: a.logo_url }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name="airplane" size={34} color={TRV} />}</View>
          <View style={[tv.rowR, { justifyContent: "center", gap: 6 }]}>
            <Text style={st.name}>{a.name}</Text>
            <Ionicons name="checkmark-circle" size={18} color={TRV} accessibilityLabel="وكالة معتمدة" />
          </View>
          <Text style={[tv.meta, { textAlign: "center" }]}>{[AGENCY_TYPE_LABEL[a.agency_type] ?? "وكالة سفر", a.city, a.country].filter(Boolean).join(" · ")}</Text>
          <View style={st.stats}>
            <Stat n={d.stats.offers} l="عرض متاح" />
            <View style={st.sep} />
            <Stat n={d.stats.confirmed} l="حجز مؤكد" />
            {!!a.founded_year && <><View style={st.sep} /><Stat n={a.founded_year} l="سنة التأسيس" /></>}
          </View>
          <View style={[tv.rowR, { gap: 8, marginTop: 4 }]}>
            {!!wa && <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={[tv.primary, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="مراسلة الوكالة عبر واتساب"><Ionicons name="logo-whatsapp" size={18} color="#fff" /><Text style={tv.primaryT}>واتساب</Text></Pressable>}
            {!!a.phone && <Pressable onPress={() => Linking.openURL(`tel:${a.phone}`)} style={[tv.ghost, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="الاتصال بالوكالة"><Ionicons name="call-outline" size={18} color={TRV} /><Text style={tv.ghostT}>اتصال</Text></Pressable>}
          </View>
          {d.is_staff && (
            <Pressable onPress={() => router.push("/travel-agency-portal" as any)} style={[tv.ghost, { marginTop: 8 }]} accessibilityRole="button">
              <MaterialCommunityIcons name="view-dashboard-outline" size={18} color={TRV} /><Text style={tv.ghostT}>لوحة الوكالة</Text>
            </Pressable>
          )}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {!!a.description && <><Text style={st.h}>عن الوكالة</Text><Text style={st.desc}>{a.description}</Text></>}
          {chips.length > 0 && (
            <>
              <Text style={st.h}>الخدمات</Text>
              <View style={[tv.rowR, { flexWrap: "wrap", gap: 6 }]}>
                {chips.map((c) => <View key={c} style={[tv.pill, { backgroundColor: SAND_SOFT, paddingVertical: 5 }]}><Text style={[tv.pillT, { color: SAND_INK }]}>{c}</Text></View>)}
              </View>
            </>
          )}
          {(a.destinations || []).length > 0 && (
            <>
              <Text style={st.h}>الوجهات</Text>
              <View style={[tv.rowR, { flexWrap: "wrap", gap: 6 }]}>
                {a.destinations.slice(0, 16).map((c) => <View key={c} style={[tv.pill, { backgroundColor: TRV_SOFT, paddingVertical: 5 }]}><Ionicons name="location-outline" size={12} color={TRV} /><Text style={[tv.pillT, { color: TRV }]}>{c}</Text></View>)}
              </View>
            </>
          )}
          {(a.address || a.license_number || a.email || a.website) && (
            <View style={st.info}>
              {!!a.address && <Info icon="map-outline" t={a.address} />}
              {!!a.license_number && <Info icon="document-text-outline" t={`رقم الترخيص: ${a.license_number}`} />}
              {!!a.email && <Info icon="mail-outline" t={a.email} />}
              {!!a.website && <Info icon="globe-outline" t={a.website} />}
            </View>
          )}
        </View>

        <Text style={[st.h, { paddingHorizontal: 16, marginTop: 20 }]}>عروض الوكالة</Text>
        {d.offers.length > 1 && <KindChips value={kind} onChange={setKind} counts={counts} />}
        {offers.length === 0 ? <EmptyState icon="tag-off-outline" title="لا توجد عروض حالياً" hint="تابع الوكالة لاحقاً أو تواصل معها مباشرة" /> : (
          <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 10 }}>
            {offers.map((o) => <OfferCard key={o.id} o={o} onPress={() => router.push({ pathname: "/travel-offer", params: { id: String(o.id) } } as any)} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={{ alignItems: "center", flex: 1 }}><Text style={st.statN}>{n}</Text><Text style={tv.meta}>{l}</Text></View>;
}
function Info({ icon, t }: { icon: string; t: string }) {
  return <View style={tv.rowR}><Ionicons name={icon as any} size={16} color={TRV} /><Text style={[tv.meta, { flex: 1 }]}>{t}</Text></View>;
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 20, gap: 8 },
  topBar: { position: "absolute", left: 14, right: 14, flexDirection: "row-reverse", justifyContent: "space-between" },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(7,59,76,0.7)", alignItems: "center", justifyContent: "center" },
  card: { marginHorizontal: 16, marginTop: -54, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.xl, padding: 16, paddingTop: 52, gap: 6, borderWidth: 1, borderColor: Colors.borderSubtle, ...Colors.shadow.card },
  logo: { position: "absolute", top: -42, alignSelf: "center", width: 84, height: 84, borderRadius: 42, overflow: "hidden", backgroundColor: TRV_SOFT, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: Colors.cardBg },
  name: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.text, textAlign: "center", flexShrink: 1 },
  stats: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: TRV_SOFT, borderRadius: Colors.radius.md, paddingVertical: 10, marginVertical: 6 },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: TRV_DEEP },
  sep: { width: 1, height: 28, backgroundColor: Colors.borderSubtle },
  h: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right", marginTop: 14 },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 23, color: Colors.textSecondary, textAlign: "right" },
  info: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.borderSubtle, marginTop: 12 },
});

export default TravelAgencyScreen;
