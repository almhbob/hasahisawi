// لوحة إدارة فرعية الهلال الأحمر: الطلبات، الأعضاء، الاجتماعات، الإعلانات، توثيق الأنشطة
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import UserAvatar from "@/components/UserAvatar";
import { srcsStyles } from "@/components/srcs/styles";
import { notify, confirmAction } from "@/lib/xplatform";
import { uploadFile } from "@/lib/firebase/storage";
import ZoomViewer from "@/components/srcs/ZoomViewer";
import DateTimeField, { fmtDateTime } from "@/components/srcs/DateTimeField";
import AdminCourses, { PlaceChips } from "@/components/srcs/AdminCourses";
import { MembersList, CohortsPanel, SettingsPanel } from "@/components/srcs/AdminMembers";
import { CheckinScanner, ExportButtons, AuditPanel } from "@/components/srcs/AdminOps";
import { UnitFilterRow, UnitPicker, UnitsPanel, writeOptions, defaultUnit, unitLabel, type UnitOption } from "@/components/srcs/AdminUnits";
import {
  srcsApi, ROLE_LABEL, ACTIVITY_TYPES, AUDIENCE_LABEL, SRCS_RED, PERM_LABEL,
  type SrcsMember, type SrcsMeeting, type SrcsActivity, type SrcsRole, type SrcsAnnouncement, type SrcsPerm, type SrcsCohort, type SrcsScope, type UnitFilter,
} from "@/lib/red-crescent";

type Tab = "dash" | "units" | "requests" | "members" | "cohorts" | "courses" | "meetings" | "announcements" | "activities" | "audit" | "settings";
// كل تبويب يظهر لمن يملك إحدى صلاحياته؛ «الوحدات» لمستوى إدارة الفرع؛ «الإعدادات» لمدير حصاحيصاوي فقط
const TABS: [Tab, string, keyof typeof Ionicons.glyphMap, SrcsPerm[] | "app" | "branch" | null][] = [
  ["dash", "اللوحة", "grid", null], ["units", "الوحدات", "git-network", "branch"], ["requests", "الطلبات", "person-add", ["requests"]], ["members", "الأعضاء", "people", ["members"]],
  ["cohorts", "الدفعات والسجل", "albums", ["cohorts"]], ["courses", "الدورات والنتائج", "school", ["courses", "results", "certificates"]],
  ["meetings", "الاجتماعات", "calendar", ["meetings"]], ["announcements", "الإعلانات", "megaphone", ["announcements"]],
  ["activities", "الأنشطة", "images", ["activities"]], ["audit", "سجل التدقيق", "shield-checkmark", ["members"]], ["settings", "الإعدادات", "settings", "app"],
];
const fmt = (s: string, time = false) => new Date(s).toLocaleString("ar-EG", time ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });

export default function SrcsAdminScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("dash");
  const [denied, setDenied] = useState(false);
  const [dash, setDash] = useState<Record<string, number> | null>(null);
  const [members, setMembers] = useState<SrcsMember[]>([]);
  const [meetings, setMeetings] = useState<SrcsMeeting[]>([]);
  const [overview, setOverview] = useState<{ announcements: SrcsAnnouncement[]; activities: SrcsActivity[] }>({ announcements: [], activities: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<null | "meeting" | "announcement" | "activity">(null);
  const [attendFor, setAttendFor] = useState<SrcsMeeting | null>(null);
  const [partFor, setPartFor] = useState<SrcsActivity | null>(null);
  const [docView, setDocView] = useState<{ title: string; url: string } | null>(null);
  const [perms, setPerms] = useState<SrcsPerm[]>([]);
  const [appAdmin, setAppAdmin] = useState(false);
  const [cohorts, setCohorts] = useState<SrcsCohort[]>([]);
  const [scanFor, setScanFor] = useState<{ title: string; meeting_id?: number } | null>(null);
  // نطاق الإدارة (فرع أو وحدات) ومرشّح الوحدة الحالي — الخادم يرشّح كل القوائم بحسب النطاق في كل الأحوال
  const [scope, setScope] = useState<SrcsScope | null>(null);
  const [unitF, setUnitF] = useState<UnitFilter>(undefined);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const sc = await srcsApi.admin.myScope(token);
      setScope(sc);
      const d = await srcsApi.admin.dashboard(token, unitF);
      const p = d.perms || [];
      setDash(d); setPerms(p); setAppAdmin(!!d.isAppAdmin);
      const has = (...k: SrcsPerm[]) => k.some((x) => p.includes(x));
      const [mm, mt, an, ac, co] = await Promise.all([
        has("requests", "members", "cohorts", "courses", "results", "activities", "meetings", "certificates") ? srcsApi.admin.members(token, undefined, unitF) : Promise.resolve({ members: [] as SrcsMember[] }),
        has("meetings") ? srcsApi.admin.meetings(token, unitF) : Promise.resolve({ meetings: [] as SrcsMeeting[] }),
        has("announcements") ? srcsApi.admin.announcements(token, unitF) : Promise.resolve({ announcements: [] as SrcsAnnouncement[] }),
        has("activities") ? srcsApi.admin.activities(token, unitF) : Promise.resolve({ activities: [] as SrcsActivity[] }),
        has("cohorts", "members", "courses") ? srcsApi.admin.cohorts(token, unitF) : Promise.resolve({ cohorts: [] as SrcsCohort[] }),
      ]);
      setMembers(mm.members); setMeetings(mt.meetings); setOverview({ announcements: an.announcements, activities: ac.activities }); setCohorts(co.cohorts);
    } catch (e: any) { if (e?.status === 403) setDenied(true); else notify("تعذّر التحميل", e?.message); }
    finally { setRefreshing(false); }
  }, [token, unitF]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pending = members.filter((x) => x.status === "pending");
  const branchLevel = scope?.level === "branch";
  const tabs = TABS.filter(([, , , need]) => need === null || (need === "app" ? appAdmin : need === "branch" ? !!scope?.isBranchAdmin : need.some((k) => perms.includes(k))));
  // خيارات الوحدة في نماذج الإنشاء ونقل الأعضاء
  const createUnits = writeOptions(scope);
  const memberUnits = writeOptions(scope).map((o) => (o.id === 0 ? { ...o, name: "بلا وحدة" } : o));
  const newUnit = defaultUnit(createUnits, unitF);
  const myUnitNames = scope && !branchLevel ? scope.units.map((u) => u.name) : [];
  const headerTitle = appAdmin ? "إدارة الهلال الأحمر" : branchLevel ? "إدارة الفرع — الهلال الأحمر"
    : myUnitNames.length === 1 ? `إدارة وحدة: ${myUnitNames[0]}` : myUnitNames.length ? "إدارة وحداتي" : "لوحتي في الهلال الأحمر";
  const updateMember = async (m: SrcsMember, b: Record<string, unknown>, msg?: string) => {
    try { await srcsApi.admin.updateMember(token!, m.id, b); if (msg) notify(msg); load(); } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  if (denied) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <Ionicons name="lock-closed" size={44} color={Colors.textMuted} />
        <Text style={[s.cardTitle, { textAlign: "center", marginTop: 10 }]}>هذه اللوحة لإدارة الفرع فقط</Text>
        <TouchableOpacity style={[s.primary, { flex: 0, paddingHorizontal: 24, marginTop: 16 }]} onPress={() => router.back()}><Text style={s.primaryTxt}>رجوع</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/red-crescent" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[s.title, { flex: 1, textAlign: "center" }]} numberOfLines={1}>{headerTitle}</Text>
        <View style={{ width: 44 }} />
      </View>
      <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {tabs.map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
            <Ionicons name={ic} size={14} color={tab === k ? "#fff" : Colors.textSecondary} />
            <Text style={[s.tabTxt, tab === k && { color: "#fff" }]}>{l}{k === "requests" && pending.length ? ` (${pending.length})` : ""}</Text>
          </TouchableOpacity>
        ))}
      </RtlScrollRow>
      {scope && tab !== "units" && tab !== "settings" ? <UnitFilterRow scope={scope} value={unitF} onChange={setUnitF} /> : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: insets.bottom + 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SRCS_RED} />}>
        {!dash ? <ActivityIndicator color={SRCS_RED} style={{ marginTop: 30 }} /> : null}

        {tab === "dash" && dash ? (
          <View style={s.permCard}>
            <View style={s.row}><Ionicons name={appAdmin ? "shield-checkmark" : "key"} size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>{appAdmin ? "مدير حصاحيصاوي — صلاحيات كاملة" : "صلاحياتك في هذه اللوحة"}</Text></View>
            {scope && !branchLevel ? (
              <Text style={s.hint}>نطاقك: {myUnitNames.join("، ")} — ترى وتدير أعضاء {myUnitNames.length > 1 ? "وحداتك" : "وحدتك"} ومحتواها فقط.</Text>
            ) : scope && unitF !== undefined ? (
              <Text style={s.hint}>الأرقام أدناه مرشّحة لـ: {unitF === 0 ? "المحتوى العام للفرع" : scope.units.find((u) => u.id === unitF)?.name}</Text>
            ) : null}
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
              {perms.map((p) => <View key={p} style={s.permPill}><Text style={s.permPillTxt}>{PERM_LABEL[p]}</Text></View>)}
            </View>
            {appAdmin ? <Text style={s.hint}>امنح الصلاحيات لأي فرد من تبويب «الأعضاء» ← «تعديل وصلاحيات». الحظر وإلغاء البطاقات وسعر الشهادة متاحة لك وحدك.</Text> : null}
          </View>
        ) : null}
        {tab === "dash" && dash ? (
          <View style={s.grid}>
            {([["طلبات معلّقة", dash.pending, "person-add", "requests"], ["أعضاء نشطون", dash.active, "people", "members"], ["مسعفون", dash.paramedics, "medkit", "members"],
              ["بطاقات تنتهي خلال 30 يوماً", dash.cards_expiring, "card", "members"], ["دورات جارية", dash.open_courses, "school", "courses"],
              ["مدفوعات شهادات معلّقة", dash.cert_pending, "ribbon", "courses"], ["الدفعات", dash.cohorts, "albums", "cohorts"],
              ["اجتماعات قادمة", dash.upcoming_meetings, "calendar", "meetings"], ["أنشطة موثّقة", dash.activities, "images", "activities"],
              ["مستفيدون", dash.beneficiaries, "heart", "activities"], ["بطاقات ملغاة / محظورون", dash.revoked, "ban", "members"]] as const)
              .filter(([, , , t]) => tabs.some(([k]) => k === t)).map(([l, n, ic, t]) => (
              <TouchableOpacity key={String(l)} style={s.tile} onPress={() => setTab(t as Tab)}>
                <Ionicons name={ic as any} size={20} color={SRCS_RED} />
                <Text style={s.tileNum}>{Number(n).toLocaleString("ar-EG")}</Text>
                <Text style={s.tileLbl}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {tab === "requests" ? (
          pending.length ? pending.map((m) => (
            <View key={m.id} style={s.card}>
              <MemberHead m={m} />
              <Text style={s.body}>يرغب بصفة: <Text style={{ fontFamily: "Cairo_700Bold" }}>{ROLE_LABEL[(m.desired_role || "volunteer") as SrcsRole]}</Text>{m.blood_type ? ` · فصيلة ${m.blood_type}` : ""}</Text>
              <View style={s.row}><Ionicons name="people-circle-outline" size={15} color={SRCS_RED} /><Text style={[s.metaStrong, { flex: 1 }]}>{m.unit_name || m.unit || "لم يحدد وحدة — تراجعه إدارة الفرع"}</Text></View>
              {m.experience ? <Text style={s.body}>الخبرة: {m.experience}</Text> : null}
              {m.certifications ? <Text style={s.body}>الشهادات: {m.certifications}</Text> : null}
              {/* المستندات للمراجعة */}
              <View style={s.docsReview}>
                <View style={s.row}>
                  <Ionicons name="document-lock" size={16} color={SRCS_RED} />
                  <Text style={[s.itemTitle, { flex: 1, fontSize: 13.5 }]}>المستندات</Text>
                  {m.national_id_no ? <Text style={[s.metaStrong, { writingDirection: "ltr" }]} selectable>الرقم الوطني: {m.national_id_no}</Text> : <Text style={[s.meta, { color: Colors.danger }]}>بلا رقم وطني</Text>}
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {([["صورة الهوية", m.id_doc_url], ["صورة الشهادة", m.cert_doc_url]] as const).map(([label, url]) => url ? (
                    <TouchableOpacity key={label} style={s.docTile} onPress={() => setDocView({ title: `${label} — ${m.name}`, url })} accessibilityLabel={`عرض ${label} مكبّرة`}>
                      <Image source={{ uri: url }} style={s.docImg} resizeMode="cover" />
                      <View style={s.docCap}><Ionicons name="expand" size={12} color="#fff" /><Text style={s.docCapTxt}>{label}</Text></View>
                    </TouchableOpacity>
                  ) : (
                    <View key={label} style={[s.docTile, s.docMissing]}><Ionicons name="alert-circle-outline" size={20} color={Colors.danger} /><Text style={[s.meta, { color: Colors.danger }]}>{label} غير مرفقة</Text></View>
                  ))}
                </View>
                {m.desired_role === "paramedic" && (!m.id_doc_url || !m.cert_doc_url) ? <Text style={[s.meta, { color: Colors.danger }]}>تنبيه: طلب مسعف بمستندات ناقصة — يُفضّل طلب استكمالها قبل القبول.</Text> : null}
              </View>
              <TouchableOpacity style={[s.primary, { flex: 0 }]} onPress={() => updateMember(m, { status: "active", role: m.desired_role || "volunteer" }, "قُبل الطلب وأُصدرت البطاقة")}><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.primaryTxt}>قبول وإصدار البطاقة</Text></TouchableOpacity>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity style={s.ghost} onPress={async () => { if (await confirmAction("رفض الطلب", `رفض طلب ${m.name}؟`, "رفض", true)) updateMember(m, { status: "rejected" }); }}><Text style={s.ghostTxt}>رفض</Text></TouchableOpacity>
                <TouchableOpacity style={s.ghost} onPress={async () => { if (await confirmAction("طلب استكمال المستندات", `إعادة الطلب إلى ${m.name} ليُرفق مستندات واضحة؟`, "إرسال")) updateMember(m, { status: "rejected", admin_note: "المستندات ناقصة أو غير واضحة — أعد التقديم مع صورة واضحة للهوية والشهادة" }); }}><Text style={s.ghostTxt}>استكمال</Text></TouchableOpacity>
              </View>
            </View>
          )) : <Text style={s.empty}>لا توجد طلبات معلّقة.</Text>
        ) : null}

        {tab === "units" && scope?.isBranchAdmin ? <UnitsPanel members={members} onChanged={load} /> : null}
        {tab === "members" ? <MembersList members={members} cohorts={cohorts} perms={perms} isAppAdmin={appAdmin} canGrantAdmin={!!scope?.isBranchAdmin} units={memberUnits} unitFilter={unitF} onChanged={load} /> : null}
        {tab === "cohorts" ? <CohortsPanel cohorts={cohorts} members={members} units={createUnits} defaultUnitId={newUnit} onChanged={load} /> : null}
        {tab === "courses" ? <AdminCourses perms={perms} isAppAdmin={appAdmin} cohorts={cohorts} members={members} units={createUnits} defaultUnitId={newUnit} unitFilter={unitF} /> : null}
        {tab === "settings" && appAdmin ? <SettingsPanel /> : null}
        {tab === "audit" ? <AuditPanel unit={unitF} /> : null}

        {tab === "meetings" ? (
          <>
            <TouchableOpacity style={s.primary} onPress={() => setForm("meeting")}><Ionicons name="add" size={18} color="#fff" /><Text style={s.primaryTxt}>اجتماع جديد</Text></TouchableOpacity>
            {meetings.map((mt) => (
              <View key={mt.id} style={s.card}>
                <View style={s.row}><Text style={[s.itemTitle, { flex: 1 }]}>{mt.title}</Text><UnitTag name={mt.unit_name} /></View>
                <View style={s.row}><Ionicons name="time-outline" size={14} color={SRCS_RED} /><Text style={[s.meta, { flex: 1 }]}>{fmtDateTime(mt.starts_at)}{mt.ends_at ? ` — حتى ${new Date(mt.ends_at).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}` : ""}</Text></View>
                <View style={s.row}><Ionicons name="location-outline" size={14} color={SRCS_RED} /><Text style={[s.meta, { flex: 1 }]}>{mt.place || "لم يُحدد المكان"} · {AUDIENCE_LABEL[mt.audience]}</Text></View>
                <Text style={s.meta}>سيحضر {mt.going ?? 0} · حضر فعلاً {mt.attended ?? 0}</Text>
                {mt.minutes ? <Text style={s.body} numberOfLines={3}>المحضر: {mt.minutes}</Text> : null}
                <ExportButtons kind="meeting" id={mt.id} compact />
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity style={s.ghost} onPress={() => setScanFor({ title: mt.title, meeting_id: mt.id })}><Ionicons name="qr-code" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>مسح الحضور</Text></TouchableOpacity>
                  <TouchableOpacity style={s.ghost} onPress={() => setAttendFor(mt)}><Text style={s.ghostTxt}>الحضور والمحضر</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={async () => { if (await confirmAction("حذف الاجتماع", mt.title, "حذف", true)) { await srcsApi.admin.deleteMeeting(token!, mt.id); load(); } }}><Ionicons name="trash" size={16} color={SRCS_RED} /></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {tab === "announcements" ? (
          <>
            <TouchableOpacity style={s.primary} onPress={() => setForm("announcement")}><Ionicons name="add" size={18} color="#fff" /><Text style={s.primaryTxt}>إعلان جديد</Text></TouchableOpacity>
            {overview.announcements.map((a) => (
              <View key={a.id} style={s.card}>
                <View style={s.row}>{a.pinned ? <Ionicons name="pin" size={14} color={Colors.accent} /> : null}<Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text><UnitTag name={a.unit_name} /><Text style={s.meta}>{AUDIENCE_LABEL[a.audience]}</Text></View>
                <Text style={s.body}>{a.body}</Text>
                <TouchableOpacity style={[s.ghost, { flex: 0 }]} onPress={async () => { if (await confirmAction("حذف الإعلان", a.title, "حذف", true)) { await srcsApi.admin.deleteAnnouncement(token!, a.id); load(); } }}><Text style={s.ghostTxt}>حذف</Text></TouchableOpacity>
              </View>
            ))}
          </>
        ) : null}

        {tab === "activities" ? (
          <>
            <TouchableOpacity style={s.primary} onPress={() => setForm("activity")}><Ionicons name="add" size={18} color="#fff" /><Text style={s.primaryTxt}>توثيق نشاط أو فعالية</Text></TouchableOpacity>
            {overview.activities.map((a) => (
              <View key={a.id} style={s.card}>
                {a.images?.[0] ? <Image source={{ uri: a.images[0] }} style={{ width: "100%", height: 140, borderRadius: 12 }} /> : null}
                <View style={s.row}><Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text><UnitTag name={a.unit_name} /></View>
                <Text style={s.meta}>{(ACTIVITY_TYPES[a.type] ?? ACTIVITY_TYPES.other).label} · {fmt(a.happened_at)}{a.place ? ` · ${a.place}` : ""} · {a.beneficiaries} مستفيد · {a.volunteers ?? 0} مشارك{a.points ? ` · ${a.points} نقطة للمشارك` : ""}</Text>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity style={s.ghost} onPress={() => setPartFor(a)}><Text style={s.ghostTxt}>تسجيل المشاركين</Text></TouchableOpacity>
                  <TouchableOpacity style={s.ghost} onPress={async () => { await srcsApi.admin.updateActivity(token!, a.id, { published: !a.published }); load(); }}><Text style={s.ghostTxt}>{a.published ? "إخفاء" : "نشر"}</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={async () => { if (await confirmAction("حذف النشاط", a.title, "حذف", true)) { await srcsApi.admin.deleteActivity(token!, a.id); load(); } }}><Ionicons name="trash" size={16} color={SRCS_RED} /></TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <CheckinScanner target={scanFor} onClose={() => { setScanFor(null); load(); }} />
      <FormModal kind={form} units={createUnits} defaultUnitId={newUnit} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      <AttendanceModal meeting={attendFor} onClose={() => setAttendFor(null)} onSaved={() => { setAttendFor(null); load(); }} />
      <ZoomViewer visible={!!docView} onClose={() => setDocView(null)} title={docView?.title} pages={docView ? [{ label: docView.title, ratio: 0.75, render: (w) => <Image source={{ uri: docView.url }} style={{ width: w, height: w * 0.75 }} resizeMode="contain" /> }] : []} />
      <ParticipantsModal activity={partFor} members={members.filter((m) => m.status === "active" && (!partFor?.unit_id || m.unit_id === partFor.unit_id))} onClose={() => setPartFor(null)} onSaved={() => { setPartFor(null); load(); }} />
    </View>
  );
}

function UnitTag({ name }: { name?: string | null }) {
  return <View style={s.unitTag}><Text style={s.unitTagTxt}>{unitLabel(name)}</Text></View>;
}

function MemberHead({ m }: { m: SrcsMember }) {
  return (
    <View style={s.row}>
      <UserAvatar name={m.name || "؟"} avatarUrl={m.avatar_url ?? null} size={40} borderRadius={12} />
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle}>{m.name}</Text>
        <Text style={s.meta}>{ROLE_LABEL[m.role]} · {m.status === "active" ? "نشط" : m.status === "pending" ? "معلّق" : m.status === "suspended" ? "موقوف" : "مرفوض"} · {m.phone || m.account_phone || ""}</Text>
      </View>
    </View>
  );
}

function FormModal({ kind, units, defaultUnitId, onClose, onSaved }: { kind: null | "meeting" | "announcement" | "activity"; units: UnitOption[]; defaultUnitId: number; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const base = { unit_id: defaultUnitId };
    setF(kind === "activity" ? { ...base, type: "awareness", points: "10", images: [] } : kind === "announcement" ? { ...base, audience: "members" } : kind === "meeting" ? { ...base, audience: "members" } : {});
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const addImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    setBusy(true);
    try { const url = await uploadFile(`srcs/${Date.now()}.jpg`, r.assets[0].uri, { mimeType: r.assets[0].mimeType || "image/jpeg" }); set("images", [...(f.images || []), url]); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!token || !kind) return;
    setBusy(true);
    try {
      if (kind === "meeting") {
        if (!f.title?.trim()) { notify("بيانات ناقصة", "اكتب عنوان الاجتماع"); return; }
        if (!f.starts_at) { notify("بيانات ناقصة", "حدّد تاريخ ووقت الاجتماع"); return; }
        if (!f.place?.trim()) { notify("بيانات ناقصة", "حدّد مكان الاجتماع"); return; }
        await srcsApi.admin.createMeeting(token, { title: f.title, place: f.place, agenda: f.agenda, starts_at: f.starts_at, ends_at: f.ends_at, audience: f.audience, unit_id: f.unit_id || null });
      } else if (kind === "announcement") {
        if (!f.title || !f.body) { notify("بيانات ناقصة", "العنوان والنص مطلوبان"); return; }
        await srcsApi.admin.createAnnouncement(token, { title: f.title, body: f.body, audience: f.audience, pinned: !!f.pinned, unit_id: f.unit_id || null });
      } else {
        if (!f.title) { notify("بيانات ناقصة", "العنوان مطلوب"); return; }
        await srcsApi.admin.createActivity(token, { title: f.title, type: f.type, place: f.place, description: f.description, images: f.images,
          beneficiaries: Number(f.beneficiaries) || 0, points: Number(f.points) || 0, happened_at: f.starts_at || undefined, unit_id: f.unit_id || null });
      }
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    finally { setBusy(false); }
  };

  // محتوى الوحدة لا يكون «للجميع» خارجها
  const audiences = kind === "announcement" && !f.unit_id ? ["public", "members", "paramedics", "admins"] : ["members", "paramedics", "admins"];
  return (
    <Modal visible={!!kind} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.cardTitle}>{kind === "meeting" ? "اجتماع جديد" : kind === "announcement" ? "إعلان جديد" : "توثيق نشاط"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <UnitPicker options={units} value={f.unit_id ?? defaultUnitId} onChange={(id) => setF((p) => ({ ...p, unit_id: id, audience: id && p.audience === "public" ? "members" : p.audience }))} />
            <Text style={s.label}>العنوان *</Text>
            <TextInput value={f.title || ""} onChangeText={(v) => set("title", v)} placeholder={kind === "meeting" ? "مثال: الاجتماع الدوري لفريق الاستجابة" : "العنوان"} placeholderTextColor={Colors.textMuted} style={s.input} />
            {kind === "activity" ? (
              <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                {Object.entries(ACTIVITY_TYPES).map(([k, t]) => (
                  <TouchableOpacity key={k} onPress={() => set("type", k)} style={[s.chip, f.type === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}><Text style={[s.chipTxt, f.type === k && { color: "#fff" }]}>{t.label}</Text></TouchableOpacity>
                ))}
              </RtlScrollRow>
            ) : null}
            {kind === "meeting" ? (
              <>
                <DateTimeField label="موعد البدء" required value={f.starts_at} onChange={(v) => set("starts_at", v)} minDate={new Date()} />
                <DateTimeField label="موعد الانتهاء (اختياري)" value={f.ends_at} onChange={(v) => set("ends_at", v)} minDate={f.starts_at ? new Date(f.starts_at) : new Date()} />
              </>
            ) : kind === "activity" ? (
              <DateTimeField label="تاريخ النشاط" value={f.starts_at} onChange={(v) => set("starts_at", v)} placeholder="اليوم (افتراضياً)" />
            ) : null}
            {kind !== "announcement" ? (
              <>
                <Text style={s.label}>المكان{kind === "meeting" ? " *" : ""}</Text>
                <TextInput value={f.place || ""} onChangeText={(v) => set("place", v)} placeholder={kind === "meeting" ? "القاعة أو العنوان أو رابط الاجتماع" : "موقع النشاط"} placeholderTextColor={Colors.textMuted} style={s.input} />
                <PlaceChips onPick={(p) => set("place", p)} />
              </>
            ) : null}
            <TextInput value={(kind === "meeting" ? f.agenda : kind === "announcement" ? f.body : f.description) || ""} multiline
              onChangeText={(v) => set(kind === "meeting" ? "agenda" : kind === "announcement" ? "body" : "description", v)}
              placeholder={kind === "meeting" ? "جدول الأعمال" : kind === "announcement" ? "نص الإعلان" : "وصف النشاط وما أُنجز"} placeholderTextColor={Colors.textMuted} style={[s.input, { height: 110, textAlignVertical: "top" }]} />
            {kind !== "activity" ? (
              <>
                <Text style={s.label}>{kind === "meeting" ? "المدعوون" : "يظهر لـ"}</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                  {audiences.map((a) => (
                    <TouchableOpacity key={a} onPress={() => set("audience", a)} style={[s.chip, f.audience === a && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}><Text style={[s.chipTxt, f.audience === a && { color: "#fff" }]}>{AUDIENCE_LABEL[a]}</Text></TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            {kind === "announcement" ? (
              <View style={s.row}><Switch value={!!f.pinned} onValueChange={(v) => set("pinned", v)} /><Text style={[s.label, { flex: 1 }]}>تثبيت في الأعلى</Text></View>
            ) : null}
            {kind === "activity" ? (
              <>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TextInput value={f.beneficiaries || ""} onChangeText={(v) => set("beneficiaries", v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="عدد المستفيدين" placeholderTextColor={Colors.textMuted} style={[s.input, { flex: 1 }]} />
                  <TextInput value={f.points || ""} onChangeText={(v) => set("points", v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="نقاط لكل مشارك" placeholderTextColor={Colors.textMuted} style={[s.input, { flex: 1 }]} />
                </View>
                <Text style={s.hint}>نقاط المشاركين تُضاف إلى رصيد التطوع في حصاحيصاوي وترفع مستواهم.</Text>
                <RtlScrollRow contentContainerStyle={{ gap: 8 }}>
                  {(f.images || []).map((u: string) => <Image key={u} source={{ uri: u }} style={{ width: 70, height: 70, borderRadius: 10 }} />)}
                  <TouchableOpacity onPress={addImage} style={s.addImg} disabled={busy}><Ionicons name="camera" size={22} color={SRCS_RED} /><Text style={s.chipTxt}>صورة</Text></TouchableOpacity>
                </RtlScrollRow>
              </>
            ) : null}
            <TouchableOpacity style={[s.primary, { marginTop: 6 }]} onPress={save} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>حفظ{kind !== "activity" && f.audience !== "public" ? " وإشعار الأعضاء" : ""}</Text>}</TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AttendanceModal({ meeting, onClose, onSaved }: { meeting: SrcsMeeting | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<{ user_id: number; name: string; status: string | null; attended: boolean }[]>([]);
  const [minutes, setMinutes] = useState("");
  useEffect(() => {
    if (!meeting || !token) return;
    setMinutes(meeting.minutes || "");
    srcsApi.admin.rsvps(token, meeting.id).then((r) => setRows(r.rsvps)).catch(() => setRows([]));
  }, [meeting, token]);
  const save = async () => {
    try { await srcsApi.admin.updateMeeting(token!, meeting!.id, { minutes, attended_user_ids: rows.filter((r) => r.attended).map((r) => r.user_id) }); onSaved(); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };
  return (
    <Modal visible={!!meeting} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>{meeting?.title}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
            <Text style={s.label}>الحضور</Text>
            {rows.map((r, i) => (
              <TouchableOpacity key={r.user_id} style={s.row} onPress={() => setRows((p) => p.map((x, j) => (j === i ? { ...x, attended: !x.attended } : x)))}>
                <Ionicons name={r.attended ? "checkbox" : "square-outline"} size={22} color={SRCS_RED} />
                <Text style={[s.body, { flex: 1 }]}>{r.name}</Text>
                <Text style={s.meta}>{r.status === "going" ? "أكّد الحضور" : r.status === "not_going" ? "معتذر" : r.status === "maybe" ? "ربما" : ""}</Text>
              </TouchableOpacity>
            ))}
            <Text style={s.label}>محضر الاجتماع</Text>
            <TextInput value={minutes} onChangeText={setMinutes} multiline placeholder="القرارات والتكليفات…" placeholderTextColor={Colors.textMuted} style={[s.input, { height: 120, textAlignVertical: "top" }]} />
            <TouchableOpacity style={s.primary} onPress={save}><Text style={s.primaryTxt}>حفظ</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ParticipantsModal({ activity, members, onClose, onSaved }: { activity: SrcsActivity | null; members: SrcsMember[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => { setPicked([]); }, [activity]);
  const save = async () => {
    try {
      const r = await srcsApi.admin.participants(token!, activity!.id, picked);
      notify("تم التسجيل", `${r.participants} مشارك · مُنحت النقاط لـ ${r.awarded}`);
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };
  return (
    <Modal visible={!!activity} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>المشاركون في: {activity?.title}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
            {members.map((m) => {
              const on = picked.includes(m.user_id);
              return (
                <TouchableOpacity key={m.id} style={s.row} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== m.user_id) : [...p, m.user_id]))}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={SRCS_RED} />
                  <Text style={[s.body, { flex: 1 }]}>{m.name}</Text><Text style={s.meta}>{ROLE_LABEL[m.role]}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={s.primary} onPress={save} disabled={!picked.length}><Text style={s.primaryTxt}>تسجيل {picked.length || ""} ومنح {activity?.points ?? 0} نقطة لكل منهم</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  ...srcsStyles,
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  tabTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", padding: 14, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 4, alignItems: "flex-end" },
  tileNum: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.text },
  tileLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  addImg: { width: 70, height: 70, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: SRCS_RED + "80", alignItems: "center", justifyContent: "center" },
  docsReview: { gap: 8, padding: 10, borderRadius: 14, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  docTile: { flex: 1, height: 96, borderRadius: 12, overflow: "hidden", backgroundColor: Colors.cardBg },
  docImg: { width: "100%", height: "100%" },
  docCap: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 3, backgroundColor: "rgba(0,0,0,0.5)" },
  docCapTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },
  docMissing: { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.danger + "66" },
  permCard: { padding: 14, borderRadius: 18, backgroundColor: SRCS_RED + "08", borderWidth: 1, borderColor: SRCS_RED + "30", gap: 8 },
  permPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: SRCS_RED + "40" },
  permPillTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: SRCS_RED },
  unitTag: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 10, backgroundColor: SRCS_RED + "12" },
  unitTagTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: SRCS_RED },
});
