// «شركات المقاولات» — دليل الشركات بالتخصص، فرص العمل وطلب العمال، طلباتي (عروض الأسعار ومتابعتها وتقييمها)،
// عقودي (مراجعة العقد وقبوله إلكترونياً)، وتسجيل شركة جديدة (بموافقة الإدارة).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet, Share, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { conApi, CON, CON_DEEP, QUOTE_COLOR, CONTRACT_STATUS, money, fmtD, type Meta, type Company, type Job, type Quote, type Contract } from "@/lib/contractors";
import { CompanyCard, Stars, Badge, Pill, ImagesField, conStyles as u } from "@/components/contractors/ui";

type Tab = "companies" | "jobs" | "requests" | "contracts" | "register";

export default function ContractorsScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest, user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; specialty?: string }>();
  const signedIn = !!token && !isGuest;
  const [tab, setTab] = useState<Tab>((["jobs", "requests", "contracts", "register"].includes(String(params.tab)) ? params.tab : "companies") as Tab);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [spec, setSpec] = useState(String(params.specialty || ""));
  const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [sort, setSort] = useState("top");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await conApi.meta(token).catch(() => null);
      if (m) setMeta(m);
      if (tab === "companies") setCompanies((await conApi.list({ specialty: spec || undefined, q: query || undefined, sort })).companies);
      else if (tab === "jobs") setJobs((await conApi.allJobs()).jobs);
      else if (tab === "requests" && signedIn) setQuotes((await conApi.myQuotes(token!)).quotes);
      else if (tab === "contracts" && signedIn) setContracts((await conApi.myContracts(token!)).contracts);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); } finally { setLoading(false); }
  }, [tab, spec, query, sort, token, signedIn]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const myCompany = meta?.me.company;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any));
  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "companies", label: "الشركات", icon: "office-building-outline" },
    { key: "jobs", label: "وظائف وعمال", icon: "account-hard-hat-outline" },
    { key: "requests", label: "طلباتي", icon: "clipboard-text-outline" },
    { key: "contracts", label: "عقودي", icon: "file-sign" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={CON} />} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={["#111827", CON_DEEP, "#374151"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={st.hazard} />
          <View style={[u.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={back} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            {myCompany ? (
              <Pressable onPress={() => router.push("/contractor-portal" as any)} style={st.cta}><MaterialCommunityIcons name="view-dashboard-outline" size={16} color="#111827" /><Text style={st.ctaT}>لوحة شركتي</Text></Pressable>
            ) : signedIn ? (
              <Pressable onPress={() => setTab("register")} style={st.cta}><MaterialCommunityIcons name="plus-circle-outline" size={16} color="#111827" /><Text style={st.ctaT}>سجّل شركتك</Text></Pressable>
            ) : <View />}
          </View>
          <View style={[u.rowR, { gap: 12, marginTop: 12 }]}>
            <View style={st.heroIcon}><MaterialCommunityIcons name="crane" size={30} color={CON} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>شركات المقاولات</Text>
              <Text style={st.sub}>شركات موثّقة، مشاريع منجزة بصور قبل وبعد، عروض أسعار وعقود واضحة</Text>
            </View>
          </View>
          <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
            <Stat n={meta?.totals.companies ?? 0} l="شركة" /><Stat n={meta?.totals.projects ?? 0} l="مشروع منجز" /><Stat n={meta?.totals.jobs ?? 0} l="فرصة عمل" />
          </View>
          {tab === "companies" && (
            <View style={st.search}>
              <Ionicons name="search" size={17} color={Colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="ابحث باسم الشركة أو الخدمة أو المنطقة" placeholderTextColor={Colors.textMuted} style={st.searchIn} />
            </View>
          )}
        </LinearGradient>

        <View style={st.tabsWrap}>
          <View style={st.tabs}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, tab === t.key && { backgroundColor: CON }]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                <MaterialCommunityIcons name={t.icon as any} size={15} color={tab === t.key ? "#fff" : Colors.textSecondary} />
                <Text style={[st.tabT, tab === t.key && { color: "#fff" }]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {tab === "companies" && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }], marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
                {[{ key: "", label: "كل التخصصات", icon: "apps" }, ...(meta?.specialties ?? [])].map((s) => (
                  <View key={s.key || "all"} style={{ transform: [{ scaleX: -1 }] }}><Pill label={s.label} icon={s.icon} on={spec === s.key} onPress={() => setSpec(s.key)} /></View>
                ))}
              </ScrollView>
              <View style={[u.rowR, { gap: 6, marginTop: 10, marginBottom: 10 }]}>
                {[["top", "الأعلى تقييماً"], ["projects", "الأكثر مشاريع"], ["new", "الأحدث"]].map(([k, l]) => <Pill key={k} label={l} on={sort === k} onPress={() => setSort(k)} color={CON_DEEP} />)}
              </View>
              {loading ? <ActivityIndicator color={CON} style={{ marginTop: 24 }} /> : companies.map((c) => (
                <CompanyCard key={c.id} c={c} onPress={() => router.push({ pathname: "/contractor", params: { id: String(c.id) } } as any)} />
              ))}
              {!loading && !companies.length && <Empty icon="office-building-outline" title={query || spec ? "لا نتائج مطابقة" : "لا توجد شركات معتمدة بعد"} sub="تُعرض هنا الشركات بعد مراجعة الإدارة وتوثيقها." action={signedIn && !myCompany ? "سجّل شركتك" : undefined} onAction={() => setTab("register")} />}
            </>
          )}

          {tab === "jobs" && (
            loading ? <ActivityIndicator color={CON} style={{ marginTop: 24 }} /> : (
              <View style={{ marginTop: 8 }}>
                {jobs.map((j) => <JobCard key={j.id} j={j} />)}
                {!jobs.length && <Empty icon="account-hard-hat-outline" title="لا توجد فرص حالياً" sub="تنشر الشركات هنا حاجتها لعمال يومية وحرفيين ومهندسين." />}
              </View>
            )
          )}

          {tab === "requests" && (
            !signedIn ? <Empty icon="login" title="سجّل الدخول لمتابعة طلباتك" /> : loading ? <ActivityIndicator color={CON} style={{ marginTop: 24 }} /> : (
              <View style={{ marginTop: 8 }}>
                {quotes.map((q) => <MyQuote key={q.id} q={q} token={token!} onChange={load} />)}
                {!quotes.length && <Empty icon="clipboard-text-outline" title="لم تطلب عروض أسعار بعد" sub="افتح ملف أي شركة واضغط «اطلب عرض سعر» مع وصف العمل والصور." action="تصفح الشركات" onAction={() => setTab("companies")} />}
              </View>
            )
          )}

          {tab === "contracts" && (
            !signedIn ? <Empty icon="login" title="سجّل الدخول لعرض عقودك" /> : loading ? <ActivityIndicator color={CON} style={{ marginTop: 24 }} /> : (
              <View style={{ marginTop: 8 }}>
                {contracts.map((k) => <MyContract key={k.id} k={k} token={token!} onChange={load} />)}
                {!contracts.length && <Empty icon="file-sign" title="لا توجد عقود" sub="عند قبولك عرض سعر، تُرسل لك الشركة العقد هنا لمراجعته وقبوله." />}
              </View>
            )
          )}

          {tab === "register" && (
            !signedIn ? <Empty icon="login" title="سجّل الدخول لتسجيل شركتك" /> : myCompany ? (
              <Empty icon="check-decagram" title={`أنت ضمن طاقم ${myCompany.name}`} sub={myCompany.status === "pending" ? "طلب الشركة قيد مراجعة الإدارة." : "افتح لوحة الشركة لإدارتها."} action="لوحة شركتي" onAction={() => router.push("/contractor-portal" as any)} />
            ) : <RegisterForm meta={meta} token={token!} ownerName={(user as any)?.name || ""} onDone={() => { load(); router.push("/contractor-portal" as any); }} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{l}</Text></View>;
}
function Empty({ icon, title, sub, action, onAction }: { icon: string; title: string; sub?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 32, gap: 6 }}>
      <MaterialCommunityIcons name={icon as any} size={44} color={CON + "88"} />
      <Text style={st.emptyT}>{title}</Text>
      {!!sub && <Text style={[u.hint, { textAlign: "center" }]}>{sub}</Text>}
      {!!action && <Pressable onPress={onAction} style={[u.primary, { paddingHorizontal: 20, marginTop: 6 }]}><Text style={u.primaryT}>{action}</Text></Pressable>}
    </View>
  );
}

function JobCard({ j }: { j: Job }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", experience: "", note: "" });
  const apply = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول للتقديم");
    try { const r = await conApi.applyJob(token, j.id, f); notify("تم التقديم", r.message); setOpen(false); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <View style={[u.card, { marginBottom: 10 }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <Badge label={j.kind_label} color={CON} />
        <Text style={u.hint}>{fmtD(j.created_at)}</Text>
      </View>
      <Text style={[u.h, { marginTop: 6 }]}>{j.title}</Text>
      <Pressable onPress={() => router.push({ pathname: "/contractor", params: { id: String(j.contractor_id) } } as any)}><Text style={[u.hint, { color: CON }]}>{j.company_name}</Text></Pressable>
      <View style={[u.rowR, { gap: 12, flexWrap: "wrap", marginTop: 6 }]}>
        <Info icon="account-group-outline" t={`${j.workers_needed} ${j.workers_needed > 1 ? "أفراد" : "فرد"}`} />
        {j.wage != null && <Info icon="cash" t={`${money(j.wage)} ${j.wage_unit_label}`} />}
        {!!j.duration && <Info icon="calendar-range" t={j.duration} />}
        {!!j.location && <Info icon="map-marker-outline" t={j.location} />}
      </View>
      {!!j.description && <Text style={[u.hint, { marginTop: 6, color: Colors.textSecondary }]}>{j.description}</Text>}
      {open ? (
        <View style={{ marginTop: 8 }}>
          <TextInput value={f.name} onChangeText={(t) => setF({ ...f, name: t })} placeholder="الاسم" placeholderTextColor={Colors.textMuted} style={u.input} />
          <TextInput value={f.phone} onChangeText={(t) => setF({ ...f, phone: t })} placeholder="رقم الهاتف" keyboardType="phone-pad" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 6 }]} />
          <TextInput value={f.experience} onChangeText={(t) => setF({ ...f, experience: t })} placeholder="خبرتك (مثال: بنّاء 6 سنوات)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 6 }]} />
          <View style={[u.rowR, { gap: 8, marginTop: 8 }]}>
            <Pressable onPress={apply} style={[u.primary, { flex: 1 }]}><Text style={u.primaryT}>إرسال التقديم</Text></Pressable>
            <Pressable onPress={() => setOpen(false)} style={[u.ghost, { paddingHorizontal: 16 }]}><Text style={u.ghostT}>إلغاء</Text></Pressable>
          </View>
        </View>
      ) : <Pressable onPress={() => setOpen(true)} style={[u.primary, { marginTop: 10, paddingVertical: 10 }]}><MaterialCommunityIcons name="hand-wave-outline" size={17} color="#fff" /><Text style={u.primaryT}>قدّم الآن</Text></Pressable>}
    </View>
  );
}
function Info({ icon, t }: { icon: string; t: string }) {
  return <View style={[u.rowR, { gap: 4 }]}><MaterialCommunityIcons name={icon as any} size={14} color={Colors.textMuted} /><Text style={u.hint}>{t}</Text></View>;
}

function MyQuote({ q, token, onChange }: { q: Quote; token: string; onChange: () => void }) {
  const [rv, setRv] = useState<{ rating: number; quality: number; punctuality: number; price_value: number; comment: string } | null>(null);
  const color = QUOTE_COLOR[q.status] || CON;
  const act = async (a: "accept" | "decline" | "cancel") => {
    if (a !== "accept" && !(await confirmAction(a === "cancel" ? "إلغاء الطلب" : "رفض العرض", q.title, "تأكيد", true))) return;
    try { await conApi.quoteAction(token, q.id, a); onChange(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const sendReview = async () => {
    if (!rv?.rating) return notify("التقييم", "اختر عدد النجوم");
    try { await conApi.review(token, q.id, rv); notify("شكراً لك", "نُشر تقييمك"); setRv(null); onChange(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <View style={[u.card, { marginBottom: 10, borderRightWidth: 4, borderRightColor: color }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <Badge label={q.status_label} color={color} />
        <Text style={u.hint}>#{q.id} · {fmtD(q.created_at)}</Text>
      </View>
      <Text style={[u.h, { marginTop: 6 }]}>{q.title}</Text>
      <Text style={[u.hint, { color: CON }]}>{q.company_name}</Text>
      {/* مراحل الطلب */}
      <View style={[u.rowR, { marginTop: 10, gap: 4 }]}>
        {["new", "reviewing", "quoted", "accepted", "in_progress", "completed"].map((k, i, arr) => {
          const idx = arr.indexOf(q.status);
          const done = idx >= i && !["rejected", "cancelled"].includes(q.status);
          return <View key={k} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: done ? color : Colors.divider }} />;
        })}
      </View>
      {q.quote_amount != null && (
        <View style={st.quoteBox}>
          <Text style={u.hint}>عرض السعر</Text>
          <Text style={st.amount}>{money(q.quote_amount)}</Text>
          {!!q.quote_note && <Text style={[u.hint, { color: Colors.textSecondary }]}>{q.quote_note}</Text>}
          {!!q.quote_valid_until && <Text style={u.hint}>صالح حتى {fmtD(q.quote_valid_until)}</Text>}
        </View>
      )}
      {!!q.contract && <Text style={[u.hint, { marginTop: 6 }]}>العقد: {q.contract.contract_no} — {CONTRACT_STATUS[q.contract.status]?.label}</Text>}
      <View style={[u.rowR, { gap: 8, marginTop: 10, flexWrap: "wrap" }]}>
        {q.status === "quoted" && <Pressable onPress={() => act("accept")} style={[u.primary, { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#0E8A5F" }]}><Text style={u.primaryT}>قبول العرض</Text></Pressable>}
        {q.status === "quoted" && <Pressable onPress={() => act("decline")} style={u.ghost}><Text style={[u.ghostT, { color: "#B42318" }]}>رفض</Text></Pressable>}
        {["new", "reviewing", "quoted"].includes(q.status) && <Pressable onPress={() => act("cancel")} style={u.ghost}><Text style={u.ghostT}>إلغاء الطلب</Text></Pressable>}
        {!!q.company_whatsapp && <Pressable onPress={() => Linking.openURL(`https://wa.me/${q.company_whatsapp!.replace(/\D/g, "")}`)} style={u.ghost}><Ionicons name="logo-whatsapp" size={15} color="#128C7E" /><Text style={u.ghostT}>واتساب الشركة</Text></Pressable>}
        {q.status === "completed" && !q.reviewed && !rv && <Pressable onPress={() => setRv({ rating: 0, quality: 0, punctuality: 0, price_value: 0, comment: "" })} style={[u.primary, { paddingVertical: 8, paddingHorizontal: 14 }]}><Ionicons name="star" size={15} color="#fff" /><Text style={u.primaryT}>قيّم الشركة</Text></Pressable>}
      </View>
      {rv && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {([["rating", "التقييم العام"], ["quality", "جودة التنفيذ"], ["punctuality", "الالتزام بالوقت"], ["price_value", "السعر مقابل الجودة"]] as const).map(([k, l]) => (
            <View key={k} style={[u.rowR, { justifyContent: "space-between" }]}><Text style={u.hint}>{l}</Text><Stars value={rv[k]} size={20} onChange={(v) => setRv({ ...rv, [k]: v })} /></View>
          ))}
          <TextInput value={rv.comment} onChangeText={(t) => setRv({ ...rv, comment: t })} placeholder="اكتب تجربتك (اختياري)" placeholderTextColor={Colors.textMuted} multiline style={[u.input, { minHeight: 60, textAlignVertical: "top" }]} />
          <Pressable onPress={sendReview} style={u.primary}><Text style={u.primaryT}>نشر التقييم</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function MyContract({ k, token, onChange }: { k: Contract; token: string; onChange: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const cs = CONTRACT_STATUS[k.status];
  const view = async () => { if (text) return setText(null); try { setText((await conApi.contract(token, k.id)).text); } catch (e: any) { notify("تعذّر", e?.message); } };
  const respond = async (a: "accept" | "decline") => {
    if (!(await confirmAction(a === "accept" ? "قبول العقد" : "الاعتذار عن العقد", a === "accept" ? "بالقبول تُقرّ ببنود العقد ويُسجَّل قبولك الإلكتروني بتاريخه." : k.title, a === "accept" ? "أوافق" : "اعتذار", a !== "accept"))) return;
    try { await conApi.respondContract(token, k.id, a); onChange(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <View style={[u.card, { marginBottom: 10 }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}><Badge label={cs.label} color={cs.color} /><Text style={st.cno}>{k.contract_no}</Text></View>
      <Text style={[u.h, { marginTop: 6 }]}>{k.title}</Text>
      <Text style={[u.hint, { color: CON }]}>{k.company_name} · {money(k.price)}{k.duration_days ? ` · ${k.duration_days} يوماً` : ""}{k.warranty_months ? ` · ضمان ${k.warranty_months} شهراً` : ""}</Text>
      <View style={[u.rowR, { gap: 8, marginTop: 10, flexWrap: "wrap" }]}>
        <Pressable onPress={view} style={u.ghost}><Ionicons name="document-text-outline" size={15} color={Colors.textPrimary} /><Text style={u.ghostT}>{text ? "إخفاء النص" : "قراءة العقد"}</Text></Pressable>
        {k.status === "sent" && <Pressable onPress={() => respond("accept")} style={[u.primary, { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#0E8A5F" }]}><Text style={u.primaryT}>قبول وتوقيع إلكتروني</Text></Pressable>}
        {k.status === "sent" && <Pressable onPress={() => respond("decline")} style={u.ghost}><Text style={[u.ghostT, { color: "#B42318" }]}>اعتذار</Text></Pressable>}
      </View>
      {!!text && (
        <View style={st.paper}>
          <Text style={st.paperT} selectable>{text}</Text>
          <Pressable onPress={() => Share.share({ message: text }).catch(() => {})} style={[u.ghost, { marginTop: 10 }]}><Ionicons name="share-social-outline" size={15} color={Colors.textPrimary} /><Text style={u.ghostT}>مشاركة / طباعة</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function RegisterForm({ meta, token, ownerName, onDone }: { meta: Meta | null; token: string; ownerName: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", tagline: "", description: "", phone: "", whatsapp: "", email: "", address: "", city: "الحصاحيصا", license_no: "", founded_year: "", team_size: "", service_areas: "", owner_title: "" });
  const [sp, setSp] = useState<string[]>([]);
  const [logo, setLogo] = useState<string[]>([]); const [cover, setCover] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (t: string) => setF({ ...f, [k]: t });
  const submit = async () => {
    setSaving(true);
    try { const r = await conApi.register(token, { ...f, specialties: sp, logo_url: logo[0], cover_url: cover[0] }); notify("تم الإرسال", r.message); onDone(); }
    catch (e: any) { notify("تعذّر التسجيل", e?.message); } finally { setSaving(false); }
  };
  const F = (k: keyof typeof f, l: string, p?: string, kb?: any, multi?: boolean) => (
    <View><Text style={u.label}>{l}</Text><TextInput value={f[k]} onChangeText={set(k)} placeholder={p} keyboardType={kb} multiline={multi} placeholderTextColor={Colors.textMuted} style={[u.input, multi && { minHeight: 90, textAlignVertical: "top" }]} /></View>
  );
  return (
    <View style={{ marginTop: 8 }}>
      <View style={[u.card, { flexDirection: "row-reverse", gap: 10, alignItems: "center" }]}>
        <MaterialCommunityIcons name="shield-check-outline" size={26} color={CON} />
        <Text style={[u.hint, { flex: 1, color: Colors.textSecondary }]}>تُراجع الإدارة بيانات الشركة قبل ظهورها للعملاء. بعد الاعتماد تحصل على لوحة كاملة لك ولطاقمك: المشاريع، طلبات الأسعار، العقود، والتوظيف.</Text>
      </View>
      {F("name", "اسم الشركة *", "مثال: شركة النيل للمقاولات")}
      {F("tagline", "شعار قصير", "مثال: نبني بإتقان منذ 2010")}
      <Text style={u.label}>التخصصات *</Text>
      <View style={u.wrap}>{(meta?.specialties ?? []).map((s) => <Pill key={s.key} label={s.label} icon={s.icon} on={sp.includes(s.key)} onPress={() => setSp(sp.includes(s.key) ? sp.filter((x) => x !== s.key) : [...sp, s.key])} />)}</View>
      {F("description", "نبذة عن الشركة", "خبراتكم، أبرز أعمالكم، ما يميزكم…", undefined, true)}
      <View style={[u.rowR, { gap: 8 }]}><View style={{ flex: 1 }}>{F("phone", "الهاتف *", "09…", "phone-pad")}</View><View style={{ flex: 1 }}>{F("whatsapp", "واتساب", "2499…", "phone-pad")}</View></View>
      {F("email", "البريد", "", "email-address")}
      <View style={[u.rowR, { gap: 8 }]}><View style={{ flex: 1 }}>{F("address", "العنوان")}</View><View style={{ flex: 1 }}>{F("city", "المدينة")}</View></View>
      <View style={[u.rowR, { gap: 8 }]}>
        <View style={{ flex: 1 }}>{F("license_no", "رقم الترخيص / السجل")}</View>
        <View style={{ width: 90 }}>{F("founded_year", "سنة التأسيس", "", "number-pad")}</View>
        <View style={{ width: 80 }}>{F("team_size", "عدد العاملين", "", "number-pad")}</View>
      </View>
      {F("service_areas", "مناطق العمل (افصل بفاصلة)", "الحصاحيصا، رفاعة، المسيد…")}
      {F("owner_title", `صفتك (${ownerName || "المالك"})`, "المدير العام")}
      <ImagesField label="شعار الشركة" value={logo} onChange={setLogo} max={1} />
      <ImagesField label="صورة الغلاف" value={cover} onChange={setCover} max={1} />
      <Pressable onPress={submit} disabled={saving} style={[u.primary, { marginTop: 18, opacity: saving ? 0.7 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="send" size={17} color="#fff" />}<Text style={u.primaryT}>إرسال طلب التسجيل</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: "hidden" },
  hazard: { position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: "#F59E0B" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  cta: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#F59E0B", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  ctaT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#111827" },
  heroIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 25, color: "#fff", textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.82)", textAlign: "right", lineHeight: 20 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#F59E0B" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 12, marginTop: 14, height: 46 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 0 },
  tabsWrap: { backgroundColor: Colors.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tabs: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "center" },
  quoteBox: { marginTop: 10, backgroundColor: "#7C3AED0D", borderRadius: 12, padding: 10, gap: 2 },
  amount: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#7C3AED", textAlign: "right" },
  cno: { fontFamily: "Cairo_700Bold", fontSize: 12, color: CON, letterSpacing: 0.5 },
  paper: { marginTop: 10, backgroundColor: "#FFFDF8", borderRadius: 12, borderWidth: 1, borderColor: "#EFE5D2", padding: 14 },
  paperT: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#1F2937", textAlign: "right", lineHeight: 24 },
});
