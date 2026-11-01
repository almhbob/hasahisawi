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
import {
  srcsApi, ROLE_LABEL, ACTIVITY_TYPES, AUDIENCE_LABEL, SRCS_RED,
  type SrcsMember, type SrcsMeeting, type SrcsActivity, type SrcsRole, type SrcsAnnouncement,
} from "@/lib/red-crescent";

type Tab = "dash" | "requests" | "members" | "meetings" | "announcements" | "activities";
const TABS: [Tab, string, keyof typeof Ionicons.glyphMap][] = [
  ["dash", "اللوحة", "grid"], ["requests", "الطلبات", "person-add"], ["members", "الأعضاء", "people"],
  ["meetings", "الاجتماعات", "calendar"], ["announcements", "الإعلانات", "megaphone"], ["activities", "الأنشطة", "images"],
];
const fmt = (s: string, time = false) => new Date(s).toLocaleString("ar-EG", time ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
/** "2026-11-05 17:30" → ISO (الإدخال بتوقيت الهاتف) */
const parseLocal = (v: string) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v.trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 9), +(m[5] ?? 0)).toISOString() : null; };

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

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [d, mm, mt, ov] = await Promise.all([srcsApi.admin.dashboard(token), srcsApi.admin.members(token), srcsApi.admin.meetings(token), srcsApi.overview(token)]);
      setDash(d); setMembers(mm.members); setMeetings(mt.meetings); setOverview({ announcements: ov.announcements, activities: ov.activities });
    } catch (e: any) { if (e?.status === 403) setDenied(true); else notify("تعذّر التحميل", e?.message); }
    finally { setRefreshing(false); }
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pending = members.filter((x) => x.status === "pending");
  const others = members.filter((x) => x.status !== "pending");
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
        <Text style={s.title}>إدارة فرعية الهلال الأحمر</Text>
        <View style={{ width: 44 }} />
      </View>
      <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {TABS.map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
            <Ionicons name={ic} size={14} color={tab === k ? "#fff" : Colors.textSecondary} />
            <Text style={[s.tabTxt, tab === k && { color: "#fff" }]}>{l}{k === "requests" && pending.length ? ` (${pending.length})` : ""}</Text>
          </TouchableOpacity>
        ))}
      </RtlScrollRow>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: insets.bottom + 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SRCS_RED} />}>
        {!dash ? <ActivityIndicator color={SRCS_RED} style={{ marginTop: 30 }} /> : null}

        {tab === "dash" && dash ? (
          <View style={s.grid}>
            {[["طلبات معلّقة", dash.pending, "person-add", "requests"], ["أعضاء نشطون", dash.active, "people", "members"], ["مسعفون", dash.paramedics, "medkit", "members"],
              ["بطاقات تنتهي خلال 30 يوماً", dash.cards_expiring, "card", "members"], ["اجتماعات قادمة", dash.upcoming_meetings, "calendar", "meetings"],
              ["أنشطة موثّقة", dash.activities, "images", "activities"], ["مستفيدون", dash.beneficiaries, "heart", "activities"]].map(([l, n, ic, t]) => (
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
              <Text style={s.body}>يرغب بصفة: <Text style={{ fontFamily: "Cairo_700Bold" }}>{ROLE_LABEL[(m.desired_role || "volunteer") as SrcsRole]}</Text>{m.blood_type ? ` · فصيلة ${m.blood_type}` : ""}{m.unit ? ` · ${m.unit}` : ""}</Text>
              {m.experience ? <Text style={s.body}>الخبرة: {m.experience}</Text> : null}
              {m.certifications ? <Text style={s.body}>الشهادات: {m.certifications}</Text> : null}
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity style={s.primary} onPress={() => updateMember(m, { status: "active", role: m.desired_role || "volunteer" }, "قُبل الطلب وأُصدرت البطاقة")}><Text style={s.primaryTxt}>قبول وإصدار البطاقة</Text></TouchableOpacity>
                <TouchableOpacity style={s.ghost} onPress={async () => { if (await confirmAction("رفض الطلب", `رفض طلب ${m.name}؟`, "رفض", true)) updateMember(m, { status: "rejected" }); }}><Text style={s.ghostTxt}>رفض</Text></TouchableOpacity>
              </View>
            </View>
          )) : <Text style={s.empty}>لا توجد طلبات معلّقة.</Text>
        ) : null}

        {tab === "members" ? (
          others.length ? others.map((m) => (
            <View key={m.id} style={s.card}>
              <MemberHead m={m} />
              <Text style={s.meta}>{m.card_no ? `بطاقة ${m.card_no} · حتى ${m.card_expires_at ? fmt(m.card_expires_at) : "—"}` : "بلا بطاقة"}{m.musif_code ? " · مرتبط بمسعف" : ""}</Text>
              <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                {(Object.keys(ROLE_LABEL) as SrcsRole[]).map((r) => (
                  <TouchableOpacity key={r} onPress={() => m.role !== r && updateMember(m, { role: r })} style={[s.chip, m.role === r && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
                    <Text style={[s.chipTxt, m.role === r && { color: "#fff" }]}>{ROLE_LABEL[r]}</Text>
                  </TouchableOpacity>
                ))}
              </RtlScrollRow>
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                {m.status === "active" ? (
                  <>
                    <TouchableOpacity style={s.ghost} onPress={() => updateMember(m, { renew_card: true }, "جُدّدت البطاقة لعام")}><Text style={s.ghostTxt}>تجديد البطاقة</Text></TouchableOpacity>
                    <TouchableOpacity style={s.ghost} onPress={async () => { if (await confirmAction("إيقاف العضوية", `إيقاف ${m.name} مؤقتاً؟`, "إيقاف", true)) updateMember(m, { status: "suspended" }); }}><Text style={s.ghostTxt}>إيقاف</Text></TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={s.primary} onPress={() => updateMember(m, { status: "active" }, "أُعيد تفعيل العضوية")}><Text style={s.primaryTxt}>تفعيل</Text></TouchableOpacity>
                )}
                <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 12 }]} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(m.user_id) } })}><Ionicons name="person" size={16} color={SRCS_RED} /></TouchableOpacity>
              </View>
            </View>
          )) : <Text style={s.empty}>لا يوجد أعضاء بعد.</Text>
        ) : null}

        {tab === "meetings" ? (
          <>
            <TouchableOpacity style={s.primary} onPress={() => setForm("meeting")}><Ionicons name="add" size={18} color="#fff" /><Text style={s.primaryTxt}>اجتماع جديد</Text></TouchableOpacity>
            {meetings.map((mt) => (
              <View key={mt.id} style={s.card}>
                <Text style={s.itemTitle}>{mt.title}</Text>
                <Text style={s.meta}>{fmt(mt.starts_at, true)}{mt.place ? ` · ${mt.place}` : ""} · {AUDIENCE_LABEL[mt.audience]}</Text>
                <Text style={s.meta}>سيحضر {mt.going ?? 0} · حضر فعلاً {mt.attended ?? 0}</Text>
                {mt.minutes ? <Text style={s.body} numberOfLines={3}>المحضر: {mt.minutes}</Text> : null}
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
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
                <View style={s.row}>{a.pinned ? <Ionicons name="pin" size={14} color={Colors.accent} /> : null}<Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text><Text style={s.meta}>{AUDIENCE_LABEL[a.audience]}</Text></View>
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
                <Text style={s.itemTitle}>{a.title}</Text>
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

      <FormModal kind={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />
      <AttendanceModal meeting={attendFor} onClose={() => setAttendFor(null)} onSaved={() => { setAttendFor(null); load(); }} />
      <ParticipantsModal activity={partFor} members={members.filter((m) => m.status === "active")} onClose={() => setPartFor(null)} onSaved={() => { setPartFor(null); load(); }} />
    </View>
  );
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

function FormModal({ kind, onClose, onSaved }: { kind: null | "meeting" | "announcement" | "activity"; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(kind === "activity" ? { type: "awareness", points: "10", images: [] } : kind === "announcement" ? { audience: "members" } : kind === "meeting" ? { audience: "members" } : {}); }, [kind]);
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
        const iso = parseLocal(String(f.when || ""));
        if (!f.title || !iso) { notify("بيانات ناقصة", "اكتب العنوان والموعد بصيغة 2026-11-05 17:30"); return; }
        await srcsApi.admin.createMeeting(token, { title: f.title, place: f.place, agenda: f.agenda, starts_at: iso, audience: f.audience });
      } else if (kind === "announcement") {
        if (!f.title || !f.body) { notify("بيانات ناقصة", "العنوان والنص مطلوبان"); return; }
        await srcsApi.admin.createAnnouncement(token, { title: f.title, body: f.body, audience: f.audience, pinned: !!f.pinned });
      } else {
        if (!f.title) { notify("بيانات ناقصة", "العنوان مطلوب"); return; }
        await srcsApi.admin.createActivity(token, { title: f.title, type: f.type, place: f.place, description: f.description, images: f.images,
          beneficiaries: Number(f.beneficiaries) || 0, points: Number(f.points) || 0, happened_at: f.when ? parseLocal(String(f.when)) : undefined });
      }
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    finally { setBusy(false); }
  };

  const audiences = kind === "announcement" ? ["public", "members", "paramedics", "admins"] : ["members", "paramedics", "admins"];
  return (
    <Modal visible={!!kind} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.cardTitle}>{kind === "meeting" ? "اجتماع جديد" : kind === "announcement" ? "إعلان جديد" : "توثيق نشاط"}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <TextInput value={f.title || ""} onChangeText={(v) => set("title", v)} placeholder="العنوان" placeholderTextColor={Colors.textMuted} style={s.input} />
            {kind === "activity" ? (
              <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                {Object.entries(ACTIVITY_TYPES).map(([k, t]) => (
                  <TouchableOpacity key={k} onPress={() => set("type", k)} style={[s.chip, f.type === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}><Text style={[s.chipTxt, f.type === k && { color: "#fff" }]}>{t.label}</Text></TouchableOpacity>
                ))}
              </RtlScrollRow>
            ) : null}
            {kind !== "announcement" ? <TextInput value={f.when || ""} onChangeText={(v) => set("when", v)} placeholder={kind === "meeting" ? "الموعد: 2026-11-05 17:30" : "التاريخ (اختياري): 2026-11-01"} placeholderTextColor={Colors.textMuted} style={[s.input, { writingDirection: "ltr" }]} /> : null}
            {kind !== "announcement" ? <TextInput value={f.place || ""} onChangeText={(v) => set("place", v)} placeholder="المكان" placeholderTextColor={Colors.textMuted} style={s.input} /> : null}
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
});
