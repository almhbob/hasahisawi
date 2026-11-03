// ملف شركة المقاولات — الغلاف والتعريف، معرض المشاريع المنجزة (قبل/بعد)، الخدمات والفريق، التقييمات،
// فرص العمل، وطلب عرض سعر مع صور الموقع.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Image, Linking, Share, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { conApi, CON, CON_DEEP, money, fmtD, type Company, type Project, type Review, type Job } from "@/lib/contractors";
import { Stars, Badge, Pill, BeforeAfter, ImagesField, conStyles as u } from "@/components/contractors/ui";

type Data = Awaited<ReturnType<typeof conApi.company>>;
const WEB = "https://hasahisawi.pages.dev";

export default function ContractorScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest, user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"projects" | "about" | "reviews" | "jobs">("projects");
  const [spec, setSpec] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const load = useCallback(async () => { try { setD(await conApi.company(Number(id), token)); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); } }, [id, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/contractors" as any));

  if (err) return <View style={st.center}><Text style={u.hint}>{err}</Text><Pressable onPress={back} style={[u.ghost, { marginTop: 10 }]}><Text style={u.ghostT}>رجوع</Text></Pressable></View>;
  if (!d) return <View style={st.center}><ActivityIndicator color={CON} /></View>;
  const c = d.company;
  const projects = d.projects.filter((p) => !spec || p.specialty === spec);
  const specs = [...new Set(d.projects.map((p) => p.specialty).filter(Boolean))] as string[];
  const askQuote = () => {
    if (!token || isGuest) return notify("سجّل الدخول", "سجّل الدخول لطلب عرض سعر");
    if (!c.accepts_quotes) return notify("غير متاح", "الشركة لا تستقبل طلبات أسعار حالياً");
    setQuoteOpen(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={[st.cover, { paddingTop: insets.top }]}>
          {c.cover_url ? <Image source={{ uri: c.cover_url }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: CON_DEEP }]} />}
          <View style={st.coverShade} />
          <View style={[u.rowR, { justifyContent: "space-between", padding: 12 }]}>
            <Pressable onPress={back} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <View style={[u.rowR, { gap: 8 }]}>
              {d.is_staff && <Pressable onPress={() => router.push("/contractor-portal" as any)} style={st.iconBtn} accessibilityLabel="لوحة الشركة"><MaterialCommunityIcons name="view-dashboard-outline" size={19} color="#fff" /></Pressable>}
              <Pressable onPress={() => Share.share({ message: `🏗️ ${c.name}${c.tagline ? ` — ${c.tagline}` : ""}\n${WEB}/contractor?id=${c.id}` }).catch(() => {})} style={st.iconBtn} accessibilityLabel="مشاركة"><Ionicons name="share-social" size={18} color="#fff" /></Pressable>
            </View>
          </View>
          <View style={st.hazard} />
        </View>
        <View style={st.head}>
          <View style={st.logo}>{c.logo_url ? <Image source={{ uri: c.logo_url }} style={{ width: "100%", height: "100%" }} /> : <MaterialCommunityIcons name="crane" size={34} color={CON} />}</View>
          <View style={{ flex: 1, paddingTop: 6 }}>
            <View style={[u.rowR, { gap: 6, flexWrap: "wrap" }]}>
              <Text style={st.name}>{c.name}</Text>
              {c.status === "active" && <MaterialCommunityIcons name="check-decagram" size={18} color="#0E8A5F" />}
              {c.status !== "active" && <Badge label={c.status === "pending" ? "قيد المراجعة" : c.status === "suspended" ? "موقوفة" : "مرفوضة"} color="#B7791F" />}
            </View>
            {!!c.tagline && <Text style={u.hint}>{c.tagline}</Text>}
            <View style={[u.rowR, { gap: 6, marginTop: 4 }]}>
              {c.rating != null ? <><Stars value={c.rating} /><Text style={u.hint}>{c.rating} · {c.reviews_count} تقييم</Text></> : <Text style={u.hint}>لا تقييمات بعد</Text>}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <View style={[u.rowR, { gap: 8, marginTop: 4 }]}>
            <KPI n={c.projects_count} l="مشروع في المعرض" /><KPI n={c.completed_count} l="عمل منجز عبر التطبيق" /><KPI n={c.founded_year ? new Date().getFullYear() - c.founded_year : null} l="سنة خبرة" />
          </View>
          <View style={[u.wrap, { marginTop: 12 }]}>{c.specialty_labels.map((l) => <Badge key={l} label={l} color={CON} />)}</View>

          <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
            <Pressable onPress={askQuote} style={[u.primary, { flex: 1 }]}><MaterialCommunityIcons name="calculator-variant-outline" size={18} color="#fff" /><Text style={u.primaryT}>اطلب عرض سعر</Text></Pressable>
            {!!c.whatsapp && <Pressable onPress={() => Linking.openURL(`https://wa.me/${c.whatsapp!.replace(/\D/g, "")}`)} style={[st.round, { backgroundColor: "#128C7E" }]} accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={20} color="#fff" /></Pressable>}
            {!!c.phone && <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)} style={[st.round, { backgroundColor: CON_DEEP }]} accessibilityLabel="اتصال"><Ionicons name="call" size={18} color="#fff" /></Pressable>}
          </View>

          <View style={st.tabs}>
            {([["projects", `المشاريع (${d.projects.length})`], ["about", "عن الشركة"], ["reviews", `التقييمات (${d.reviews.length})`], ["jobs", `وظائف (${d.jobs.length})`]] as const).map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { borderBottomColor: CON }]}><Text style={[st.tabT, tab === k && { color: CON }]}>{l}</Text></Pressable>
            ))}
          </View>

          {tab === "projects" && (
            <>
              {specs.length > 1 && (
                <View style={[u.wrap, { marginTop: 10 }]}>
                  <Pill label="الكل" on={!spec} onPress={() => setSpec("")} />
                  {specs.map((k) => <Pill key={k} label={c.specialty_labels[c.specialties.indexOf(k)] || k} on={spec === k} onPress={() => setSpec(k)} />)}
                </View>
              )}
              <View style={st.grid}>
                {projects.map((p) => {
                  const img = p.after_images[0] || p.gallery[0] || p.before_images[0];
                  return (
                    <Pressable key={p.id} onPress={() => setProject(p)} style={st.pCard} accessibilityLabel={p.title}>
                      <View style={st.pImg}>
                        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} /> : null}
                        {p.before_images.length > 0 && p.after_images.length > 0 && <Text style={st.baTag}>قبل / بعد</Text>}
                        {p.featured && <Ionicons name="star" size={14} color="#F59E0B" style={{ position: "absolute", top: 6, left: 6 }} />}
                      </View>
                      <Text style={st.pTitle} numberOfLines={2}>{p.title}</Text>
                      <Text style={u.hint} numberOfLines={1}>{[p.location, p.completed_on ? fmtD(p.completed_on) : null].filter(Boolean).join(" · ")}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!projects.length && <Text style={[u.hint, { textAlign: "center", marginTop: 20 }]}>لم تُضف مشاريع بعد</Text>}
            </>
          )}

          {tab === "about" && (
            <View style={{ gap: 10, marginTop: 12 }}>
              {!!c.description && <View style={u.card}><Text style={[u.hint, { color: Colors.textSecondary, fontSize: 13.5, lineHeight: 23 }]}>{c.description}</Text></View>}
              <View style={[u.card, { gap: 8 }]}>
                <Row icon="map-marker-outline" t={[c.address, c.city].filter(Boolean).join("، ")} />
                {c.service_areas.length > 0 && <Row icon="map-search-outline" t={`مناطق العمل: ${c.service_areas.join("، ")}`} />}
                {!!c.working_hours && <Row icon="clock-outline" t={c.working_hours} />}
                {!!c.license_no && <Row icon="card-account-details-outline" t={`ترخيص: ${c.license_no}`} />}
                {!!c.team_size && <Row icon="account-group-outline" t={`${c.team_size} عامل وموظف`} />}
                {!!c.email && <Row icon="email-outline" t={c.email} />}
              </View>
              {d.team.length > 0 && (
                <View style={u.card}>
                  <Text style={u.h}>فريق العمل</Text>
                  {d.team.map((m, i) => (
                    <View key={i} style={[u.rowR, { gap: 10, marginTop: 10 }]}>
                      <UserAvatar name={m.name} avatarUrl={m.avatar_url} size={38} borderRadius={19} />
                      <View style={{ flex: 1 }}><Text style={st.mName}>{m.name}</Text><Text style={u.hint}>{m.title || m.role_label}</Text></View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {tab === "reviews" && (
            <View style={{ marginTop: 12, gap: 10 }}>
              {d.reviews.map((r) => <ReviewCard key={r.id} r={r} />)}
              {!d.reviews.length && <Text style={[u.hint, { textAlign: "center", marginTop: 20 }]}>تظهر التقييمات من عملاء أكملوا أعمالهم مع الشركة عبر التطبيق.</Text>}
            </View>
          )}

          {tab === "jobs" && (
            <View style={{ marginTop: 12, gap: 10 }}>
              {d.jobs.map((j) => <JobMini key={j.id} j={j} />)}
              {!d.jobs.length && <Text style={[u.hint, { textAlign: "center", marginTop: 20 }]}>لا توجد فرص مفتوحة حالياً</Text>}
            </View>
          )}
        </View>
      </ScrollView>

      <ProjectModal p={project} onClose={() => setProject(null)} />
      {quoteOpen && <QuoteModal company={c} token={token!} name={(user as any)?.name || ""} onClose={() => setQuoteOpen(false)} />}
    </View>
  );
}

function KPI({ n, l }: { n: number | null; l: string }) {
  return <View style={st.kpi}><Text style={st.kpiN}>{n ?? "—"}</Text><Text style={st.kpiL}>{l}</Text></View>;
}
function Row({ icon, t }: { icon: string; t: string }) {
  if (!t) return null;
  return <View style={[u.rowR, { gap: 8 }]}><MaterialCommunityIcons name={icon as any} size={17} color={CON} /><Text style={[u.hint, { flex: 1, color: Colors.textSecondary, fontSize: 13 }]}>{t}</Text></View>;
}
function ReviewCard({ r }: { r: Review }) {
  return (
    <View style={u.card}>
      <View style={[u.rowR, { gap: 10 }]}>
        <UserAvatar name={r.user_name} avatarUrl={r.avatar_url} size={36} borderRadius={18} />
        <View style={{ flex: 1 }}><Text style={st.mName}>{r.user_name}</Text><Stars value={r.rating} size={13} /></View>
        <Text style={u.hint}>{fmtD(r.created_at)}</Text>
      </View>
      <View style={[u.rowR, { gap: 10, marginTop: 6, flexWrap: "wrap" }]}>
        {r.quality != null && <Text style={u.hint}>الجودة {r.quality}/5</Text>}
        {r.punctuality != null && <Text style={u.hint}>الالتزام {r.punctuality}/5</Text>}
        {r.price_value != null && <Text style={u.hint}>القيمة {r.price_value}/5</Text>}
      </View>
      {!!r.comment && <Text style={[u.hint, { color: Colors.textSecondary, fontSize: 13, marginTop: 6 }]}>{r.comment}</Text>}
    </View>
  );
}
function JobMini({ j }: { j: Job }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/contractors", params: { tab: "jobs" } } as any)} style={u.card}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}><Badge label={j.kind_label} color={CON} /><Text style={u.hint}>{j.workers_needed} مطلوب</Text></View>
      <Text style={[u.h, { marginTop: 6 }]}>{j.title}</Text>
      <Text style={u.hint}>{[j.wage != null ? `${money(j.wage)} ${j.wage_unit_label}` : null, j.duration, j.location].filter(Boolean).join(" · ")}</Text>
    </Pressable>
  );
}

function ProjectModal({ p, onClose }: { p: Project | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [pair, setPair] = useState(0);
  if (!p) return null;
  const pairs = Math.max(p.before_images.length, p.after_images.length);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
        <View style={[u.rowR, { justifyContent: "space-between", padding: 12 }]}>
          <Pressable onPress={onClose} style={st.closeBtn} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.textPrimary} /></Pressable>
          <Text style={[u.h, { flex: 1, textAlign: "center" }]} numberOfLines={1}>{p.title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30, gap: 12 }}>
          {pairs > 0 && (
            <>
              <BeforeAfter before={p.before_images[pair]} after={p.after_images[pair]} height={280} />
              {pairs > 1 && <View style={[u.rowR, { justifyContent: "center", gap: 6 }]}>{Array.from({ length: pairs }, (_, i) => <Pressable key={i} onPress={() => setPair(i)} style={[st.dot, pair === i && { backgroundColor: CON, width: 18 }]} />)}</View>}
            </>
          )}
          <View style={[u.card, { gap: 6 }]}>
            {!!p.location && <Row icon="map-marker-outline" t={p.location} />}
            {!!p.completed_on && <Row icon="calendar-check" t={`أُنجز ${fmtD(p.completed_on)}${p.duration_days ? ` خلال ${p.duration_days} يوماً` : ""}`} />}
            {!!p.client_label && <Row icon="account-tie-outline" t={`لصالح: ${p.client_label}`} />}
            {!!p.description && <Text style={[u.hint, { color: Colors.textSecondary, fontSize: 13.5, lineHeight: 23 }]}>{p.description}</Text>}
          </View>
          {p.gallery.map((g, i) => <Image key={i} source={{ uri: g }} style={st.gImg} resizeMode="cover" />)}
        </ScrollView>
      </View>
    </Modal>
  );
}

function QuoteModal({ company, token, name, onClose }: { company: Company; token: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState({ title: "", details: "", location: "", budget: "", client_name: name, client_phone: "", preferred_start: "" });
  const [spec, setSpec] = useState(company.specialties[0] || "");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (t: string) => setF({ ...f, [k]: t });
  const send = async () => {
    setSaving(true);
    try { const r = await conApi.requestQuote(token, company.id, { ...f, specialty: spec, images }); notify("أُرسل الطلب", r.message); onClose(); router.push({ pathname: "/contractors", params: { tab: "requests" } } as any); }
    catch (e: any) { notify("تعذّر الإرسال", e?.message); } finally { setSaving(false); }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
        <View style={[u.rowR, { justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider }]}>
          <Pressable onPress={onClose} style={st.closeBtn} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.textPrimary} /></Pressable>
          <Text style={u.h}>طلب عرض سعر · {company.name}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {company.specialties.length > 1 && (<><Text style={u.label}>نوع العمل</Text><View style={u.wrap}>{company.specialties.map((k, i) => <Pill key={k} label={company.specialty_labels[i]} on={spec === k} onPress={() => setSpec(k)} />)}</View></>)}
          <Text style={u.label}>عنوان الطلب *</Text>
          <TextInput value={f.title} onChangeText={set("title")} placeholder="مثال: تشطيب شقة 3 غرف وصالة" placeholderTextColor={Colors.textMuted} style={u.input} />
          <Text style={u.label}>تفاصيل العمل</Text>
          <TextInput value={f.details} onChangeText={set("details")} multiline placeholder="المساحة، المواد المفضلة، الحالة الحالية، أي ملاحظات…" placeholderTextColor={Colors.textMuted} style={[u.input, { minHeight: 110, textAlignVertical: "top" }]} />
          <ImagesField label="صور الموقع (تساعد الشركة على تسعير أدق)" value={images} onChange={setImages} max={8} />
          <View style={[u.rowR, { gap: 8 }]}>
            <View style={{ flex: 1 }}><Text style={u.label}>الموقع</Text><TextInput value={f.location} onChangeText={set("location")} placeholder="الحي / المدينة" placeholderTextColor={Colors.textMuted} style={u.input} /></View>
            <View style={{ flex: 1 }}><Text style={u.label}>الميزانية التقريبية</Text><TextInput value={f.budget} onChangeText={set("budget")} placeholder="اختياري" placeholderTextColor={Colors.textMuted} style={u.input} /></View>
          </View>
          <Text style={u.label}>تاريخ البدء المفضل (2026-12-01)</Text>
          <TextInput value={f.preferred_start} onChangeText={set("preferred_start")} placeholder="اختياري" placeholderTextColor={Colors.textMuted} style={u.input} />
          <View style={[u.rowR, { gap: 8 }]}>
            <View style={{ flex: 1 }}><Text style={u.label}>الاسم</Text><TextInput value={f.client_name} onChangeText={set("client_name")} style={u.input} /></View>
            <View style={{ flex: 1 }}><Text style={u.label}>الهاتف *</Text><TextInput value={f.client_phone} onChangeText={set("client_phone")} keyboardType="phone-pad" placeholder="09…" placeholderTextColor={Colors.textMuted} style={u.input} /></View>
          </View>
          <Pressable onPress={send} disabled={saving} style={[u.primary, { marginTop: 18, opacity: saving ? 0.7 : 1 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="send" size={17} color="#fff" />}<Text style={u.primaryT}>إرسال الطلب</Text>
          </Pressable>
          <Text style={[u.hint, { textAlign: "center", marginTop: 8 }]}>تتابع حالة طلبك وعرض السعر والعقد من «طلباتي».</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  cover: { height: 190, backgroundColor: CON_DEEP, justifyContent: "flex-start" },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  hazard: { position: "absolute", bottom: 0, left: 0, right: 0, height: 6, backgroundColor: "#F59E0B" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row-reverse", gap: 12, paddingHorizontal: 16, marginTop: -34 },
  logo: { width: 84, height: 84, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 3, borderColor: Colors.cardBg, overflow: "hidden", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "right", marginTop: 30 },
  kpi: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  kpiN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: CON },
  kpiL: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: Colors.textMuted, textAlign: "center" },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row-reverse", marginTop: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginTop: 12 },
  pCard: { width: "48%", flexGrow: 1 },
  pImg: { height: 130, borderRadius: 14, backgroundColor: Colors.divider, overflow: "hidden" },
  baTag: { position: "absolute", bottom: 6, right: 6, fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff", backgroundColor: CON, paddingHorizontal: 8, borderRadius: 8, overflow: "hidden" },
  pTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 6 },
  mName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.divider },
  gImg: { width: "100%", height: 220, borderRadius: 14 },
});
