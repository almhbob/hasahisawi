// لوحة شركة المقاولات — للمالك والطاقم حسب الصلاحيات:
// الإعدادات، معرض المشاريع (قبل/بعد)، صندوق طلبات الأسعار، مولّد العقود، التوظيف وطلب العمال، إدارة الطاقم.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Image, Linking, Share, Modal, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import {
  conApi, CON, CON_DEEP, money, fmtD, PERM_LABEL, QUOTE_COLOR, CONTRACT_STATUS,
  type Company, type Project, type Quote, type Contract, type Job, type Application, type StaffMember, type Meta, type PortalMe, type Perm, type PayStep,
} from "@/lib/contractors";
import { Badge, Pill, BeforeAfter, ImagesField, conStyles as u } from "@/components/contractors/ui";

type Tab = "overview" | "settings" | "projects" | "quotes" | "contracts" | "jobs" | "staff";
const TABS: { key: Tab; label: string; icon: string; perm?: Perm }[] = [
  { key: "overview", label: "نظرة عامة", icon: "view-dashboard-outline" },
  { key: "quotes", label: "طلبات الأسعار", icon: "file-document-edit-outline", perm: "quotes" },
  { key: "contracts", label: "العقود", icon: "file-sign", perm: "contracts" },
  { key: "projects", label: "المشاريع", icon: "image-multiple-outline", perm: "projects" },
  { key: "jobs", label: "التوظيف", icon: "account-hard-hat-outline", perm: "jobs" },
  { key: "staff", label: "الطاقم", icon: "account-group-outline", perm: "staff" },
  { key: "settings", label: "الإعدادات", icon: "cog-outline", perm: "settings" },
];
const tel = (p?: string | null) => p && Linking.openURL(`tel:${p}`);
const wa = (p?: string | null, text = "") => p && Linking.openURL(`https://wa.me/${p.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`);

export default function ContractorPortal() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.key === params.tab) ? params.tab : "overview") as Tab);
  const [quoteForContract, setQuoteForContract] = useState<Quote | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try { const [m, mt] = await Promise.all([conApi.portal(token), conApi.meta(token)]); setMe(m); setMeta(mt); setErr(""); }
    catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/contractors" as any));

  if (!token || isGuest) return <Center icon="lock-closed-outline" text="سجّل الدخول للوصول إلى لوحة الشركة" onBack={back} />;
  if (err) return <Center icon="alert-circle-outline" text={err} onBack={back} />;
  if (!me || !meta) return <View style={st.center}><ActivityIndicator color={CON} /></View>;
  if (!me.company) {
    return (
      <Center icon="business-outline" text="لا ترتبط بأي شركة مقاولات بعد. سجّل شركتك أو اطلب من مالك الشركة إضافتك للطاقم." onBack={back}>
        <Pressable style={[u.primary, { marginTop: 14, paddingHorizontal: 22 }]} onPress={() => router.replace({ pathname: "/contractors", params: { tab: "register" } } as any)}>
          <Text style={u.primaryT}>تسجيل شركة</Text>
        </Pressable>
      </Center>
    );
  }
  const c = me.company;
  const perms = me.perms || [];
  const can = (p?: Perm) => !p || perms.includes(p);
  const tabs = TABS.filter((t) => can(t.perm));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 8 }]}>
        <View style={u.rowR}>
          <Pressable onPress={back} hitSlop={10} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={22} color="#fff" /></Pressable>
          <View style={st.logo}>{c.logo_url ? <Image source={{ uri: c.logo_url }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name="hard-hat" size={22} color={CON} />}</View>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={st.hTitle} numberOfLines={1}>{c.name}</Text>
            <Text style={st.hSub}>لوحة الشركة · {me.role_label}</Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: "/contractor", params: { id: String(c.id) } } as any)} style={st.hBtn}>
            <Ionicons name="eye-outline" size={16} color="#fff" /><Text style={st.hBtnT}>الملف العام</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, paddingTop: 12 }}>
          {tabs.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, tab === t.key && st.tabOn]}>
              <MaterialCommunityIcons name={t.icon as any} size={15} color={tab === t.key ? CON_DEEP : "#fff"} />
              <Text style={[st.tabT, tab === t.key && { color: CON_DEEP }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {c.status !== "active" && (
        <View style={[st.banner, { backgroundColor: c.status === "pending" ? "#FEF3C7" : "#FEE2E2" }]}>
          <Ionicons name={c.status === "pending" ? "time-outline" : "alert-circle-outline"} size={18} color={c.status === "pending" ? "#92400E" : "#B42318"} />
          <Text style={[u.hint, { flex: 1, color: c.status === "pending" ? "#92400E" : "#B42318" }]}>
            {c.status === "pending" ? "طلب تسجيل شركتك قيد مراجعة الإدارة — يمكنك تجهيز الملف والمشاريع الآن، وستظهر للعملاء بعد الاعتماد."
              : c.status === "suspended" ? `الشركة موقوفة مؤقتاً${c.admin_note ? `: ${c.admin_note}` : ""}` : `لم يُعتمد الطلب${c.admin_note ? `: ${c.admin_note}` : ""} — عدّل البيانات من الإعدادات ليُعاد تقديمه.`}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {tab === "overview" && <Overview me={me} can={can} go={setTab} />}
        {tab === "settings" && <Settings company={c} meta={meta} onSaved={load} />}
        {tab === "projects" && <Projects meta={meta} />}
        {tab === "quotes" && <Quotes meta={meta} onContract={(q) => { setQuoteForContract(q); setTab("contracts"); }} canContract={can("contracts")} />}
        {tab === "contracts" && <Contracts fromQuote={quoteForContract} clearQuote={() => setQuoteForContract(null)} />}
        {tab === "jobs" && <Jobs meta={meta} />}
        {tab === "staff" && <Staff isOwner={me.role === "owner"} />}
      </ScrollView>
    </View>
  );
}

function Center({ icon, text, onBack, children }: { icon: string; text: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <View style={st.center}>
      <Ionicons name={icon as any} size={44} color={CON} />
      <Text style={[u.hint, { textAlign: "center", marginTop: 10, fontSize: 14 }]}>{text}</Text>
      {children}
      <Pressable onPress={onBack} style={[u.ghost, { marginTop: 10 }]}><Text style={u.ghostT}>رجوع</Text></Pressable>
    </View>
  );
}

function Field({ label, value, onChange, multiline, keyboard, placeholder }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; keyboard?: "numeric" | "phone-pad" | "email-address"; placeholder?: string }) {
  return (
    <View>
      <Text style={u.label}>{label}</Text>
      <TextInput style={[u.input, multiline && { minHeight: 90, textAlignVertical: "top" }]} value={value} onChangeText={onChange} multiline={multiline}
        keyboardType={keyboard} placeholder={placeholder} placeholderTextColor={Colors.textMuted} />
    </View>
  );
}
function Empty({ icon, text }: { icon: string; text: string }) {
  return <View style={{ alignItems: "center", paddingVertical: 36 }}><MaterialCommunityIcons name={icon as any} size={42} color={Colors.textMuted} /><Text style={[u.hint, { marginTop: 8 }]}>{text}</Text></View>;
}
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[u.rowR, { justifyContent: "space-between", marginBottom: 10 }]}>
      <Text style={[u.h, { fontSize: 16 }]}>{title}</Text>
      {!!action && <Pressable onPress={onAction} style={[st.smallBtn]}><Ionicons name="add" size={16} color="#fff" /><Text style={st.smallBtnT}>{action}</Text></Pressable>}
    </View>
  );
}
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
        <View style={[u.rowR, st.sheetHead]}>
          <Text style={[u.h, { flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق"><Ionicons name="close" size={24} color={Colors.textPrimary} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

// ───────── نظرة عامة ─────────
function Overview({ me, can, go }: { me: PortalMe; can: (p?: Perm) => boolean; go: (t: Tab) => void }) {
  const c = me.company!; const k = me.counts || { new_quotes: 0, active_jobs: 0, pending_contracts: 0, new_applicants: 0 };
  const cards: { label: string; v: number | string; icon: string; color: string; tab: Tab; perm?: Perm }[] = [
    { label: "طلبات أسعار جديدة", v: k.new_quotes, icon: "email-alert-outline", color: "#2563EB", tab: "quotes", perm: "quotes" },
    { label: "أعمال قيد التنفيذ", v: k.active_jobs, icon: "progress-wrench", color: CON, tab: "quotes", perm: "quotes" },
    { label: "عقود بانتظار العميل", v: k.pending_contracts, icon: "file-clock-outline", color: "#B7791F", tab: "contracts", perm: "contracts" },
    { label: "متقدمون جدد للوظائف", v: k.new_applicants, icon: "account-plus-outline", color: "#7C3AED", tab: "jobs", perm: "jobs" },
    { label: "مشاريع في المعرض", v: c.projects_count, icon: "image-multiple-outline", color: "#0E8A5F", tab: "projects", perm: "projects" },
    { label: "التقييم", v: c.rating ? `${c.rating.toFixed(1)} ★ (${c.reviews_count})` : "—", icon: "star-outline", color: "#D97706", tab: "overview" },
  ];
  const tips = [
    !c.logo_url && "أضف شعار الشركة وصورة غلاف من الإعدادات",
    c.projects_count < 3 && "أضف 3 مشاريع على الأقل بصور قبل/بعد — هذا أكثر ما يقنع العملاء",
    !c.whatsapp && "أضف رقم واتساب ليتواصل معك العملاء مباشرة",
    !c.description || c.description.length < 80 ? "اكتب نبذة تعريفية مفصلة عن خبرات الشركة" : null,
  ].filter(Boolean) as string[];
  return (
    <View>
      <View style={u.wrap}>
        {cards.filter((x) => can(x.perm)).map((x) => (
          <Pressable key={x.label} onPress={() => go(x.tab)} style={[u.card, st.kpi]}>
            <View style={[st.kpiIcon, { backgroundColor: x.color + "18" }]}><MaterialCommunityIcons name={x.icon as any} size={20} color={x.color} /></View>
            <Text style={[st.kpiV, { color: x.color }]}>{x.v}</Text>
            <Text style={u.hint}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {tips.length > 0 && can("settings") && (
        <View style={[u.card, { marginTop: 12, backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
          <Text style={u.h}>💡 حسّن ظهور شركتك</Text>
          {tips.map((t) => <Text key={t} style={[u.hint, { marginTop: 6 }]}>• {t}</Text>)}
        </View>
      )}
      <View style={[u.card, { marginTop: 12 }]}>
        <Text style={u.h}>صلاحياتك</Text>
        <View style={[u.wrap, { marginTop: 8 }]}>{(me.perms || []).map((p) => <Badge key={p} label={PERM_LABEL[p]} color={CON} />)}</View>
      </View>
    </View>
  );
}

// ───────── الإعدادات ─────────
function Settings({ company: c, meta, onSaved }: { company: Company; meta: Meta; onSaved: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState({
    name: c.name, tagline: c.tagline || "", description: c.description || "", phone: c.phone || "", whatsapp: c.whatsapp || "", email: c.email || "",
    address: c.address || "", city: c.city || "", license_no: c.license_no || "", founded_year: c.founded_year ? String(c.founded_year) : "",
    team_size: c.team_size ? String(c.team_size) : "", working_hours: c.working_hours || "", service_areas: (c.service_areas || []).join("، "),
  });
  const [specs, setSpecs] = useState<string[]>(c.specialties || []);
  const [logo, setLogo] = useState<string[]>(c.logo_url ? [c.logo_url] : []);
  const [cover, setCover] = useState<string[]>(c.cover_url ? [c.cover_url] : []);
  const [accepts, setAccepts] = useState(c.accepts_quotes);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const save = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await conApi.saveCompany(token, { ...f, specialties: specs, service_areas: f.service_areas.split(/[،,\n]/).map((x) => x.trim()).filter(Boolean),
        logo_url: logo[0] || null, cover_url: cover[0] || null, accepts_quotes: accepts });
      notify("تم الحفظ", "حُدّثت بيانات الشركة"); onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  return (
    <View>
      <View style={u.card}>
        <Text style={u.h}>الهوية البصرية</Text>
        <ImagesField label="الشعار" value={logo} onChange={setLogo} max={1} />
        <ImagesField label="صورة الغلاف" value={cover} onChange={setCover} max={1} />
      </View>
      <View style={[u.card, { marginTop: 12 }]}>
        <Text style={u.h}>بيانات الشركة</Text>
        <Field label="اسم الشركة" value={f.name} onChange={set("name")} />
        <Field label="شعار نصي قصير" value={f.tagline} onChange={set("tagline")} placeholder="مثال: نبني بإتقان منذ 2010" />
        <Field label="نبذة عن الشركة" value={f.description} onChange={set("description")} multiline />
        <Text style={u.label}>التخصصات</Text>
        <View style={u.wrap}>
          {meta.specialties.map((s) => <Pill key={s.key} label={s.label} icon={s.icon} on={specs.includes(s.key)} onPress={() => setSpecs((o) => (o.includes(s.key) ? o.filter((x) => x !== s.key) : [...o, s.key]))} />)}
        </View>
        <Field label="مناطق الخدمة (افصل بفاصلة)" value={f.service_areas} onChange={set("service_areas")} placeholder="الحصاحيصا، رفاعة، ود مدني" />
        <View style={[u.rowR, { gap: 10 }]}>
          <View style={{ flex: 1 }}><Field label="سنة التأسيس" value={f.founded_year} onChange={set("founded_year")} keyboard="numeric" /></View>
          <View style={{ flex: 1 }}><Field label="عدد العاملين" value={f.team_size} onChange={set("team_size")} keyboard="numeric" /></View>
        </View>
        <Field label="رقم الترخيص / السجل التجاري" value={f.license_no} onChange={set("license_no")} />
        <Field label="ساعات العمل" value={f.working_hours} onChange={set("working_hours")} placeholder="السبت–الخميس 8ص–5م" />
      </View>
      <View style={[u.card, { marginTop: 12 }]}>
        <Text style={u.h}>التواصل</Text>
        <Field label="الهاتف" value={f.phone} onChange={set("phone")} keyboard="phone-pad" />
        <Field label="واتساب" value={f.whatsapp} onChange={set("whatsapp")} keyboard="phone-pad" />
        <Field label="البريد الإلكتروني" value={f.email} onChange={set("email")} keyboard="email-address" />
        <Field label="المدينة" value={f.city} onChange={set("city")} />
        <Field label="العنوان" value={f.address} onChange={set("address")} />
        <View style={[u.rowR, { justifyContent: "space-between", marginTop: 14 }]}>
          <View style={{ flex: 1 }}><Text style={u.h}>استقبال طلبات الأسعار</Text><Text style={u.hint}>أوقفه مؤقتاً عند امتلاء جدول الأعمال</Text></View>
          <Switch value={accepts} onValueChange={setAccepts} trackColor={{ true: CON, false: Colors.divider }} />
        </View>
      </View>
      <Pressable style={[u.primary, { marginTop: 16 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
        {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={u.primaryT}>حفظ الإعدادات</Text></>}
      </Pressable>
    </View>
  );
}

// ───────── المشاريع ─────────
const emptyProject = { title: "", specialty: "", location: "", description: "", completed_on: "", duration_days: "", client_label: "", featured: false, before: [] as string[], after: [] as string[], gallery: [] as string[] };
function Projects({ meta }: { meta: Meta }) {
  const { token } = useAuth();
  const [list, setList] = useState<Project[] | null>(null);
  const [edit, setEdit] = useState<{ id?: number; f: typeof emptyProject } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (token) try { setList((await conApi.projects(token)).projects); } catch (e: any) { notify("خطأ", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  const open = (p?: Project) => setEdit(p ? { id: p.id, f: { title: p.title, specialty: p.specialty || "", location: p.location || "", description: p.description || "", completed_on: p.completed_on?.slice(0, 10) || "",
    duration_days: p.duration_days ? String(p.duration_days) : "", client_label: p.client_label || "", featured: p.featured, before: p.before_images, after: p.after_images, gallery: p.gallery } } : { f: { ...emptyProject } });
  const save = async () => {
    if (!token || !edit) return;
    const f = edit.f; setBusy(true);
    try {
      await conApi.saveProject(token, { title: f.title, specialty: f.specialty || null, location: f.location, description: f.description, completed_on: f.completed_on || null,
        duration_days: f.duration_days || null, client_label: f.client_label, featured: f.featured, before_images: f.before, after_images: f.after, gallery: f.gallery }, edit.id);
      setEdit(null); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  const del = async (p: Project) => {
    if (!token || !(await confirmAction("حذف المشروع", `حذف «${p.title}» من المعرض؟`, "حذف", true))) return;
    try { await conApi.deleteProject(token, p.id); load(); } catch (e: any) { notify("خطأ", e?.message); }
  };
  const setE = (patch: Partial<typeof emptyProject>) => setEdit((o) => (o ? { ...o, f: { ...o.f, ...patch } } : o));
  const specLabel = (k: string | null) => meta.specialties.find((s) => s.key === k)?.label;
  return (
    <View>
      <SectionHead title="معرض المشاريع المنجزة" action="مشروع جديد" onAction={() => open()} />
      {!list ? <ActivityIndicator color={CON} /> : !list.length ? <Empty icon="image-plus" text="أضف أول مشروع بصور قبل وبعد" /> : list.map((p) => (
        <View key={p.id} style={[u.card, { marginBottom: 12, padding: 0, overflow: "hidden" }]}>
          {p.before_images[0] && p.after_images[0] ? <BeforeAfter before={p.before_images[0]} after={p.after_images[0]} height={180} />
            : <Image source={{ uri: p.after_images[0] || p.gallery[0] || p.before_images[0] }} style={{ height: 180, backgroundColor: Colors.divider }} />}
          <View style={{ padding: 12 }}>
            <View style={[u.rowR, { gap: 6 }]}>
              <Text style={[u.h, { flex: 1 }]} numberOfLines={1}>{p.title}</Text>
              {p.featured && <Badge label="مميّز" color="#D97706" />}
            </View>
            <Text style={u.hint}>{[specLabel(p.specialty), p.location, p.completed_on && fmtD(p.completed_on)].filter(Boolean).join(" · ")}</Text>
            <Text style={u.hint}>قبل: {p.before_images.length} · بعد: {p.after_images.length} · معرض: {p.gallery.length}</Text>
            <View style={[u.rowR, { gap: 8, marginTop: 10 }]}>
              <Pressable style={u.ghost} onPress={() => open(p)}><Ionicons name="create-outline" size={16} color={Colors.textPrimary} /><Text style={u.ghostT}>تعديل</Text></Pressable>
              <Pressable style={u.ghost} onPress={() => del(p)}><Ionicons name="trash-outline" size={16} color="#B42318" /><Text style={[u.ghostT, { color: "#B42318" }]}>حذف</Text></Pressable>
            </View>
          </View>
        </View>
      ))}
      <Sheet visible={!!edit} title={edit?.id ? "تعديل المشروع" : "مشروع جديد"} onClose={() => setEdit(null)}>
        {edit && <>
          <Field label="عنوان المشروع" value={edit.f.title} onChange={(v) => setE({ title: v })} placeholder="مثال: تشطيب فيلا سكنية — حي الشاطئ" />
          <Text style={u.label}>التخصص</Text>
          <View style={u.wrap}>{meta.specialties.map((s) => <Pill key={s.key} label={s.label} icon={s.icon} on={edit.f.specialty === s.key} onPress={() => setE({ specialty: edit.f.specialty === s.key ? "" : s.key })} />)}</View>
          <Field label="الموقع" value={edit.f.location} onChange={(v) => setE({ location: v })} />
          <Field label="وصف الأعمال المنجزة" value={edit.f.description} onChange={(v) => setE({ description: v })} multiline />
          <View style={[u.rowR, { gap: 10 }]}>
            <View style={{ flex: 1 }}><Field label="تاريخ الإنجاز (YYYY-MM-DD)" value={edit.f.completed_on} onChange={(v) => setE({ completed_on: v })} /></View>
            <View style={{ flex: 1 }}><Field label="المدة (أيام)" value={edit.f.duration_days} onChange={(v) => setE({ duration_days: v })} keyboard="numeric" /></View>
          </View>
          <Field label="العميل (اختياري)" value={edit.f.client_label} onChange={(v) => setE({ client_label: v })} placeholder="مثال: مدرسة الحصاحيصا الثانوية" />
          <View style={[u.card, { marginTop: 14, backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
            <Text style={u.h}>صور قبل وبعد</Text>
            <Text style={u.hint}>رتّب الصور بنفس الترتيب: الصورة الأولى «قبل» تقابل الأولى «بعد» لعرض المقارنة بالسحب.</Text>
            <ImagesField label="قبل العمل" value={edit.f.before} onChange={(v) => setE({ before: v })} max={8} />
            <ImagesField label="بعد العمل" value={edit.f.after} onChange={(v) => setE({ after: v })} max={8} />
          </View>
          {edit.f.before[0] && edit.f.after[0] ? <View style={{ marginTop: 12, borderRadius: 14, overflow: "hidden" }}><BeforeAfter before={edit.f.before[0]} after={edit.f.after[0]} height={200} /></View> : null}
          <ImagesField label="معرض صور إضافية" value={edit.f.gallery} onChange={(v) => setE({ gallery: v })} max={20} />
          <View style={[u.rowR, { justifyContent: "space-between", marginTop: 14 }]}>
            <Text style={u.h}>إبراز المشروع في أعلى الملف</Text>
            <Switch value={edit.f.featured} onValueChange={(v) => setE({ featured: v })} trackColor={{ true: CON, false: Colors.divider }} />
          </View>
          <Pressable style={[u.primary, { marginTop: 18 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={u.primaryT}>حفظ المشروع</Text>}
          </Pressable>
        </>}
      </Sheet>
    </View>
  );
}

// ───────── طلبات الأسعار ─────────
const PIPE = ["new", "reviewing", "quoted", "accepted", "in_progress", "completed"];
function Quotes({ meta, onContract, canContract }: { meta: Meta; onContract: (q: Quote) => void; canContract: boolean }) {
  const { token } = useAuth();
  const [status, setStatus] = useState("");
  const [d, setD] = useState<{ quotes: Quote[]; counts: Record<string, number> } | null>(null);
  const [open, setOpen] = useState<Quote | null>(null);
  const load = useCallback(async () => { if (token) try { setD(await conApi.quotes(token, status || undefined)); } catch (e: any) { notify("خطأ", e?.message); } }, [token, status]);
  useEffect(() => { load(); }, [load]);
  const labels = meta.quote_labels;
  const total = d ? Object.values(d.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <View>
      <SectionHead title="صندوق طلبات الأسعار" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, paddingBottom: 10 }}>
        <Pill label={`الكل (${total})`} on={!status} onPress={() => setStatus("")} />
        {Object.keys(labels).map((k) => <Pill key={k} label={`${labels[k]}${d?.counts[k] ? ` (${d.counts[k]})` : ""}`} on={status === k} color={QUOTE_COLOR[k]} onPress={() => setStatus(k)} />)}
      </ScrollView>
      {!d ? <ActivityIndicator color={CON} /> : !d.quotes.length ? <Empty icon="email-open-outline" text="لا توجد طلبات في هذا التصنيف" /> : d.quotes.map((q) => (
        <Pressable key={q.id} onPress={() => setOpen(q)} style={[u.card, { marginBottom: 10 }]}>
          <View style={[u.rowR, { gap: 10 }]}>
            <UserAvatar avatarUrl={q.client_avatar} name={q.client_name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={u.h} numberOfLines={1}>{q.title}</Text>
              <Text style={u.hint}>{q.client_name} · {fmtD(q.created_at)}{q.location ? ` · ${q.location}` : ""}</Text>
            </View>
            <Badge label={q.status_label} color={QUOTE_COLOR[q.status] || CON} />
          </View>
          {q.quote_amount ? <Text style={[u.hint, { marginTop: 6, color: CON, fontFamily: "Cairo_700Bold" }]}>العرض: {money(q.quote_amount)}</Text> : null}
          {q.contract && <Text style={[u.hint, { marginTop: 2 }]}>📄 {q.contract.contract_no} — {CONTRACT_STATUS[q.contract.status]?.label}</Text>}
        </Pressable>
      ))}
      <QuoteSheet q={open} meta={meta} onClose={() => setOpen(null)} onSaved={(nq) => { setOpen(nq); load(); }} onContract={canContract ? (q) => { setOpen(null); onContract(q); } : undefined} />
    </View>
  );
}

function QuoteSheet({ q, meta, onClose, onSaved, onContract }: { q: Quote | null; meta: Meta; onClose: () => void; onSaved: (q: Quote) => void; onContract?: (q: Quote) => void }) {
  const { token } = useAuth();
  const [amount, setAmount] = useState(""); const [note, setNote] = useState(""); const [valid, setValid] = useState(""); const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q) return;
    setAmount(q.quote_amount ? String(q.quote_amount) : ""); setNote(q.quote_note || ""); setValid(q.quote_valid_until?.slice(0, 10) || ""); setInternal(q.internal_note || "");
  }, [q?.id]);
  if (!q) return null;
  const patch = async (b: Record<string, unknown>, msg?: string) => {
    if (!token) return; setBusy(true);
    try { const r = await conApi.updateQuote(token, q.id, b); onSaved({ ...q, ...r.quote }); if (msg) notify("تم", msg); }
    catch (e: any) { notify("تعذّر التحديث", e?.message); } finally { setBusy(false); }
  };
  const sendQuote = () => patch({ status: "quoted", quote_amount: Number(amount.replace(/[^\d.]/g, "")) || null, quote_note: note, quote_valid_until: valid || null }, "أُرسل عرض السعر للعميل");
  const idx = PIPE.indexOf(q.status);
  const specLabel = meta.specialties.find((s) => s.key === q.specialty)?.label;
  const next: { s: string; label: string; icon: string }[] = [];
  if (q.status === "new") next.push({ s: "reviewing", label: "بدء الدراسة", icon: "magnify" });
  if (q.status === "accepted") next.push({ s: "in_progress", label: "بدء التنفيذ", icon: "hammer-wrench" });
  if (q.status === "in_progress") next.push({ s: "completed", label: "تم الإنجاز", icon: "check-decagram" });
  const closed = ["rejected", "cancelled", "completed"].includes(q.status);
  return (
    <Sheet visible title={`طلب #${q.id}`} onClose={onClose}>
      <View style={[u.rowR, { gap: 4, marginBottom: 14 }]}>
        {PIPE.map((p, i) => (
          <View key={p} style={{ flex: 1, alignItems: "center" }}>
            <View style={[st.pipe, { backgroundColor: idx >= i && idx >= 0 ? QUOTE_COLOR[p] : Colors.divider }]} />
            <Text style={[st.pipeT, idx === i && { color: QUOTE_COLOR[p], fontFamily: "Cairo_700Bold" }]} numberOfLines={1}>{meta.quote_labels[p]}</Text>
          </View>
        ))}
      </View>
      {idx < 0 && <Badge label={q.status_label} color={QUOTE_COLOR[q.status] || "#6B7280"} />}
      <View style={u.card}>
        <Text style={u.h}>{q.title}</Text>
        <Text style={u.hint}>{[specLabel, q.location, q.budget && `الميزانية: ${q.budget}`, q.preferred_start && `البدء: ${q.preferred_start}`].filter(Boolean).join(" · ")}</Text>
        {!!q.details && <Text style={[u.hint, { color: Colors.textPrimary, marginTop: 8, fontSize: 13.5 }]}>{q.details}</Text>}
        {q.images.length > 0 && (
          <ScrollView horizontal contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
            {q.images.map((im) => <Pressable key={im} onPress={() => Linking.openURL(im)}><Image source={{ uri: im }} style={st.qImg} /></Pressable>)}
          </ScrollView>
        )}
      </View>
      <View style={[u.card, { marginTop: 10 }]}>
        <Text style={u.h}>العميل</Text>
        <View style={[u.rowR, { gap: 10, marginTop: 8 }]}>
          <UserAvatar avatarUrl={q.client_avatar} name={q.client_name} size={40} />
          <View style={{ flex: 1 }}><Text style={u.h}>{q.client_name}</Text><Text style={u.hint}>{q.client_phone}</Text></View>
          <Pressable accessibilityRole="button" hitSlop={8} style={st.iconBtn} onPress={() => tel(q.client_phone)} accessibilityLabel="اتصال"><Ionicons name="call" size={18} color={CON} /></Pressable>
          <Pressable accessibilityRole="button" hitSlop={8} style={st.iconBtn} onPress={() => wa(q.client_phone, `بخصوص طلبكم: ${q.title}`)} accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={18} color="#16A34A" /></Pressable>
        </View>
      </View>

      {!closed && ["new", "reviewing", "quoted"].includes(q.status) && (
        <View style={[u.card, { marginTop: 10, borderColor: "#DDD6FE" }]}>
          <Text style={u.h}>{q.status === "quoted" ? "تعديل عرض السعر" : "إرسال عرض سعر"}</Text>
          <Field label="القيمة الإجمالية (ج.س)" value={amount} onChange={setAmount} keyboard="numeric" />
          <Field label="تفاصيل العرض وما يشمله" value={note} onChange={setNote} multiline placeholder="المواد، العمالة، مدة التنفيذ، الاستثناءات…" />
          <Field label="صالح حتى (YYYY-MM-DD)" value={valid} onChange={setValid} />
          <Pressable style={[u.primary, { marginTop: 12, backgroundColor: "#7C3AED" }, busy && { opacity: 0.6 }]} disabled={busy} onPress={sendQuote}>
            <Ionicons name="send" size={16} color="#fff" /><Text style={u.primaryT}>إرسال العرض للعميل</Text>
          </Pressable>
        </View>
      )}

      <View style={[u.wrap, { marginTop: 12 }]}>
        {next.map((n) => (
          <Pressable key={n.s} style={[u.ghost, { borderColor: QUOTE_COLOR[n.s] }]} disabled={busy} onPress={() => patch({ status: n.s })}>
            <MaterialCommunityIcons name={n.icon as any} size={16} color={QUOTE_COLOR[n.s]} /><Text style={[u.ghostT, { color: QUOTE_COLOR[n.s] }]}>{n.label}</Text>
          </Pressable>
        ))}
        {onContract && ["quoted", "accepted", "in_progress"].includes(q.status) && !q.contract && (
          <Pressable style={[u.ghost, { borderColor: CON }]} onPress={() => onContract(q)}>
            <MaterialCommunityIcons name="file-sign" size={16} color={CON} /><Text style={[u.ghostT, { color: CON }]}>إنشاء عقد</Text>
          </Pressable>
        )}
        {!closed && q.status !== "rejected" && (
          <Pressable style={[u.ghost, { borderColor: "#FCA5A5" }]} disabled={busy} onPress={async () => { if (await confirmAction("اعتذار عن الطلب", "سيُبلَّغ العميل باعتذار الشركة.", "اعتذار", true)) patch({ status: "rejected" }); }}>
            <Ionicons name="close-circle-outline" size={16} color="#B42318" /><Text style={[u.ghostT, { color: "#B42318" }]}>اعتذار</Text>
          </Pressable>
        )}
      </View>

      <View style={[u.card, { marginTop: 12, backgroundColor: "#F9FAFB" }]}>
        <Text style={u.h}>🔒 ملاحظة داخلية للطاقم</Text>
        <TextInput style={[u.input, { minHeight: 70, textAlignVertical: "top", marginTop: 8 }]} multiline value={internal} onChangeText={setInternal} placeholder="لا تظهر للعميل" placeholderTextColor={Colors.textMuted} />
        <Pressable style={[u.ghost, { marginTop: 8, alignSelf: "flex-end" }]} disabled={busy} onPress={() => patch({ internal_note: internal }, "حُفظت الملاحظة")}><Text style={u.ghostT}>حفظ الملاحظة</Text></Pressable>
      </View>
    </Sheet>
  );
}

// ───────── العقود ─────────
const DEFAULT_TERMS = [
  "يلتزم المقاول بتنفيذ الأعمال وفق الأصول الفنية والمواصفات المتفق عليها.",
  "أي أعمال إضافية خارج نطاق العقد تُتفق كتابياً قبل تنفيذها.",
  "يتحمّل المقاول مسؤولية سلامة العمال في الموقع طوال فترة التنفيذ.",
  "في حال التأخير لأسباب خارجة عن إرادة الطرفين تُمدد المدة بالتراضي.",
];
const DEFAULT_SCHED: PayStep[] = [{ label: "دفعة مقدمة عند التوقيع", percent: 30 }, { label: "عند إنجاز 50% من الأعمال", percent: 40 }, { label: "عند التسليم النهائي", percent: 30 }];
function Contracts({ fromQuote, clearQuote }: { fromQuote: Quote | null; clearQuote: () => void }) {
  const { token } = useAuth();
  const [list, setList] = useState<Contract[] | null>(null);
  const [form, setForm] = useState(false);
  const [view, setView] = useState<{ c: Contract; text: string } | null>(null);
  const load = useCallback(async () => { if (token) try { setList((await conApi.contracts(token)).contracts); } catch (e: any) { notify("خطأ", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (fromQuote) setForm(true); }, [fromQuote]);
  const openView = async (k: Contract) => { if (!token) return; try { const r = await conApi.contract(token, k.id); setView({ c: r.contract, text: r.text }); } catch (e: any) { notify("خطأ", e?.message); } };
  const act = async (k: Contract, action: "send" | "complete" | "cancel") => {
    if (!token) return;
    const msgs = { send: "إرسال العقد للعميل للموافقة؟", complete: "تأكيد إنجاز الأعمال وفق العقد؟", cancel: "إلغاء العقد؟" };
    if (!(await confirmAction("تأكيد", msgs[action], "تأكيد", action === "cancel"))) return;
    try { await conApi.contractAction(token, k.id, action); load(); setView(null); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <View>
      <SectionHead title="العقود" action="عقد جديد" onAction={() => { clearQuote(); setForm(true); }} />
      <Text style={[u.hint, { marginBottom: 10 }]}>يُنشأ لكل عقد رقم مرجعي (HSW-CON-السنة-التسلسل). العقود المرتبطة بطلب سعر تصل العميل ليوافق عليها إلكترونياً داخل التطبيق.</Text>
      {!list ? <ActivityIndicator color={CON} /> : !list.length ? <Empty icon="file-document-outline" text="لا توجد عقود بعد" /> : list.map((k) => {
        const s = CONTRACT_STATUS[k.status];
        return (
          <Pressable key={k.id} onPress={() => openView(k)} style={[u.card, { marginBottom: 10 }]}>
            <View style={[u.rowR, { gap: 8 }]}>
              <MaterialCommunityIcons name="file-sign" size={26} color={CON} />
              <View style={{ flex: 1 }}>
                <Text style={u.h} numberOfLines={1}>{k.title}</Text>
                <Text style={u.hint}>{k.contract_no} · {k.client_name}</Text>
              </View>
              <Badge label={s.label} color={s.color} />
            </View>
            <View style={[u.rowR, { justifyContent: "space-between", marginTop: 8 }]}>
              <Text style={[u.h, { color: CON }]}>{money(k.price)}</Text>
              <Text style={u.hint}>{fmtD(k.created_at)}</Text>
            </View>
          </Pressable>
        );
      })}
      <Sheet visible={form} title="مولّد العقود" onClose={() => { setForm(false); clearQuote(); }}>
        <ContractForm quote={fromQuote} onDone={(r) => { setForm(false); clearQuote(); load(); setView({ c: r.contract, text: r.text }); }} />
      </Sheet>
      <Sheet visible={!!view} title={view?.c.contract_no || ""} onClose={() => setView(null)}>
        {view && <>
          <Badge label={CONTRACT_STATUS[view.c.status].label} color={CONTRACT_STATUS[view.c.status].color} />
          {view.c.accepted_at && <Text style={[u.hint, { marginTop: 6 }]}>✅ وافق العميل إلكترونياً في {fmtD(view.c.accepted_at)}</Text>}
          {!!view.c.client_response_note && <Text style={[u.hint, { marginTop: 4 }]}>ملاحظة العميل: {view.c.client_response_note}</Text>}
          <View style={[u.card, { marginTop: 10, backgroundColor: "#FFFDF7" }]}><Text selectable style={st.contractText}>{view.text}</Text></View>
          <View style={[u.wrap, { marginTop: 12 }]}>
            <Pressable style={u.ghost} onPress={() => Share.share({ message: view.text, title: view.c.contract_no })}><Ionicons name="share-outline" size={16} color={Colors.textPrimary} /><Text style={u.ghostT}>مشاركة النص</Text></Pressable>
            {view.c.client_phone && <Pressable style={u.ghost} onPress={() => wa(view.c.client_phone, view.text)}><Ionicons name="logo-whatsapp" size={16} color="#16A34A" /><Text style={u.ghostT}>إرسال واتساب</Text></Pressable>}
            {view.c.status === "draft" && view.c.client_id && <Pressable style={[u.ghost, { borderColor: CON }]} onPress={() => act(view.c, "send")}><Ionicons name="send" size={16} color={CON} /><Text style={[u.ghostT, { color: CON }]}>إرسال للعميل</Text></Pressable>}
            {view.c.status === "accepted" && <Pressable style={[u.ghost, { borderColor: "#0E8A5F" }]} onPress={() => act(view.c, "complete")}><Ionicons name="checkmark-done" size={16} color="#0E8A5F" /><Text style={[u.ghostT, { color: "#0E8A5F" }]}>تم الإنجاز</Text></Pressable>}
            {["draft", "sent"].includes(view.c.status) && <Pressable style={[u.ghost, { borderColor: "#FCA5A5" }]} onPress={() => act(view.c, "cancel")}><Ionicons name="close-circle-outline" size={16} color="#B42318" /><Text style={[u.ghostT, { color: "#B42318" }]}>إلغاء</Text></Pressable>}
          </View>
        </>}
      </Sheet>
    </View>
  );
}

function ContractForm({ quote, onDone }: { quote: Quote | null; onDone: (r: { contract: Contract; text: string }) => void }) {
  const { token } = useAuth();
  const [f, setF] = useState({
    client_name: quote?.client_name || "", client_phone: quote?.client_phone || "", client_id_no: "", title: quote?.title || "",
    scope: quote ? [quote.details, quote.quote_note].filter(Boolean).join("\n\n") : "", location: quote?.location || "",
    price: quote?.quote_amount ? String(quote.quote_amount) : "", start_date: "", duration_days: "", warranty_months: "12",
  });
  const [sched, setSched] = useState<{ label: string; percent: string }[]>(DEFAULT_SCHED.map((s) => ({ label: s.label, percent: String(s.percent) })));
  const [terms, setTerms] = useState<string[]>(DEFAULT_TERMS);
  const [newTerm, setNewTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const price = Number(f.price.replace(/[^\d.]/g, "")) || 0;
  const pct = sched.reduce((a, s) => a + (Number(s.percent) || 0), 0);
  const submit = async (send: boolean) => {
    if (!token) return;
    if (sched.length && Math.round(pct) !== 100) return notify("جدول الدفعات", `مجموع النسب ${pct}% — يجب أن يساوي 100%`);
    setBusy(true);
    try {
      const r = await conApi.createContract(token, {
        ...f, price, quote_id: quote?.id, send, duration_days: f.duration_days || null, warranty_months: f.warranty_months || null, start_date: f.start_date || null,
        payment_schedule: sched.filter((s) => s.label.trim()).map((s) => ({ label: s.label, percent: Number(s.percent) || 0 })), terms,
      });
      notify(send ? "أُرسل العقد" : "حُفظت المسودة", `${r.contract.contract_no}${send ? " — بانتظار موافقة العميل" : ""}`);
      onDone(r);
    } catch (e: any) { notify("تعذّر إنشاء العقد", e?.message); } finally { setBusy(false); }
  };
  return (
    <View>
      {quote && <View style={[u.card, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}><Text style={u.hint}>مرتبط بطلب السعر #{quote.id} — سيصل العقد للعميل ليوقّعه إلكترونياً.</Text></View>}
      <Text style={[u.h, { marginTop: 12 }]}>الطرف الثاني (العميل)</Text>
      <Field label="الاسم الكامل" value={f.client_name} onChange={set("client_name")} />
      <View style={[u.rowR, { gap: 10 }]}>
        <View style={{ flex: 1 }}><Field label="الهاتف" value={f.client_phone} onChange={set("client_phone")} keyboard="phone-pad" /></View>
        <View style={{ flex: 1 }}><Field label="رقم الهوية (اختياري)" value={f.client_id_no} onChange={set("client_id_no")} /></View>
      </View>
      <Text style={[u.h, { marginTop: 16 }]}>موضوع العقد</Text>
      <Field label="عنوان الأعمال" value={f.title} onChange={set("title")} />
      <Field label="نطاق الأعمال والمواصفات" value={f.scope} onChange={set("scope")} multiline placeholder="صف الأعمال بالتفصيل: البنود، المواد، المواصفات…" />
      <Field label="موقع التنفيذ" value={f.location} onChange={set("location")} />
      <View style={[u.rowR, { gap: 10 }]}>
        <View style={{ flex: 1 }}><Field label="تاريخ البدء" value={f.start_date} onChange={set("start_date")} placeholder="YYYY-MM-DD" /></View>
        <View style={{ flex: 1 }}><Field label="المدة (أيام)" value={f.duration_days} onChange={set("duration_days")} keyboard="numeric" /></View>
      </View>
      <Field label="فترة الضمان (أشهر)" value={f.warranty_months} onChange={set("warranty_months")} keyboard="numeric" />
      <Text style={[u.h, { marginTop: 16 }]}>القيمة وجدول الدفعات</Text>
      <Field label="قيمة العقد الإجمالية (ج.س)" value={f.price} onChange={set("price")} keyboard="numeric" />
      {sched.map((s, i) => (
        <View key={i} style={[u.rowR, { gap: 8, marginTop: 8 }]}>
          <TextInput style={[u.input, { flex: 1 }]} value={s.label} onChangeText={(v) => setSched((o) => o.map((x, j) => (j === i ? { ...x, label: v } : x)))} placeholder="وصف الدفعة" placeholderTextColor={Colors.textMuted} />
          <TextInput style={[u.input, { width: 64, textAlign: "center" }]} value={s.percent} keyboardType="numeric" onChangeText={(v) => setSched((o) => o.map((x, j) => (j === i ? { ...x, percent: v } : x)))} />
          <Text style={[u.hint, { width: 84 }]}>{price ? money(Math.round(price * (Number(s.percent) || 0)) / 100) : "%"}</Text>
          <Pressable accessibilityRole="button" onPress={() => setSched((o) => o.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="حذف الدفعة"><Ionicons name="remove-circle-outline" size={20} color="#B42318" /></Pressable>
        </View>
      ))}
      <View style={[u.rowR, { justifyContent: "space-between", marginTop: 8 }]}>
        <Pressable onPress={() => setSched((o) => [...o, { label: "", percent: "" }].slice(0, 10))}><Text style={[u.hint, { color: CON, fontFamily: "Cairo_700Bold" }]}>+ إضافة دفعة</Text></Pressable>
        <Text style={[u.hint, { color: Math.round(pct) === 100 ? "#0E8A5F" : "#B42318", fontFamily: "Cairo_700Bold" }]}>المجموع {pct}%</Text>
      </View>
      <Text style={[u.h, { marginTop: 16 }]}>الشروط العامة</Text>
      {terms.map((t, i) => (
        <View key={i} style={[u.rowR, { gap: 8, marginTop: 6, alignItems: "flex-start" }]}>
          <Text style={[u.hint, { flex: 1, color: Colors.textPrimary }]}>{i + 1}. {t}</Text>
          <Pressable accessibilityRole="button" onPress={() => setTerms((o) => o.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="حذف الشرط"><Ionicons name="close" size={16} color={Colors.textMuted} /></Pressable>
        </View>
      ))}
      <View style={[u.rowR, { gap: 8, marginTop: 8 }]}>
        <TextInput style={[u.input, { flex: 1 }]} value={newTerm} onChangeText={setNewTerm} placeholder="أضف شرطاً" placeholderTextColor={Colors.textMuted} />
        <Pressable accessibilityRole="button" accessibilityLabel="إضافة" hitSlop={8} style={st.smallBtn} onPress={() => { if (newTerm.trim()) { setTerms((o) => [...o, newTerm.trim()].slice(0, 15)); setNewTerm(""); } }}><Ionicons name="add" size={18} color="#fff" /></Pressable>
      </View>
      <View style={[u.rowR, { gap: 10, marginTop: 20 }]}>
        <Pressable style={[u.ghost, { flex: 1, paddingVertical: 13 }]} disabled={busy} onPress={() => submit(false)}><Text style={u.ghostT}>حفظ كمسودة</Text></Pressable>
        {quote?.client_id ? (
          <Pressable style={[u.primary, { flex: 1 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => submit(true)}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={16} color="#fff" /><Text style={u.primaryT}>إرسال للعميل</Text></>}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ───────── التوظيف وطلب العمال ─────────
const emptyJob = { kind: "daily", title: "", trade: "", workers_needed: "1", wage: "", wage_unit: "day", duration: "", location: "", start_date: "", description: "", requirements: "" };
const APP_STATUS: Record<string, { label: string; color: string }> = { new: { label: "جديد", color: "#2563EB" }, contacted: { label: "تم التواصل", color: "#B7791F" }, accepted: { label: "مقبول", color: "#0E8A5F" }, rejected: { label: "مرفوض", color: "#B42318" } };
function Jobs({ meta }: { meta: Meta }) {
  const { token } = useAuth();
  const [list, setList] = useState<Job[] | null>(null);
  const [form, setForm] = useState<typeof emptyJob | null>(null);
  const [apps, setApps] = useState<{ job: Job; list: Application[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (token) try { setList((await conApi.jobs(token)).jobs); } catch (e: any) { notify("خطأ", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!token || !form) return; setBusy(true);
    try { await conApi.createJob(token, { ...form, workers_needed: Number(form.workers_needed) || 1, wage: Number(form.wage) || null, start_date: form.start_date || null }); setForm(null); load(); notify("نُشر الإعلان", "سيظهر في قسم فرص العمل"); }
    catch (e: any) { notify("تعذّر النشر", e?.message); } finally { setBusy(false); }
  };
  const toggle = async (j: Job) => { if (!token) return; try { await conApi.setJobStatus(token, j.id, j.status === "open" ? "closed" : "open"); load(); } catch (e: any) { notify("خطأ", e?.message); } };
  const openApps = async (j: Job) => { if (!token) return; setApps({ job: j, list: null }); try { setApps({ job: j, list: (await conApi.applications(token, j.id)).applications }); } catch (e: any) { notify("خطأ", e?.message); } };
  const setApp = async (a: Application, s: "accepted" | "rejected" | "contacted") => {
    if (!token || !apps) return;
    try { await conApi.setApplication(token, a.id, s); setApps({ ...apps, list: (apps.list || []).map((x) => (x.id === a.id ? { ...x, status: s } : x)) }); load(); } catch (e: any) { notify("خطأ", e?.message); }
  };
  const setJ = (patch: Partial<typeof emptyJob>) => setForm((o) => (o ? { ...o, ...patch } : o));
  return (
    <View>
      <SectionHead title="التوظيف وطلب العمال" action="إعلان جديد" onAction={() => setForm({ ...emptyJob })} />
      {!list ? <ActivityIndicator color={CON} /> : !list.length ? <Empty icon="account-hard-hat-outline" text="انشر إعلاناً لطلب عمال أو حرفيين أو مهندسين" /> : list.map((j) => (
        <View key={j.id} style={[u.card, { marginBottom: 10, opacity: j.status === "closed" ? 0.7 : 1 }]}>
          <View style={[u.rowR, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={u.h} numberOfLines={1}>{j.title}</Text>
              <Text style={u.hint}>{[j.kind_label, j.trade, `${j.workers_needed} مطلوب`, j.wage ? `${money(j.wage)} ${j.wage_unit_label}` : null, j.location].filter(Boolean).join(" · ")}</Text>
            </View>
            <Badge label={j.status === "open" ? "مفتوح" : "مغلق"} color={j.status === "open" ? "#0E8A5F" : "#6B7280"} />
          </View>
          <View style={[u.rowR, { gap: 8, marginTop: 10 }]}>
            <Pressable style={[u.ghost, { borderColor: CON }]} onPress={() => openApps(j)}>
              <Ionicons name="people-outline" size={16} color={CON} /><Text style={[u.ghostT, { color: CON }]}>المتقدمون ({j.applicants || 0}){j.new_applicants ? ` · ${j.new_applicants} جديد` : ""}</Text>
            </Pressable>
            <Pressable style={u.ghost} onPress={() => toggle(j)}><Text style={u.ghostT}>{j.status === "open" ? "إغلاق" : "إعادة فتح"}</Text></Pressable>
          </View>
        </View>
      ))}
      <Sheet visible={!!form} title="إعلان توظيف / طلب عمال" onClose={() => setForm(null)}>
        {form && <>
          <Text style={u.label}>نوع الإعلان</Text>
          <View style={u.wrap}>{Object.entries(meta.job_kinds).map(([k, v]) => <Pill key={k} label={v} on={form.kind === k} onPress={() => setJ({ kind: k })} />)}</View>
          <Field label="العنوان" value={form.title} onChange={(v) => setJ({ title: v })} placeholder="مثال: مطلوب 6 عمال بناء لمشروع سكني" />
          <View style={[u.rowR, { gap: 10 }]}>
            <View style={{ flex: 1 }}><Field label="الحرفة" value={form.trade} onChange={(v) => setJ({ trade: v })} placeholder="بنّاء، كهربائي…" /></View>
            <View style={{ width: 100 }}><Field label="العدد" value={form.workers_needed} onChange={(v) => setJ({ workers_needed: v })} keyboard="numeric" /></View>
          </View>
          <Field label="الأجر (ج.س)" value={form.wage} onChange={(v) => setJ({ wage: v })} keyboard="numeric" />
          <View style={[u.wrap, { marginTop: 8 }]}>{Object.entries(meta.wage_units).map(([k, v]) => <Pill key={k} label={v} on={form.wage_unit === k} onPress={() => setJ({ wage_unit: k })} />)}</View>
          <View style={[u.rowR, { gap: 10 }]}>
            <View style={{ flex: 1 }}><Field label="المدة" value={form.duration} onChange={(v) => setJ({ duration: v })} placeholder="3 أسابيع" /></View>
            <View style={{ flex: 1 }}><Field label="تاريخ البدء" value={form.start_date} onChange={(v) => setJ({ start_date: v })} placeholder="YYYY-MM-DD" /></View>
          </View>
          <Field label="الموقع" value={form.location} onChange={(v) => setJ({ location: v })} />
          <Field label="تفاصيل العمل" value={form.description} onChange={(v) => setJ({ description: v })} multiline />
          <Field label="المتطلبات والخبرة" value={form.requirements} onChange={(v) => setJ({ requirements: v })} multiline />
          <Pressable style={[u.primary, { marginTop: 18 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={create}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="megaphone-outline" size={18} color="#fff" /><Text style={u.primaryT}>نشر الإعلان</Text></>}
          </Pressable>
        </>}
      </Sheet>
      <Sheet visible={!!apps} title={apps ? `المتقدمون — ${apps.job.title}` : ""} onClose={() => setApps(null)}>
        {!apps?.list ? <ActivityIndicator color={CON} /> : !apps.list.length ? <Empty icon="account-search-outline" text="لا يوجد متقدمون بعد" /> : apps.list.map((a) => (
          <View key={a.id} style={[u.card, { marginBottom: 10 }]}>
            <View style={[u.rowR, { gap: 10 }]}>
              <UserAvatar avatarUrl={a.avatar_url} name={a.name} size={40} />
              <View style={{ flex: 1 }}><Text style={u.h}>{a.name}</Text><Text style={u.hint}>{a.phone} · {fmtD(a.created_at)}</Text></View>
              <Badge label={APP_STATUS[a.status]?.label || a.status} color={APP_STATUS[a.status]?.color || CON} />
            </View>
            {!!a.experience && <Text style={[u.hint, { marginTop: 6 }]}>الخبرة: {a.experience}</Text>}
            {!!a.note && <Text style={[u.hint, { marginTop: 2 }]}>{a.note}</Text>}
            <View style={[u.wrap, { marginTop: 10 }]}>
              <Pressable accessibilityRole="button" hitSlop={8} style={st.iconBtn} onPress={() => { tel(a.phone); if (a.status === "new") setApp(a, "contacted"); }} accessibilityLabel="اتصال"><Ionicons name="call" size={18} color={CON} /></Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} style={st.iconBtn} onPress={() => { wa(a.phone, `بخصوص تقديمك على: ${apps.job.title}`); if (a.status === "new") setApp(a, "contacted"); }} accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={18} color="#16A34A" /></Pressable>
              {a.status !== "accepted" && <Pressable style={[u.ghost, { borderColor: "#0E8A5F" }]} onPress={() => setApp(a, "accepted")}><Text style={[u.ghostT, { color: "#0E8A5F" }]}>قبول</Text></Pressable>}
              {a.status !== "rejected" && <Pressable style={[u.ghost, { borderColor: "#FCA5A5" }]} onPress={() => setApp(a, "rejected")}><Text style={[u.ghostT, { color: "#B42318" }]}>رفض</Text></Pressable>}
            </View>
          </View>
        ))}
      </Sheet>
    </View>
  );
}

// ───────── الطاقم ─────────
function Staff({ isOwner }: { isOwner: boolean }) {
  const { token } = useAuth();
  const [d, setD] = useState<{ staff: StaffMember[]; roles: Record<string, string>; role_perms: Record<string, Perm[]> } | null>(null);
  const [add, setAdd] = useState(false);
  const [q, setQ] = useState(""); const [found, setFound] = useState<{ id: number; name: string; avatar_url: string | null }[]>([]);
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [role, setRole] = useState("engineer"); const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (token) try { setD(await conApi.staff(token)); } catch (e: any) { notify("خطأ", e?.message); } }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!token || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => { try { setFound((await conApi.lookup(token, q.trim())).users); } catch { setFound([]); } }, 350);
    return () => clearTimeout(t);
  }, [q, token]);
  const save = async (uid: number, r: string, t?: string) => {
    if (!token) return; setBusy(true);
    try { await conApi.setStaff(token, uid, r, t); setAdd(false); setPick(null); setQ(""); setTitle(""); load(); } catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const remove = async (m: StaffMember) => {
    if (!token || !(await confirmAction("إزالة من الطاقم", `إزالة ${m.name} من طاقم الشركة؟`, "إزالة", true))) return;
    try { await conApi.removeStaff(token, m.user_id); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const assignable = d ? Object.keys(d.roles).filter((r) => r !== "owner") : [];
  return (
    <View>
      <SectionHead title="طاقم الشركة" action="إضافة عضو" onAction={() => setAdd(true)} />
      {d && (
        <View style={[u.card, { marginBottom: 12, backgroundColor: "#F9FAFB" }]}>
          <Text style={u.h}>الأدوار والصلاحيات</Text>
          {Object.entries(d.roles).map(([r, label]) => (
            <View key={r} style={{ marginTop: 8 }}>
              <Text style={[u.hint, { color: Colors.textPrimary, fontFamily: "Cairo_700Bold" }]}>{label}</Text>
              <Text style={u.hint}>{(d.role_perms[r] || []).map((p) => PERM_LABEL[p]).join("، ")}</Text>
            </View>
          ))}
        </View>
      )}
      {!d ? <ActivityIndicator color={CON} /> : d.staff.map((m) => (
        <View key={m.user_id} style={[u.card, { marginBottom: 10 }]}>
          <View style={[u.rowR, { gap: 10 }]}>
            <UserAvatar avatarUrl={m.avatar_url} name={m.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={u.h}>{m.name}</Text>
              <Text style={u.hint}>{m.role_label}{m.title ? ` · ${m.title}` : ""}</Text>
            </View>
            {m.role === "owner" ? <Badge label="المالك" color={CON} /> : (
              <Pressable accessibilityRole="button" onPress={() => remove(m)} hitSlop={8} accessibilityLabel="إزالة"><Ionicons name="person-remove-outline" size={20} color="#B42318" /></Pressable>
            )}
          </View>
          {m.role !== "owner" && (
            <View style={[u.wrap, { marginTop: 10 }]}>
              {assignable.map((r) => <Pill key={r} label={d.roles[r]} on={m.role === r} onPress={() => m.role !== r && save(m.user_id, r, m.title || undefined)} />)}
            </View>
          )}
        </View>
      ))}
      {!isOwner && <Text style={u.hint}>يستطيع المالك فقط نقل الملكية — تواصل مع الإدارة عند الحاجة.</Text>}
      <Sheet visible={add} title="إضافة عضو للطاقم" onClose={() => { setAdd(false); setPick(null); }}>
        {!pick ? <>
          <Field label="ابحث بالاسم أو رقم الهاتف" value={q} onChange={setQ} />
          <Text style={[u.hint, { marginTop: 6 }]}>يجب أن يملك العضو حساباً في التطبيق.</Text>
          {found.map((x) => (
            <Pressable key={x.id} onPress={() => setPick(x)} style={[u.card, u.rowR, { gap: 10, marginTop: 8 }]}>
              <UserAvatar avatarUrl={x.avatar_url} name={x.name} size={36} />
              <Text style={[u.h, { flex: 1 }]}>{x.name}</Text>
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
        </> : <>
          <View style={[u.card, u.rowR, { gap: 10 }]}>
            <Ionicons name="person-circle-outline" size={30} color={CON} />
            <Text style={[u.h, { flex: 1 }]}>{pick.name}</Text>
            <Pressable onPress={() => setPick(null)}><Text style={[u.hint, { color: CON }]}>تغيير</Text></Pressable>
          </View>
          <Text style={u.label}>الدور</Text>
          <View style={u.wrap}>{assignable.map((r) => <Pill key={r} label={d?.roles[r] || r} on={role === r} onPress={() => setRole(r)} />)}</View>
          <Text style={[u.hint, { marginTop: 6 }]}>الصلاحيات: {(d?.role_perms[role] || []).map((p) => PERM_LABEL[p]).join("، ")}</Text>
          <Field label="المسمى الوظيفي (اختياري)" value={title} onChange={setTitle} placeholder="مهندس موقع، مسؤول مبيعات…" />
          <Pressable style={[u.primary, { marginTop: 18 }, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => save(pick.id, role, title)}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={u.primaryT}>إضافة للطاقم</Text>}
          </Pressable>
        </>}
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: Colors.bg },
  head: { backgroundColor: CON_DEEP, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 4, borderBottomColor: CON },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff", overflow: "hidden", alignItems: "center", justifyContent: "center", marginRight: 12 },
  hTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  hSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#D1D5DB", textAlign: "right" },
  hBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)" },
  hBtnT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)" },
  tabOn: { backgroundColor: "#FBBF24" },
  tabT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "#fff" },
  banner: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12 },
  kpi: { width: "48%", flexGrow: 1, alignItems: "flex-end", gap: 4 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiV: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  smallBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: CON, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  smallBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  sheetHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pipe: { height: 5, alignSelf: "stretch", borderRadius: 3 },
  pipeT: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  qImg: { width: 96, height: 96, borderRadius: 10, backgroundColor: Colors.divider },
  iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  contractText: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 23, color: Colors.textPrimary, textAlign: "right" },
});
