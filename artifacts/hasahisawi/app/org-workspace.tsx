// 🏛️ مساحة المنظمة: نظرة عامة، الفريق، المهام، التطوع، الأرشيف، والهوية — حسب دور المستخدم
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Image, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { uploadFile } from "@/lib/firebase/storage";
import { notify, confirmAction } from "@/lib/xplatform";
import { TasksTab } from "@/components/union/TasksTab";
import EntityVolunteerPanel from "@/components/volunteer/EntityVolunteerPanel";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";
type Tab = "overview" | "team" | "tasks" | "volunteer" | "archive" | "profile";

async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `خطأ (${r.status})`);
  return j as T;
}

export default function OrgWorkspace() {
  const insets = useSafeAreaInsets();
  const { id, tab: tabParam } = useLocalSearchParams<{ id?: string; tab?: string }>();
  const { token } = useAuth();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || "overview");

  const load = useCallback(async () => {
    if (!token || !id) return;
    try { setErr(""); setD(await api(token, `/org-workspace/${id}`)); } catch (e: any) { setErr(e.message); }
  }, [token, id]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <Center><Text style={st.muted}>سجّل الدخول للوصول إلى مساحة منظمتك</Text></Center>;
  if (err && !d) return <Center><Ionicons name="lock-closed-outline" size={34} color={Colors.textMuted} /><Text style={st.muted}>{err}</Text><Pressable onPress={() => router.back()} style={st.ghost}><Text style={st.ghostT}>رجوع</Text></Pressable></Center>;
  if (!d) return <Center><ActivityIndicator color={GREEN} /></Center>;

  const o = d.organization; const lead = d.me.lead;
  const TABS: { k: Tab; l: string; ic: any; show: boolean }[] = [
    { k: "overview", l: "نظرة عامة", ic: "grid-outline", show: true },
    { k: "tasks", l: lead ? "المهام" : "مهامي", ic: "checkbox-outline", show: true },
    { k: "volunteer", l: "التطوع", ic: "hand-left-outline", show: lead },
    { k: "team", l: "الفريق", ic: "people-outline", show: true },
    { k: "archive", l: "الأرشيف", ic: "archive-outline", show: true },
    { k: "profile", l: "الهوية", ic: "create-outline", show: lead },
  ];
  const shown = TABS.filter((t) => t.show);
  const active = shown.some((t) => t.k === tab) ? tab : "overview";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
        {o.cover_url ? <Image source={{ uri: o.cover_url }} style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} /> : null}
        <View style={st.headRow}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.round} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
          <View style={st.logo}>{o.logo_url ? <Image source={{ uri: o.logo_url }} style={st.logoImg} /> : <Ionicons name="business" size={24} color={GREEN} />}</View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <Text style={st.title} numberOfLines={1}>{o.name}</Text>
              {o.is_verified ? <Ionicons name="checkmark-circle" size={17} color={GOLD} /> : null}
            </View>
            <View style={st.rolePill}><Text style={st.roleT}>{d.me.role_label}</Text></View>
          </View>
          <Pressable onPress={() => router.push({ pathname: "/organization", params: { id: String(o.id) } } as any)} style={st.round} accessibilityLabel="الصفحة العامة"><Ionicons name="eye-outline" size={20} color="#fff" /></Pressable>
        </View>
      </LinearGradient>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabsBar} contentContainerStyle={st.tabs}>
        {shown.map((t) => (
          <Pressable key={t.k} onPress={() => setTab(t.k)} style={[st.tab, active === t.k && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: active === t.k }}>
            <Ionicons name={t.ic} size={15} color={active === t.k ? "#fff" : Colors.textSecondary} />
            <Text style={[st.tabT, active === t.k && { color: "#fff" }]}>{t.l}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {active === "overview" ? <Overview d={d} onGo={setTab} onRefresh={load} /> : null}
        {active === "tasks" ? <TasksTab token={token} base={`/org-workspace/${o.id}`} /> : null}
        {active === "volunteer" ? <EntityVolunteerPanel token={token} base={`/org-workspace/${o.id}/volunteer`} color={GREEN} title="مهام التطوع للمنظمة" /> : null}
        {active === "team" ? <Team token={token} d={d} onChanged={load} /> : null}
        {active === "archive" ? <Archive token={token} orgId={o.id} /> : null}
        {active === "profile" ? <Profile token={token} org={o} onSaved={load} /> : null}
      </View>
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.bg, padding: 24 }}>{children}</View>;
}

function Overview({ d, onGo, onRefresh }: { d: any; onGo: (t: Tab) => void; onRefresh: () => void }) {
  const s = d.stats || {}; const lead = d.me.lead;
  const tiles = [
    { ic: "people", l: "عضو فريق", v: d.team.length, c: GREEN, go: "team" },
    { ic: "checkbox", l: "مهمة مفتوحة", v: s.open_tasks ?? 0, c: "#1F5C8A", go: "tasks" },
    { ic: "alarm", l: "متأخرة", v: s.overdue_tasks ?? 0, c: (s.overdue_tasks ?? 0) ? "#C62828" : "#6B7B74", go: "tasks" },
    { ic: "hand-left", l: "مهمة تطوع مفتوحة", v: s.open_volunteer ?? 0, c: GOLD, go: "volunteer" },
    { ic: "heart", l: "متطوع أنجز معكم", v: s.volunteers ?? 0, c: "#B7791F", go: "volunteer" },
    { ic: "calendar", l: "فعالية قادمة", v: s.upcoming_events ?? 0, c: "#0F766E", go: null },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={GREEN} />}>
      {!lead && d.my_tasks ? (
        <Pressable onPress={() => onGo("tasks")} style={st.myCard}>
          <Ionicons name="briefcase" size={22} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={st.h}>لوحتك في الفريق</Text>
            <Text style={st.muted}>{d.my_tasks.open} مهمة مفتوحة · {d.my_tasks.done} منجزة{d.my_tasks.overdue ? ` · ${d.my_tasks.overdue} متأخرة` : ""}</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
        </Pressable>
      ) : null}
      <View style={st.tiles}>
        {tiles.filter((t) => lead || t.go !== "volunteer").map((t) => (
          <Pressable key={t.l} onPress={() => t.go && onGo(t.go as Tab)} style={st.tile}>
            <View style={[st.tileIcon, { backgroundColor: t.c + "18" }]}><Ionicons name={t.ic as any} size={18} color={t.c} /></View>
            <Text style={[st.tileV, { color: t.c }]}>{t.v}</Text>
            <Text style={st.tileL}>{t.l}</Text>
          </Pressable>
        ))}
      </View>
      {lead && d.budget ? (
        <View style={st.box}>
          <Text style={st.h}>رصيد نقاط التطوع هذا الشهر</Text>
          <View style={st.bar}><View style={[st.barFill, { width: `${d.budget.cap ? Math.min(100, (d.budget.used / d.budget.cap) * 100) : 0}%` }]} /></View>
          <Text style={st.muted}>مُنح {d.budget.used} من {d.budget.cap} — المتبقي {d.budget.left} نقطة. السقف تحدده إدارة التطبيق.</Text>
        </View>
      ) : null}
      <View style={st.box}>
        <Text style={st.h}>عن المنظمة</Text>
        <Text style={st.body}>{d.organization.full_description || d.organization.description || "لم تُكتب نبذة بعد."}</Text>
        {d.organization.vision ? <Text style={st.body}>🎯 الرؤية: {d.organization.vision}</Text> : null}
        {lead ? <Pressable onPress={() => onGo("profile")} style={st.link}><Ionicons name="create-outline" size={15} color={GREEN} /><Text style={st.linkT}>تحديث الهوية والتفاصيل</Text></Pressable> : null}
      </View>
      {lead ? (
        <View style={st.box}>
          <Text style={st.h}>إجراءات سريعة</Text>
          {[
            ["calendar-outline", "نشر فعالية أو حملة تبرع", () => router.push({ pathname: "/organization", params: { id: String(d.organization.id) } } as any)],
            ["person-add-outline", "إضافة عضو للفريق", () => onGo("team")],
            ["hand-left-outline", "إدراج مهمة تطوعية بنقاط", () => onGo("volunteer")],
            ["checkbox-outline", "إسناد مهمة لعضو", () => onGo("tasks")],
          ].map(([ic, l, fn]: any) => (
            <Pressable key={l} onPress={fn} style={st.quick}><Ionicons name={ic} size={18} color={DEEP} /><Text style={st.quickT}>{l}</Text><Ionicons name="chevron-back" size={16} color={Colors.textMuted} /></Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Team({ token, d, onChanged }: { token: string; d: any; onChanged: () => void }) {
  const lead = d.me.lead; const canManagers = d.me.role === "owner" || d.me.role === "app";
  const [user, setUser] = useState(""); const [title, setTitle] = useState(""); const [role, setRole] = useState<"staff" | "manager">("staff");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (user.trim().length < 3) return notify("اكتب رقم الهاتف أو البريد");
    setBusy(true);
    try { const r = await api(token, `/org-workspace/${d.organization.id}/team`, { method: "POST", body: JSON.stringify({ user: user.trim(), role, title: title.trim() }) }); notify("أُضيف للفريق ✅", `${r.member.name} — ${r.member.role_label}`); setUser(""); setTitle(""); onChanged(); }
    catch (e: any) { notify("تعذّر", e.message); } finally { setBusy(false); }
  };
  const remove = async (m: any) => {
    if (!(await confirmAction("إزالة من الفريق", `إزالة ${m.name}؟ تبقى مهامه السابقة في السجل.`, "إزالة", true))) return;
    try { await api(token, `/org-workspace/${d.organization.id}/team/${m.user_id}`, { method: "DELETE" }); onChanged(); } catch (e: any) { notify("تعذّر", e.message); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {lead ? (
        <View style={st.box}>
          <Text style={st.h}>إضافة عضو</Text>
          <TextInput value={user} onChangeText={setUser} placeholder="رقم الهاتف أو البريد (مسجّل في التطبيق)" placeholderTextColor={Colors.textMuted} style={st.input} />
          <TextInput value={title} onChangeText={setTitle} placeholder="المسمى (مثال: منسق المتطوعين)" placeholderTextColor={Colors.textMuted} style={st.input} />
          {canManagers ? (
            <View style={st.seg}>
              {([["staff", "عضو فريق"], ["manager", "مدير"]] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setRole(k)} style={[st.segBtn, role === k && { backgroundColor: DEEP }]}><Text style={[st.segT, role === k && { color: "#fff" }]}>{l}</Text></Pressable>
              ))}
            </View>
          ) : null}
          <Text style={st.muted}>المدير: ينشر ويدير الفريق والمهام والتطوع. عضو الفريق: يرى مهامه ويحدّثها فقط.</Text>
          <Pressable onPress={add} disabled={busy} style={[st.primary, busy && { opacity: 0.6 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryT}>إضافة وإشعار</Text>}</Pressable>
        </View>
      ) : null}
      {d.team.map((m: any) => (
        <View key={m.user_id} style={st.member}>
          {m.avatar_url ? <Image source={{ uri: m.avatar_url }} style={st.av} /> : <View style={[st.av, { alignItems: "center", justifyContent: "center", backgroundColor: GREEN + "18" }]}><Ionicons name="person" size={18} color={GREEN} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={st.mName}>{m.name}</Text>
            <Text style={st.muted}>{m.title || m.role_label}{m.open_tasks ? ` · ${m.open_tasks} مهمة مفتوحة` : ""}</Text>
          </View>
          <View style={[st.pill, { backgroundColor: m.role === "owner" ? GOLD + "30" : m.role === "manager" ? GREEN + "1F" : Colors.bg }]}><Text style={[st.pillT, { color: m.role === "owner" ? "#7A5900" : DEEP }]}>{m.role_label}</Text></View>
          {lead && m.role !== "owner" && (m.role === "staff" || canManagers) ? <Pressable onPress={() => remove(m)} hitSlop={8} accessibilityLabel={`إزالة ${m.name}`}><Ionicons name="close-circle-outline" size={20} color={Colors.textMuted} /></Pressable> : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Archive({ token, orgId }: { token: string; orgId: number }) {
  const [a, setA] = useState<any>(null);
  useEffect(() => { api(token, `/org-workspace/${orgId}/archive`).then(setA).catch((e) => notify("تعذّر", e.message)); }, [token, orgId]);
  if (!a) return <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} />;
  const Sec = ({ t, ic, items, render }: { t: string; ic: any; items: any[]; render: (x: any) => React.ReactNode }) => (
    <View style={st.box}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}><Ionicons name={ic} size={17} color={GREEN} /><Text style={st.h}>{t} ({items.length})</Text></View>
      {items.length ? items.map(render) : <Text style={st.muted}>لا شيء بعد</Text>}
    </View>
  );
  const fmt = (x?: string) => (x ? new Date(x).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <Sec t="الفعاليات المنتهية" ic="calendar" items={a.events} render={(e) => <Row key={`e${e.id}`} t={e.title} s={`${fmt(e.starts_at)}${e.location ? ` · ${e.location}` : ""}`} />} />
      <Sec t="حملات التبرع المنتهية" ic="heart" items={a.campaigns} render={(c) => <Row key={`c${c.id}`} t={c.title} s={`جُمع ${Number(c.raised_amount).toLocaleString("ar-EG")}${c.goal_amount ? ` من ${Number(c.goal_amount).toLocaleString("ar-EG")}` : ""} ${c.currency}`} />} />
      <Sec t="مهام التطوع المؤرشفة" ic="hand-left" items={a.volunteer} render={(v) => <Row key={`v${v.id}`} t={v.title} s={`${v.completed_count} متطوع أنجزها · ${v.awarded} نقطة ممنوحة`} />} />
      <Sec t="مهام الفريق المنجزة" ic="checkbox" items={a.tasks} render={(t) => <Row key={`t${t.id}`} t={t.title} s={`${t.assignee_name || ""} · ${fmt(t.completed_at)}`} />} />
    </ScrollView>
  );
}
function Row({ t, s }: { t: string; s: string }) {
  return <View style={st.arow}><View style={st.dot} /><View style={{ flex: 1 }}><Text style={st.mName} numberOfLines={1}>{t}</Text><Text style={st.muted} numberOfLines={1}>{s}</Text></View></View>;
}

function Profile({ token, org, onSaved }: { token: string; org: any; onSaved: () => void }) {
  const [f, setF] = useState({
    description: org.description || "", full_description: org.full_description || "", vision: org.vision || "",
    contact_phone: org.contact_phone || "", email: org.email || "", address: org.address || "", working_hours: org.working_hours || "",
    founded_year: org.founded_year || "", members_count: String(org.members_count ?? ""), website: org.website || "",
    goals: (org.goals || []).join("\n"), needs: (org.needs || []).join("\n"),
    facebook: org.socials?.facebook || "", whatsapp: org.socials?.whatsapp || "", instagram: org.socials?.instagram || "",
    logo_url: org.logo_url || "", cover_url: org.cover_url || "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const pick = async (k: "logo_url" | "cover_url") => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: Platform.OS !== "web", aspect: k === "logo_url" ? [1, 1] : [16, 9] });
      if (r.canceled) return;
      setBusy("جارٍ رفع الصورة…");
      const u = await uploadFile(`organizations/${org.id}/${k}_${Date.now()}.jpg`, r.assets[0].uri);
      setF((x) => ({ ...x, [k]: u }));
    } catch (e: any) { notify("تعذّر الرفع", e?.message); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy("جارٍ الحفظ…");
    try {
      await api(token, `/org-workspace/${org.id}/profile`, { method: "PATCH", body: JSON.stringify({
        ...f, members_count: f.members_count ? Number(f.members_count) : undefined,
        goals: f.goals.split("\n").map((x: string) => x.trim()).filter(Boolean), needs: f.needs.split("\n").map((x: string) => x.trim()).filter(Boolean),
        socials: { facebook: f.facebook, whatsapp: f.whatsapp, instagram: f.instagram },
      }) });
      notify("حُفظت التفاصيل ✅"); onSaved();
    } catch (e: any) { notify("تعذّر", e.message); } finally { setBusy(null); }
  };
  const F = ({ k, ph, multi, kb }: { k: keyof typeof f; ph: string; multi?: boolean; kb?: any }) => (
    <TextInput value={f[k]} onChangeText={set(k)} placeholder={ph} placeholderTextColor={Colors.textMuted} keyboardType={kb} multiline={multi} style={[st.input, multi && { minHeight: 80, textAlignVertical: "top" }]} />
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={st.imgRow}>
        <Pressable onPress={() => pick("logo_url")} style={st.logoPick}>{f.logo_url ? <Image source={{ uri: f.logo_url }} style={st.logoPickImg} /> : <Ionicons name="image-outline" size={26} color={GREEN} />}<Text style={st.pickT}>الشعار</Text></Pressable>
        <Pressable onPress={() => pick("cover_url")} style={st.coverPick}>{f.cover_url ? <Image source={{ uri: f.cover_url }} style={StyleSheet.absoluteFill} /> : null}<Ionicons name="images-outline" size={24} color={f.cover_url ? "#fff" : GREEN} /><Text style={[st.pickT, f.cover_url && { color: "#fff" }]}>صورة الغلاف</Text></Pressable>
      </View>
      <Text style={st.lbl}>النبذة والرؤية</Text>
      {F({ k: "description", ph: "نبذة قصيرة تظهر في القوائم" })}
      {F({ k: "full_description", ph: "التعريف الكامل بالمنظمة وأنشطتها", multi: true })}
      {F({ k: "vision", ph: "الرؤية والرسالة", multi: true })}
      {F({ k: "goals", ph: "الأهداف — هدف في كل سطر", multi: true })}
      {F({ k: "needs", ph: "الاحتياجات — احتياج في كل سطر (متطوعون، معدات…)", multi: true })}
      <Text style={st.lbl}>التواصل والمقر</Text>
      {F({ k: "contact_phone", ph: "رقم التواصل", kb: "phone-pad" })}
      {F({ k: "email", ph: "البريد الإلكتروني", kb: "email-address" })}
      {F({ k: "address", ph: "العنوان / المقر" })}
      {F({ k: "working_hours", ph: "ساعات العمل" })}
      {F({ k: "website", ph: "الموقع الإلكتروني (https://…)" })}
      {F({ k: "facebook", ph: "صفحة فيسبوك" })}
      {F({ k: "whatsapp", ph: "رقم/رابط واتساب" })}
      {F({ k: "instagram", ph: "إنستغرام" })}
      <Text style={st.lbl}>بيانات عامة</Text>
      {F({ k: "founded_year", ph: "سنة التأسيس" })}
      {F({ k: "members_count", ph: "عدد الأعضاء", kb: "number-pad" })}
      <Text style={st.muted}>اسم المنظمة ونوعها وتوثيقها تديرها إدارة التطبيق.</Text>
      <Pressable onPress={save} disabled={!!busy} style={[st.primary, !!busy && { opacity: 0.6 }]}>{busy ? <><ActivityIndicator color="#fff" /><Text style={st.primaryT}>{busy}</Text></> : <Text style={st.primaryT}>حفظ التفاصيل</Text>}</Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" },
  headRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 52, height: 52 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "right", flexShrink: 1 },
  rolePill: { alignSelf: "flex-end", marginTop: 2, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: GOLD },
  roleT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#3D2C00" },
  tabsBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.cardBg },
  tabs: { flexDirection: "row-reverse", gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.bg },
  tabOn: { backgroundColor: DEEP },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  body: { fontFamily: "Cairo_500Medium", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 23 },
  box: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  myCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: GREEN + "10", borderWidth: 1, borderColor: GREEN + "40" },
  tiles: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tile: { width: "31.5%", backgroundColor: Colors.cardBg, borderRadius: 18, padding: 10, alignItems: "center", gap: 2, borderWidth: 1, borderColor: Colors.divider },
  tileIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileV: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  tileL: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  bar: { height: 8, borderRadius: 4, backgroundColor: GOLD + "30", overflow: "hidden", transform: [{ scaleX: -1 }] },
  barFill: { height: 8, borderRadius: 4, backgroundColor: GOLD },
  link: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  linkT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: GREEN },
  quick: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  quickT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 11 },
  seg: { flexDirection: "row-reverse", gap: 6, padding: 4, borderRadius: 14, backgroundColor: Colors.bg },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  primary: { flexDirection: "row-reverse", gap: 8, backgroundColor: DEEP, borderRadius: 16, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  ghost: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: DEEP },
  member: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  av: { width: 42, height: 42, borderRadius: 21 },
  mName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  arow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginTop: 6 },
  imgRow: { flexDirection: "row-reverse", gap: 10 },
  logoPick: { width: 96, height: 96, borderRadius: 22, backgroundColor: Colors.cardBg, borderWidth: 1.5, borderStyle: "dashed", borderColor: GREEN + "60", alignItems: "center", justifyContent: "center", overflow: "hidden", gap: 2 },
  logoPickImg: { ...StyleSheet.absoluteFillObject },
  coverPick: { flex: 1, height: 96, borderRadius: 22, backgroundColor: Colors.cardBg, borderWidth: 1.5, borderStyle: "dashed", borderColor: GREEN + "60", alignItems: "center", justifyContent: "center", overflow: "hidden", gap: 2 },
  pickT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: DEEP },
});
