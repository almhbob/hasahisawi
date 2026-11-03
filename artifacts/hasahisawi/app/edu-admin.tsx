// لوحة إدارة المؤسسة التعليمية (?id=): الطاقم، الطلاب، الفصول والمواد، الإعلانات، طلبات الطلاب،
// الدرجات والحضور، المدراء والصلاحيات، والإعدادات (الأيام، الحصص، الأوقات، الفصول الدراسية).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import {
  eduApi, EDU, EDU_GOLD, DAY_AR, ROLE_AR, PERM_AR, REQ_STATUS, KIND_AR,
  type Overview, type Staff, type Student, type EduRequest, type Announcement, type Settings,
} from "@/lib/edu-inst";
import { Hero, Card, H, Pill, Btn, Field, Empty, Stat, eduStyles as e } from "@/components/edu-inst/ui";
import { Sheet } from "@/components/edu-inst/sheet";

type Tab = "home" | "staff" | "students" | "classes" | "news" | "requests" | "grades" | "admins" | "settings";
const TABS: { k: Tab; l: string; i: keyof typeof Ionicons.glyphMap; perm?: string }[] = [
  { k: "home", l: "نظرة عامة", i: "speedometer-outline" },
  { k: "staff", l: "الطاقم", i: "easel-outline", perm: "staff" },
  { k: "students", l: "الطلاب", i: "people-outline", perm: "students" },
  { k: "classes", l: "الفصول والمواد", i: "grid-outline", perm: "timetable" },
  { k: "news", l: "الإعلانات", i: "megaphone-outline", perm: "announcements" },
  { k: "requests", l: "الطلبات", i: "document-text-outline", perm: "requests" },
  { k: "grades", l: "الدرجات والحضور", i: "stats-chart-outline" },
  { k: "admins", l: "المدراء", i: "shield-checkmark-outline", perm: "admins" },
  { k: "settings", l: "الإعدادات", i: "settings-outline", perm: "settings" },
];

export default function EduAdmin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const p = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const wsId = Number(p.id);
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>(p.tab ?? "home");
  const load = useCallback(async () => {
    if (!token) return setErr("سجّل الدخول");
    try { setOv(await eduApi.overview(token, wsId)); } catch (x: any) { setErr(x?.message || "تعذّر التحميل"); }
  }, [token, wsId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (err && !ov) return <View style={st.center}><Empty icon="lock-closed-outline" title={err} /></View>;
  if (!ov || !token) return <View style={st.center}><ActivityIndicator color={EDU} /></View>;
  const w = ov.institution;
  const can = (perm?: string) => !perm || ov.me.perms.includes(perm);
  const tabs = TABS.filter((t) => can(t.perm) && (t.k !== "grades" || ov.me.perms.includes("grades") || !!ov.me.staff_id));
  const ctx = { ov, token, wsId, reload: load };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Hero insetTop={insets.top} kicker={`${KIND_AR[w.kind] ?? ""} · ${ROLE_AR[ov.me.role ?? ""] ?? "معلم"}`} title={w.name} sub={`${w.settings.academic_year} · ${w.settings.current_term}`}
          right={<Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: "/edu-institution", params: { id: String(wsId) } } as any)} style={st.heroBtn} accessibilityLabel="الصفحة العامة"><Ionicons name="eye-outline" size={18} color="#fff" /></Pressable>} />
        <View style={{ paddingHorizontal: 16 }}>
          {w.status !== "active" && (
            <Card style={{ marginTop: 14, borderColor: "#B7791F", backgroundColor: "#B7791F10" }}>
              <View style={[e.rowR, { gap: 8 }]}>
                <Ionicons name="hourglass-outline" size={18} color="#B7791F" />
                <Text style={[e.t, { flex: 1, color: "#B7791F" }]}>{w.status === "pending" ? "طلب الانضمام قيد مراجعة إدارة التطبيق" : w.status === "rejected" ? "رُفض طلب الانضمام" : "المساحة موقوفة"}</Text>
              </View>
              <Text style={e.muted}>{w.admin_note || "يمكنك تجهيز الإعدادات الآن، وتُفتح بقية الأدوات فور التفعيل."}</Text>
            </Card>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
            {tabs.map((t) => <View key={t.k} style={{ transform: [{ scaleX: -1 }] }}><Pill label={t.l} icon={t.i} on={tab === t.k} onPress={() => setTab(t.k)} /></View>)}
          </ScrollView>
          {tab === "home" && <HomeTab {...ctx} go={setTab} />}
          {tab === "staff" && <StaffTab {...ctx} />}
          {tab === "students" && <StudentsTab {...ctx} />}
          {tab === "classes" && <ClassesTab {...ctx} />}
          {tab === "news" && <NewsTab {...ctx} />}
          {tab === "requests" && <RequestsTab {...ctx} />}
          {tab === "grades" && <GradesTab {...ctx} />}
          {tab === "admins" && <AdminsTab {...ctx} />}
          {tab === "settings" && <SettingsTab {...ctx} />}
        </View>
      </ScrollView>
    </View>
  );
}
type Ctx = { ov: Overview; token: string; wsId: number; reload: () => Promise<void> };
const run = async (f: () => Promise<unknown>, ok?: string) => { try { await f(); if (ok) notify("تم", ok); return true; } catch (x: any) { notify("تعذّر", x?.message); return false; } };
const confirmDo = (t: string, m: string, f: () => unknown) => { confirmAction(t, m, "تأكيد", true).then((ok) => { if (ok) f(); }); };
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

// ─── نظرة عامة ──────────────────────────────────────────────
function HomeTab({ ov, wsId, go }: Ctx & { go: (t: Tab) => void }) {
  const teachers = ov.staff.filter((s) => s.kind === "teacher" && s.active);
  const overloaded = teachers.filter((t) => (t.weekly_load ?? 0) > t.max_weekly);
  const unscheduled = ov.classes.filter((c) => !c.slots);
  const steps = [
    { done: ov.subjects.length > 0 && ov.classes.length > 0, l: "أضف الفصول والمواد", t: "classes" as Tab },
    { done: teachers.length > 0, l: "أضف المعلمين ومواد كل معلم", t: "staff" as Tab },
    { done: ov.counts.students > 0, l: "سجّل الطلاب (لصق جماعي)", t: "students" as Tab },
    { done: ov.classes.length > 0 && !unscheduled.length, l: "ابنِ جدول الحصص لكل فصل", t: null },
  ];
  return (
    <View>
      <View style={[e.rowR, { gap: 8, marginTop: 14 }]}>
        <Stat n={ov.counts.students} l="طالب" icon="people" />
        <Stat n={teachers.length} l="معلم" icon="easel" color={EDU_GOLD} />
        <Stat n={ov.classes.length} l="فصل" icon="grid" color="#0E8A5F" />
      </View>
      <View style={[e.rowR, { gap: 8, marginTop: 8 }]}>
        <Stat n={ov.counts.pending_requests} l="طلب طالب" icon="document-text" color="#B7791F" />
        <Stat n={ov.counts.pending_transfers} l="نقل معلّق" icon="swap-horizontal" color="#2B6CB0" />
        <Stat n={ov.subjects.length} l="مادة" icon="book" color="#7A5AF8" />
      </View>
      <View style={[e.wrap, { marginTop: 14 }]}>
        <Btn label="جدول الحصص" icon="calendar-outline" onPress={() => router.push({ pathname: "/edu-timetable", params: { id: String(wsId) } } as any)} />
        {ov.me.perms.includes("transfers") && <Btn label="النقل بين المدارس" icon="swap-horizontal" ghost onPress={() => router.push({ pathname: "/edu-transfer", params: { ws: String(wsId) } } as any)} />}
      </View>
      <H>خطوات التجهيز</H>
      <Card>
        {steps.map((s, i) => (
          <Pressable key={i} onPress={() => (s.t ? go(s.t) : router.push({ pathname: "/edu-timetable", params: { id: String(wsId) } } as any))} style={[e.rowR, { gap: 10, paddingVertical: 8 }]}>
            <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={s.done ? "#0E8A5F" : Colors.textMuted} />
            <Text style={[e.t, { flex: 1, color: s.done ? Colors.textMuted : Colors.textPrimary }]}>{s.l}</Text>
            <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      {(overloaded.length > 0 || unscheduled.length > 0) && (
        <>
          <H>تنبيهات</H>
          {overloaded.map((t) => <Card key={t.id} style={st.warn}><Text style={e.t}>⚠️ {t.name}: {t.weekly_load} حصة تتجاوز النصاب ({t.max_weekly})</Text></Card>)}
          {!!unscheduled.length && <Card style={st.warn}><Text style={e.t}>فصول بلا جدول: {unscheduled.map((c) => c.name).join("، ")}</Text></Card>}
        </>
      )}
    </View>
  );
}

// ─── الطاقم ─────────────────────────────────────────────────
function StaffTab({ ov, token, wsId, reload }: Ctx) {
  const [mode, setMode] = useState<"one" | "bulk" | null>(null);
  const [edit, setEdit] = useState<Staff | null>(null);
  const [filter, setFilter] = useState<"all" | "teacher" | "employee">("all");
  const list = ov.staff.filter((s) => filter === "all" || s.kind === filter);
  return (
    <View>
      <View style={[e.wrap, { marginTop: 14 }]}>
        <Btn small label="إضافة فرد" icon="person-add-outline" onPress={() => setMode("one")} />
        <Btn small label="لصق قائمة" icon="clipboard-outline" ghost onPress={() => setMode("bulk")} />
      </View>
      <View style={[e.wrap, { marginTop: 10 }]}>
        <Pill label={`الكل ${ov.staff.length}`} on={filter === "all"} onPress={() => setFilter("all")} />
        <Pill label="المعلمون" on={filter === "teacher"} onPress={() => setFilter("teacher")} />
        <Pill label="الموظفون" on={filter === "employee"} onPress={() => setFilter("employee")} />
      </View>
      {!list.length ? <Empty icon="easel-outline" title="لا يوجد طاقم بعد" sub="أضف المعلمين ومواد كل منهم ونصابه الأسبوعي — يستخدمها النظام لمنع التضارب." /> : list.map((s) => {
        const load = s.weekly_load ?? 0; const pct = Math.min(1, load / Math.max(1, s.max_weekly));
        return (
          <Pressable key={s.id} onPress={() => setEdit(s)}>
            <Card style={{ marginTop: 8, opacity: s.active ? 1 : 0.55 }}>
              <View style={[e.rowR, { gap: 8 }]}>
                <Ionicons name={s.kind === "teacher" ? "easel" : "briefcase"} size={18} color={EDU} />
                <View style={{ flex: 1 }}>
                  <Text style={e.t}>{s.name}{s.user_id ? " ✓" : ""}</Text>
                  <Text style={e.muted}>{[s.title, s.subjects.join("، "), s.phone].filter(Boolean).join(" · ") || "—"}</Text>
                </View>
                {s.kind === "teacher" && <Text style={[e.t, { color: load > s.max_weekly ? "#C0392B" : EDU }]}>{load}/{s.max_weekly}</Text>}
              </View>
              {s.kind === "teacher" && <View style={st.track}><View style={[st.fill, { width: `${pct * 100}%`, backgroundColor: load > s.max_weekly ? "#C0392B" : pct > 0.85 ? "#B7791F" : "#0E8A5F" }]} /></View>}
            </Card>
          </Pressable>
        );
      })}
      <Text style={[e.muted, { marginTop: 8 }]}>✓ = مرتبط بحساب في التطبيق (بنفس رقم الهاتف) ويرى جدوله وإشعاراته.</Text>
      {mode === "one" && <StaffSheet subjects={ov.subjects.map((x) => x.name)} onClose={() => setMode(null)} onSave={async (b) => { if (await run(() => eduApi.addStaff(token, wsId, b), "أُضيف")) { setMode(null); reload(); } }} />}
      {edit && <StaffSheet initial={edit} subjects={ov.subjects.map((x) => x.name)} onClose={() => setEdit(null)}
        onSave={async (b) => { if (await run(() => eduApi.editStaff(token, wsId, edit.id, b))) { setEdit(null); reload(); } }}
        onDelete={() => confirmDo("حذف من الطاقم", `سيُحذف ${edit.name} وتُفرَّغ حصصه من الجدول.`, async () => { if (await run(() => eduApi.delStaff(token, wsId, edit.id))) { setEdit(null); reload(); } })} />}
      {mode === "bulk" && <BulkSheet title="لصق قائمة الطاقم" hint={"سطر لكل فرد: الاسم، المواد (افصل بـ /)، الهاتف\nمثال: أحمد علي محمد، رياضيات/فيزياء، 0912345678"}
        onClose={() => setMode(null)} onSave={async (t) => { let n = 0; if (await run(async () => { n = (await eduApi.addStaff(token, wsId, { lines: t })).added; })) { notify("تم", `أُضيف ${n} فرداً`); setMode(null); reload(); } }} />}
    </View>
  );
}

function StaffSheet({ initial, subjects, onClose, onSave, onDelete }: { initial?: Staff; subjects: string[]; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void>; onDelete?: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? "", kind: initial?.kind ?? "teacher", title: initial?.title ?? "", phone: initial?.phone ?? "", max_weekly: String(initial?.max_weekly ?? 24), active: initial?.active ?? true });
  const [subs, setSubs] = useState<string[]>(initial?.subjects ?? []);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (n: string) => setSubs((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n]));
  return (
    <Sheet title={initial ? "تعديل بيانات الفرد" : "إضافة للطاقم"} onClose={onClose}
      footer={<View style={{ gap: 8 }}>
        <Btn label="حفظ" icon="checkmark" busy={busy} disabled={f.name.trim().length < 3} onPress={async () => { setBusy(true); await onSave({ ...f, max_weekly: Number(f.max_weekly) || 24, subjects: [...subs, ...extra.split(/[,،\/]/).map((x) => x.trim()).filter(Boolean)] }); setBusy(false); }} />
        {onDelete && <Btn label="حذف" icon="trash-outline" ghost color="#C0392B" onPress={onDelete} />}
      </View>}>
      <View style={e.wrap}>
        <Pill label="معلم" on={f.kind === "teacher"} onPress={() => setF({ ...f, kind: "teacher" })} />
        <Pill label="موظف إداري" on={f.kind === "employee"} onPress={() => setF({ ...f, kind: "employee" })} />
        {initial && <Pill label={f.active ? "نشط" : "موقوف"} on={f.active} color="#0E8A5F" onPress={() => setF({ ...f, active: !f.active })} />}
      </View>
      <Field label="الاسم الكامل *" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="المسمى" value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="معلم أول، مرشد طلابي، محاسب…" />
      <Field label="الهاتف (لربطه بحسابه)" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} keyboard="phone-pad" />
      {f.kind === "teacher" && (
        <>
          <Field label="النصاب الأسبوعي (حصص)" value={f.max_weekly} onChange={(v) => setF({ ...f, max_weekly: v.replace(/\D/g, "") })} keyboard="number-pad" />
          <Text style={st.label}>المواد</Text>
          <View style={e.wrap}>{subjects.map((n) => <Pill key={n} label={n} on={subs.includes(n)} onPress={() => toggle(n)} color={EDU_GOLD} />)}</View>
          <Field value={extra} onChange={setExtra} placeholder="مواد أخرى مفصولة بفاصلة" />
        </>
      )}
    </Sheet>
  );
}

function BulkSheet({ title, hint, onClose, onSave, children }: { title: string; hint: string; onClose: () => void; onSave: (text: string) => Promise<void>; children?: React.ReactNode }) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={title} sub={hint} onClose={onClose}
      footer={<Btn label={`إضافة ${lines(t).length || ""}`} icon="cloud-upload-outline" busy={busy} disabled={!lines(t).length} onPress={async () => { setBusy(true); await onSave(t); setBusy(false); }} />}>
      {children}
      <TextInput value={t} onChangeText={setT} multiline placeholder="الصق هنا من Excel أو واتساب…" placeholderTextColor={Colors.textMuted} style={[st.input, { minHeight: 180, textAlignVertical: "top", marginTop: 10 }]} />
    </Sheet>
  );
}

// ─── الطلاب ─────────────────────────────────────────────────
function StudentsTab({ ov, token, wsId, reload }: Ctx) {
  const [cls, setCls] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState<Student[] | null>(null);
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<Student | null>(null);
  const load = useCallback(async () => {
    try { setList((await eduApi.students(token, wsId, { class_id: cls ?? undefined, q: q.trim() || undefined })).students); } catch { setList([]); }
  }, [token, wsId, cls, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return (
    <View>
      <View style={[e.wrap, { marginTop: 14 }]}>
        <Btn small label="تسجيل طلاب (لصق)" icon="clipboard-outline" onPress={() => setBulk(true)} />
        {ov.me.perms.includes("transfers") && <Btn small label="النقل" icon="swap-horizontal" ghost onPress={() => router.push({ pathname: "/edu-transfer", params: { ws: String(wsId) } } as any)} />}
      </View>
      <View style={{ marginTop: 10 }}><Field value={q} onChange={setQ} placeholder="ابحث بالاسم أو رقم الطالب أو هاتف ولي الأمر" /></View>
      <ClassPicker ov={ov} value={cls} onChange={setCls} allowAll />
      {list === null ? <ActivityIndicator color={EDU} style={{ marginTop: 20 }} /> : !list.length ? <Empty icon="people-outline" title="لا طلاب" /> : (
        <>
          <Text style={[e.muted, { marginTop: 8 }]}>{list.length} طالب</Text>
          {list.map((s) => (
            <Pressable key={s.id} onPress={() => setEdit(s)}>
              <Card style={{ marginTop: 6, paddingVertical: 10 }}>
                <View style={[e.rowR, { gap: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={e.t}>{s.name}{s.user_id ? " ✓" : ""}</Text>
                    <Text style={e.muted}>{[s.student_no, s.class_name, s.guardian_phone ? `ولي الأمر ${s.guardian_phone}` : null].filter(Boolean).join(" · ")}</Text>
                  </View>
                  {s.status !== "active" && <Text style={st.chip}>{({ graduated: "متخرج", withdrawn: "منسحب", transferred: "منقول" } as Record<string, string>)[s.status] ?? s.status}</Text>}
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      )}
      {bulk && <StudentBulk ov={ov} defaultClass={cls} onClose={() => setBulk(false)} onSave={async (text, classId) => {
        await run(async () => {
          const r = await eduApi.addStudents(token, wsId, { lines: text, class_id: classId });
          notify("تسجيل الطلاب", `أُضيف ${r.added} طالباً${r.skipped.length ? `\n\nلم يُضف:\n${r.skipped.slice(0, 10).join("\n")}` : ""}`);
          setBulk(false); load(); reload();
        });
      }} />}
      {edit && <StudentSheet ov={ov} s={edit} onClose={() => setEdit(null)} onSave={async (b) => { if (await run(() => eduApi.editStudent(token, wsId, edit.id, b))) { setEdit(null); load(); reload(); } }} />}
    </View>
  );
}

function StudentBulk({ ov, defaultClass, onClose, onSave }: { ov: Overview; defaultClass: number | null; onClose: () => void; onSave: (t: string, c: number | null) => Promise<void> }) {
  const [c, setC] = useState<number | null>(defaultClass);
  return (
    <BulkSheet title="تسجيل طلاب" hint={"سطر لكل طالب: الاسم الثلاثي، هاتف ولي الأمر، رقم الطالب (اختياري)\nأولياء الأمور المسجلون في التطبيق يُربطون تلقائياً."} onClose={onClose} onSave={(t) => onSave(t, c)}>
      <Text style={st.label}>الفصل</Text>
      <ClassPicker ov={ov} value={c} onChange={setC} />
    </BulkSheet>
  );
}

function StudentSheet({ ov, s, onClose, onSave }: { ov: Overview; s: Student; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const [f, setF] = useState({ name: s.name, student_no: s.student_no ?? "", program: s.program ?? "", guardian_name: s.guardian_name ?? "", guardian_phone: s.guardian_phone ?? "", status: s.status });
  const [c, setC] = useState<number | null>(s.class_id);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={s.name} sub={s.student_no ?? undefined} onClose={onClose}
      footer={<Btn label="حفظ" icon="checkmark" busy={busy} onPress={async () => { setBusy(true); await onSave({ ...f, class_id: c }); setBusy(false); }} />}>
      <Field label="الاسم" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="رقم الطالب" value={f.student_no} onChange={(v) => setF({ ...f, student_no: v })} />
      <Text style={st.label}>الفصل</Text>
      <ClassPicker ov={ov} value={c} onChange={setC} />
      <Field label="البرنامج / التخصص" value={f.program} onChange={(v) => setF({ ...f, program: v })} />
      <Field label="اسم ولي الأمر" value={f.guardian_name} onChange={(v) => setF({ ...f, guardian_name: v })} />
      <Field label="هاتف ولي الأمر" value={f.guardian_phone} onChange={(v) => setF({ ...f, guardian_phone: v })} keyboard="phone-pad" />
      <Text style={st.label}>الحالة</Text>
      <View style={e.wrap}>{[["active", "منتظم"], ["graduated", "متخرج"], ["withdrawn", "منسحب"]].map(([k, l]) => <Pill key={k} label={l} on={f.status === k} onPress={() => setF({ ...f, status: k })} />)}</View>
    </Sheet>
  );
}

function ClassPicker({ ov, value, onChange, allowAll }: { ov: Overview; value: number | null; onChange: (v: number | null) => void; allowAll?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
      {allowAll && <View style={{ transform: [{ scaleX: -1 }] }}><Pill label="كل الفصول" on={value === null} onPress={() => onChange(null)} color={EDU_GOLD} /></View>}
      {ov.classes.map((c) => <View key={c.id} style={{ transform: [{ scaleX: -1 }] }}><Pill label={`${c.name}${c.students !== undefined ? ` · ${c.students}` : ""}`} on={value === c.id} onPress={() => onChange(c.id)} color={EDU_GOLD} /></View>)}
    </ScrollView>
  );
}

// ─── الفصول والمواد ─────────────────────────────────────────
function ClassesTab({ ov, token, wsId, reload }: Ctx) {
  const [classes, setClasses] = useState("");
  const [level, setLevel] = useState("");
  const [subjects, setSubjects] = useState("");
  const [edit, setEdit] = useState<Overview["classes"][number] | null>(null);
  return (
    <View>
      <H>الفصول</H>
      <Card>
        <Field label="أضف فصولاً (سطر أو فاصلة لكل فصل)" value={classes} onChange={setClasses} placeholder="الأول أ، الأول ب، الثاني أ" multiline />
        <Field label="المرحلة/المستوى (اختياري)" value={level} onChange={setLevel} placeholder="الصف الأول" />
        <View style={{ marginTop: 10 }}><Btn small label="إضافة الفصول" icon="add" disabled={!classes.trim()} onPress={async () => {
          const names = classes.split(/[\n,،]/).map((x) => x.trim()).filter(Boolean);
          if (await run(() => eduApi.addClasses(token, wsId, { names, level }))) { setClasses(""); reload(); }
        }} /></View>
      </Card>
      {ov.classes.map((c) => (
        <Pressable key={c.id} onPress={() => setEdit(c)}>
          <Card style={{ marginTop: 6, paddingVertical: 10 }}>
            <View style={[e.rowR, { gap: 8 }]}>
              <Ionicons name="grid" size={16} color={EDU} />
              <View style={{ flex: 1 }}>
                <Text style={e.t}>{c.name}</Text>
                <Text style={e.muted}>{[c.level, c.room ? `قاعة ${c.room}` : null, `${c.students ?? 0} طالب`, `${c.slots ?? 0} حصة`, c.homeroom_teacher_id ? `رائد: ${ov.staff.find((s) => s.id === c.homeroom_teacher_id)?.name ?? ""}` : null].filter(Boolean).join(" · ")}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="التاريخ" onPress={() => router.push({ pathname: "/edu-timetable", params: { id: String(wsId), class_id: String(c.id) } } as any)} hitSlop={8}><Ionicons name="calendar-outline" size={20} color={EDU_GOLD} /></Pressable>
            </View>
          </Card>
        </Pressable>
      ))}
      <H>المواد</H>
      <Card>
        <View style={e.wrap}>
          {ov.subjects.map((s) => (
            <Pressable key={s.id} onLongPress={() => confirmDo("حذف المادة", `حذف «${s.name}» وكل حصصها؟`, async () => { if (await run(() => eduApi.delSubject(token, wsId, s.id))) reload(); })}
              style={[st.subj, { borderColor: s.color + "88", backgroundColor: s.color + "14" }]}>
              <Text style={[st.subjT, { color: s.color }]}>{s.name}</Text>
            </Pressable>
          ))}
          {!ov.subjects.length && <Text style={e.muted}>لا مواد بعد</Text>}
        </View>
        <Field label="أضف مواد" value={subjects} onChange={setSubjects} placeholder="رياضيات، لغة عربية، إنجليزي، علوم، تربية إسلامية" />
        <View style={[e.wrap, { marginTop: 8 }]}>
          <Btn small label="إضافة" icon="add" disabled={!subjects.trim()} onPress={async () => { if (await run(() => eduApi.addSubjects(token, wsId, subjects.split(/[\n,،]/).map((x) => x.trim()).filter(Boolean)))) { setSubjects(""); reload(); } }} />
          {!ov.subjects.length && <Btn small ghost label="مواد المرحلة الثانوية" icon="sparkles-outline" onPress={() => setSubjects("لغة عربية، رياضيات، لغة إنجليزية، تربية إسلامية، فيزياء، كيمياء، أحياء، جغرافيا، تاريخ، حاسوب")} />}
        </View>
        <Text style={[e.muted, { marginTop: 6 }]}>اضغط مطوّلاً على مادة لحذفها.</Text>
      </Card>
      {edit && <ClassSheet ov={ov} c={edit} onClose={() => setEdit(null)}
        onSave={async (b) => { if (await run(() => eduApi.editClass(token, wsId, edit.id, b))) { setEdit(null); reload(); } }}
        onDelete={() => confirmDo("حذف الفصل", `حذف ${edit.name} وجدوله؟ يبقى الطلاب بلا فصل.`, async () => { if (await run(() => eduApi.delClass(token, wsId, edit.id))) { setEdit(null); reload(); } })} />}
    </View>
  );
}

function ClassSheet({ ov, c, onClose, onSave, onDelete }: { ov: Overview; c: Overview["classes"][number]; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void>; onDelete: () => void }) {
  const [f, setF] = useState({ name: c.name, level: c.level ?? "", section: c.section ?? "", room: c.room ?? "" });
  const [hr, setHr] = useState<number | null>(c.homeroom_teacher_id);
  return (
    <Sheet title={c.name} onClose={onClose} footer={<View style={{ gap: 8 }}><Btn label="حفظ" icon="checkmark" onPress={() => onSave({ ...f, homeroom_teacher_id: hr })} /><Btn label="حذف الفصل" ghost color="#C0392B" icon="trash-outline" onPress={onDelete} /></View>}>
      <Field label="الاسم" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Field label="المستوى" value={f.level} onChange={(v) => setF({ ...f, level: v })} />
      <Field label="الشعبة" value={f.section} onChange={(v) => setF({ ...f, section: v })} />
      <Field label="القاعة الافتراضية" value={f.room} onChange={(v) => setF({ ...f, room: v })} placeholder="تُستخدم لمنع حجز القاعة مرتين" />
      <Text style={st.label}>رائد الفصل</Text>
      <View style={e.wrap}>{ov.staff.filter((s) => s.kind === "teacher").map((s) => <Pill key={s.id} label={s.name} on={hr === s.id} onPress={() => setHr(hr === s.id ? null : s.id)} color={EDU_GOLD} />)}</View>
    </Sheet>
  );
}

// ─── الإعلانات ──────────────────────────────────────────────
const AUD: [string, string][] = [["all", "للجميع"], ["students", "الطلاب"], ["parents", "أولياء الأمور"], ["teachers", "المعلمون"]];
function NewsTab({ ov, token, wsId }: Ctx) {
  const [list, setList] = useState<Announcement[]>([]);
  const [f, setF] = useState({ title: "", body: "", audience: "all", pinned: false });
  const [cls, setCls] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { eduApi.announcements(token, wsId).then((r) => setList(r.announcements)).catch(() => {}); }, [token, wsId]);
  useEffect(load, [load]);
  return (
    <View>
      <H>إعلان جديد</H>
      <Card>
        <View style={e.wrap}>{AUD.map(([k, l]) => <Pill key={k} label={l} on={f.audience === k} onPress={() => setF({ ...f, audience: k })} />)}</View>
        {f.audience !== "teachers" && <><Text style={st.label}>لفصل محدد؟</Text><ClassPicker ov={ov} value={cls} onChange={setCls} allowAll /></>}
        <Field label="العنوان" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
        <Field label="النص" value={f.body} onChange={(v) => setF({ ...f, body: v })} multiline />
        <View style={[e.wrap, { marginTop: 10 }]}>
          <Pill label="تثبيت" icon="pin-outline" on={f.pinned} onPress={() => setF({ ...f, pinned: !f.pinned })} color={EDU_GOLD} />
          <Btn small label="نشر وإشعار" icon="send" busy={busy} onPress={async () => {
            setBusy(true);
            await run(async () => { const r = await eduApi.announce(token, wsId, { ...f, class_id: cls }); notify("نُشر الإعلان", `وصل إشعار إلى ${r.notified} مستخدماً`); setF({ title: "", body: "", audience: "all", pinned: false }); load(); });
            setBusy(false);
          }} />
        </View>
      </Card>
      <H>المنشور</H>
      {!list.length ? <Empty icon="megaphone-outline" title="لا إعلانات" /> : list.map((a) => (
        <Card key={a.id} style={{ marginTop: 6 }}>
          <View style={[e.rowR, { gap: 6 }]}>
            {a.pinned && <Ionicons name="pin" size={14} color={EDU_GOLD} />}
            <Text style={[e.t, { flex: 1 }]}>{a.title}</Text>
            <Text style={st.chip}>{AUD.find(([k]) => k === a.audience)?.[1]}{a.class_id ? ` · ${ov.classes.find((c) => c.id === a.class_id)?.name ?? ""}` : ""}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="حذف" hitSlop={8} onPress={() => confirmDo("حذف الإعلان", a.title, async () => { if (await run(() => eduApi.delAnnouncement(token, wsId, a.id))) load(); })}><Ionicons name="trash-outline" size={18} color="#C0392B" /></Pressable>
          </View>
          <Text style={[e.body, { marginTop: 4 }]} numberOfLines={4}>{a.body}</Text>
        </Card>
      ))}
    </View>
  );
}

// ─── طلبات الطلاب ───────────────────────────────────────────
function RequestsTab({ token, wsId, reload }: Ctx) {
  const [list, setList] = useState<EduRequest[] | null>(null);
  const [filter, setFilter] = useState("pending");
  const [answer, setAnswer] = useState<{ r: EduRequest; status: string } | null>(null);
  const load = useCallback(() => { eduApi.requests(token, wsId).then((r) => setList(r.requests)).catch(() => setList([])); }, [token, wsId]);
  useEffect(load, [load]);
  const shown = (list ?? []).filter((r) => filter === "all" || r.status === filter);
  return (
    <View>
      <View style={[e.wrap, { marginTop: 14 }]}>
        {[["pending", "قيد المراجعة"], ["approved", "مقبول"], ["ready", "جاهز"], ["rejected", "مرفوض"], ["all", "الكل"]].map(([k, l]) => <Pill key={k} label={`${l}${k !== "all" ? ` ${(list ?? []).filter((r) => r.status === k).length}` : ""}`} on={filter === k} onPress={() => setFilter(k)} />)}
      </View>
      {list === null ? <ActivityIndicator color={EDU} style={{ marginTop: 20 }} /> : !shown.length ? <Empty icon="document-text-outline" title="لا طلبات" /> : shown.map((r) => {
        const rs = REQ_STATUS[r.status] ?? { l: r.status, c: Colors.textMuted };
        return (
          <Card key={r.id} style={{ marginTop: 8 }}>
            <View style={[e.rowR, { gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={e.t}>{r.kind_label ?? r.kind} — {r.student_name}</Text>
                <Text style={e.muted}>{[r.student_no, r.class_name, new Date(r.created_at).toLocaleDateString("ar-EG")].filter(Boolean).join(" · ")}</Text>
              </View>
              <Text style={[st.chip, { color: rs.c, borderColor: rs.c + "55" }]}>{rs.l}</Text>
            </View>
            {!!r.note && <Text style={[e.body, { marginTop: 4 }]}>{r.note}</Text>}
            {!!r.response && <Text style={[e.muted, { marginTop: 4 }]}>الرد: {r.response}</Text>}
            {r.status !== "ready" && r.status !== "rejected" && (
              <View style={[e.wrap, { marginTop: 8 }]}>
                {r.status === "pending" && <Btn small label="قبول" icon="checkmark" color="#0E8A5F" onPress={() => setAnswer({ r, status: "approved" })} />}
                <Btn small label="جاهز للاستلام" icon="cube-outline" color="#2B6CB0" onPress={() => setAnswer({ r, status: "ready" })} />
                {r.status === "pending" && <Btn small label="رفض" icon="close" ghost color="#C0392B" onPress={() => setAnswer({ r, status: "rejected" })} />}
              </View>
            )}
          </Card>
        );
      })}
      {answer && <NoteSheet title={`${REQ_STATUS[answer.status]?.l} — ${answer.r.student_name}`} placeholder={answer.status === "ready" ? "مثال: تُستلم من مكتب المسجّل الأحد ٨ص" : "ملاحظة للطالب/ولي الأمر"}
        onClose={() => setAnswer(null)} onSave={async (note) => { if (await run(() => eduApi.answerRequest(token, wsId, answer.r.id, answer.status, note))) { setAnswer(null); load(); reload(); } }} />}
    </View>
  );
}

function NoteSheet({ title, placeholder, onClose, onSave }: { title: string; placeholder?: string; onClose: () => void; onSave: (n: string) => Promise<void> }) {
  const [n, setN] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={title} onClose={onClose} footer={<Btn label="تأكيد" icon="checkmark" busy={busy} onPress={async () => { setBusy(true); await onSave(n.trim()); setBusy(false); }} />}>
      <Field value={n} onChange={setN} multiline placeholder={placeholder} />
    </Sheet>
  );
}

// ─── الدرجات والحضور ────────────────────────────────────────
function GradesTab({ ov, token, wsId }: Ctx) {
  const [mode, setMode] = useState<"grades" | "attendance">("grades");
  const [cls, setCls] = useState<number | null>(ov.classes[0]?.id ?? null);
  const [subj, setSubj] = useState<number | null>(ov.subjects[0]?.id ?? null);
  const [term, setTerm] = useState(ov.institution.settings.current_term);
  const [rows, setRows] = useState<{ student_id: number; name: string; score: string; note: string }[]>([]);
  const [att, setAtt] = useState<Record<number, string>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const max = ov.institution.settings.max_score;
  useEffect(() => {
    if (!cls) return;
    if (mode === "grades" && subj) eduApi.grades(token, wsId, cls, subj, term).then((r) => setRows(r.rows.map((x) => ({ student_id: x.student_id, name: x.name, score: x.score ?? "", note: x.note ?? "" })))).catch((x) => { setRows([]); notify("تنبيه", x?.message); });
    if (mode === "attendance") eduApi.students(token, wsId, { class_id: cls }).then((r) => { setStudents(r.students.filter((s) => s.status === "active")); setAtt({}); }).catch(() => setStudents([]));
  }, [mode, cls, subj, term, token, wsId]);
  const ATT: [string, string, string][] = [["present", "ح", "#0E8A5F"], ["late", "ت", "#B7791F"], ["absent", "غ", "#C0392B"], ["excused", "ع", "#2B6CB0"]];
  return (
    <View>
      <View style={[e.wrap, { marginTop: 14 }]}>
        <Pill label="رصد الدرجات" icon="stats-chart-outline" on={mode === "grades"} onPress={() => setMode("grades")} />
        <Pill label="الحضور اليومي" icon="checkmark-done-outline" on={mode === "attendance"} onPress={() => setMode("attendance")} />
      </View>
      <ClassPicker ov={ov} value={cls} onChange={setCls} />
      {mode === "grades" && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
            {ov.subjects.map((s) => <View key={s.id} style={{ transform: [{ scaleX: -1 }] }}><Pill label={s.name} on={subj === s.id} onPress={() => setSubj(s.id)} color={s.color} /></View>)}
          </ScrollView>
          <View style={[e.wrap, { marginTop: 8 }]}>{ov.institution.settings.terms.map((t) => <Pill key={t} label={t} on={term === t} onPress={() => setTerm(t)} />)}</View>
          {!rows.length ? <Empty icon="people-outline" title="لا طلاب في هذا الفصل" /> : (
            <Card style={{ marginTop: 10, paddingVertical: 4 }}>
              {rows.map((r, i) => (
                <View key={r.student_id} style={[e.rowR, st.gRow]}>
                  <Text style={[e.t, { flex: 1 }]} numberOfLines={1}>{r.name}</Text>
                  <TextInput value={r.score} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={Colors.textMuted}
                    onChangeText={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, score: v.replace(/[^\d.]/g, "") } : y)))}
                    style={[st.input, st.score, Number(r.score) > max && { borderColor: "#C0392B" }]} />
                  <Text style={e.muted}>/{max}</Text>
                </View>
              ))}
            </Card>
          )}
          {!!rows.length && cls && subj && <View style={{ marginTop: 10 }}><Btn label="حفظ الدرجات" icon="save-outline" busy={busy} onPress={async () => {
            setBusy(true);
            await run(async () => { const r = await eduApi.saveGrades(token, wsId, { class_id: cls, subject_id: subj, term, rows: rows.map((x) => ({ student_id: x.student_id, score: x.score === "" ? null : Number(x.score), note: x.note })) }); notify("تم", `حُفظت ${r.saved} درجة — تظهر فوراً في بوابة الطالب`); });
            setBusy(false);
          }} /></View>}
        </>
      )}
      {mode === "attendance" && (
        <>
          <Text style={[e.muted, { marginTop: 8 }]}>اليوم {new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })} — الافتراضي «حاضر». ح حاضر · ت متأخر · غ غائب · ع بعذر</Text>
          {!students.length ? <Empty icon="people-outline" title="لا طلاب" /> : (
            <Card style={{ marginTop: 8, paddingVertical: 4 }}>
              {students.map((s) => (
                <View key={s.id} style={[e.rowR, st.gRow]}>
                  <Text style={[e.t, { flex: 1 }]} numberOfLines={1}>{s.name}</Text>
                  {ATT.map(([k, l, c]) => {
                    const on = (att[s.id] ?? "present") === k;
                    return <Pressable key={k} onPress={() => setAtt((x) => ({ ...x, [s.id]: k }))} style={[st.attB, on && { backgroundColor: c, borderColor: c }]}><Text style={[st.attT, on && { color: "#fff" }]}>{l}</Text></Pressable>;
                  })}
                </View>
              ))}
            </Card>
          )}
          {!!students.length && cls && <View style={{ marginTop: 10 }}><Btn label="حفظ الحضور" icon="save-outline" busy={busy} onPress={async () => {
            setBusy(true);
            await run(async () => { const r = await eduApi.attendance(token, wsId, { class_id: cls, date: new Date().toISOString().slice(0, 10), records: students.map((s) => ({ student_id: s.id, status: att[s.id] ?? "present" })) }); notify("تم", `سُجّل حضور ${r.saved} طالباً`); });
            setBusy(false);
          }} /></View>}
        </>
      )}
    </View>
  );
}

// ─── المدراء والصلاحيات ─────────────────────────────────────
function AdminsTab({ ov, token, wsId, reload }: Ctx) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [pick, setPick] = useState<{ id: number; name: string; role: string; perms: string[] } | null>(null);
  useEffect(() => { if (q.trim().length < 2) return setFound([]); const t = setTimeout(() => eduApi.lookup(token, q.trim()).then((r) => setFound(r.users)).catch(() => {}), 300); return () => clearTimeout(t); }, [q, token]);
  return (
    <View>
      <H>فريق الإدارة</H>
      {ov.admins.map((a) => (
        <Card key={a.user_id} style={{ marginTop: 6 }}>
          <Pressable onPress={() => a.role !== "owner" && setPick({ id: a.user_id, name: a.name, role: a.role, perms: a.perms })} style={[e.rowR, { gap: 8 }]}>
            <Ionicons name={a.role === "owner" ? "star" : "shield-checkmark"} size={18} color={a.role === "owner" ? EDU_GOLD : EDU} />
            <View style={{ flex: 1 }}>
              <Text style={e.t}>{a.name} · {ROLE_AR[a.role] ?? a.role}</Text>
              <Text style={e.muted} numberOfLines={2}>{a.perms.map((x) => PERM_AR[x] ?? x).join("، ")}</Text>
            </View>
            {a.role !== "owner" && <Ionicons name="create-outline" size={18} color={Colors.textMuted} />}
          </Pressable>
        </Card>
      ))}
      <H>إضافة مدير</H>
      <Field value={q} onChange={setQ} placeholder="ابحث باسم المستخدم أو هاتفه" />
      {found.map((u) => (
        <Pressable key={u.id} onPress={() => setPick({ id: u.id, name: u.name, role: "vice", perms: [] })} style={[e.rowR, st.lookRow]}>
          <Ionicons name="person-circle-outline" size={22} color={EDU} /><Text style={[e.t, { flex: 1 }]}>{u.name}</Text><Ionicons name="add-circle" size={20} color={EDU} />
        </Pressable>
      ))}
      {pick && <AdminSheet ov={ov} pick={pick} onClose={() => setPick(null)}
        onSave={async (role, perms) => { if (await run(() => eduApi.setAdmin(token, wsId, pick.id, role, perms), "حُفظت الصلاحيات")) { setPick(null); setQ(""); reload(); } }}
        onRemove={ov.admins.some((a) => a.user_id === pick.id) ? () => confirmDo("إزالة من الإدارة", pick.name, async () => { if (await run(() => eduApi.delAdmin(token, wsId, pick.id))) { setPick(null); reload(); } }) : undefined} />}
    </View>
  );
}

const ROLE_DEFAULTS: Record<string, string[]> = {
  principal: ["staff", "students", "timetable", "announcements", "grades", "requests", "transfers", "settings", "admins"],
  vice: ["staff", "students", "timetable", "announcements", "grades", "requests"],
  registrar: ["students", "requests", "transfers", "grades"],
};
function AdminSheet({ ov, pick, onClose, onSave, onRemove }: { ov: Overview; pick: { name: string; role: string; perms: string[] }; onClose: () => void; onSave: (r: string, p: string[]) => Promise<void>; onRemove?: () => void }) {
  const [role, setRole] = useState(pick.role === "owner" ? "principal" : pick.role);
  const [perms, setPerms] = useState<string[]>(pick.perms.length ? pick.perms : ROLE_DEFAULTS[role] ?? []);
  const roles = ov.roles.filter((r) => r !== "owner");
  return (
    <Sheet title={pick.name} sub="اختر الدور ثم عدّل الصلاحيات حسب الحاجة." onClose={onClose}
      footer={<View style={{ gap: 8 }}><Btn label="حفظ" icon="checkmark" onPress={() => onSave(role, perms)} />{onRemove && <Btn label="إزالة من الإدارة" ghost color="#C0392B" icon="person-remove-outline" onPress={onRemove} />}</View>}>
      <Text style={st.label}>الدور</Text>
      <View style={e.wrap}>{roles.map((r) => <Pill key={r} label={ROLE_AR[r] ?? r} on={role === r} onPress={() => { setRole(r); setPerms(ROLE_DEFAULTS[r] ?? []); }} />)}</View>
      <Text style={st.label}>الصلاحيات</Text>
      <View style={e.wrap}>{ov.all_perms.map((p) => <Pill key={p} label={PERM_AR[p] ?? p} on={perms.includes(p)} color={EDU_GOLD} onPress={() => setPerms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} />)}</View>
    </Sheet>
  );
}

// ─── الإعدادات ──────────────────────────────────────────────
function SettingsTab({ ov, token, wsId, reload }: Ctx) {
  const w = ov.institution;
  const s0 = w.settings;
  const [s, setS] = useState<Settings>(s0);
  const [info, setInfo] = useState({ name: w.name, stage: w.stage ?? "", city: w.city ?? "", address: w.address ?? "", phone: w.phone ?? "", email: w.email ?? "", description: w.description ?? "", logo_url: w.logo_url ?? "" });
  const [terms, setTerms] = useState(s0.terms.join("، "));
  const [busy, setBusy] = useState(false);
  const shrinks = useMemo(() => s.periods < s0.periods || s0.days.some((d) => !s.days.includes(d)), [s, s0]);
  const num = (k: keyof Settings) => (v: string) => setS((x) => ({ ...x, [k]: Number(v.replace(/\D/g, "")) || 0 }));
  const save = async () => {
    const go = async () => {
      setBusy(true);
      const termList = terms.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
      await run(() => eduApi.saveSettings(token, wsId, { ...info, ...s, terms: termList, current_term: termList.includes(s.current_term) ? s.current_term : termList[0] }), "حُفظت الإعدادات");
      setBusy(false); reload();
    };
    if (shrinks) confirmDo("تقليص الأيام/الحصص", "ستُحذف الحصص الواقعة خارج الأيام أو الحصص الجديدة من كل الجداول.", go); else go();
  };
  return (
    <View>
      <H>بيانات المؤسسة</H>
      <Card>
        <Field label="الاسم" value={info.name} onChange={(v) => setInfo({ ...info, name: v })} />
        <Field label="المرحلة" value={info.stage} onChange={(v) => setInfo({ ...info, stage: v })} />
        <Field label="الهاتف" value={info.phone} onChange={(v) => setInfo({ ...info, phone: v })} keyboard="phone-pad" />
        <Field label="البريد" value={info.email} onChange={(v) => setInfo({ ...info, email: v })} keyboard="email-address" />
        <Field label="المدينة" value={info.city} onChange={(v) => setInfo({ ...info, city: v })} />
        <Field label="العنوان" value={info.address} onChange={(v) => setInfo({ ...info, address: v })} />
        <Field label="رابط الشعار" value={info.logo_url} onChange={(v) => setInfo({ ...info, logo_url: v })} placeholder="https://…" />
        <Field label="نبذة" value={info.description} onChange={(v) => setInfo({ ...info, description: v })} multiline />
      </Card>
      <H>اليوم الدراسي</H>
      <Card>
        <Text style={st.label}>أيام الدراسة</Text>
        <View style={e.wrap}>{DAY_AR.map((d, i) => <Pill key={i} label={d} on={s.days.includes(i)} onPress={() => setS((x) => ({ ...x, days: x.days.includes(i) ? x.days.filter((y) => y !== i) : [...x.days, i].sort() }))} />)}</View>
        <View style={[e.rowR, { gap: 8 }]}>
          <View style={{ flex: 1 }}><Field label="عدد الحصص" value={String(s.periods)} onChange={num("periods")} keyboard="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="مدة الحصة (د)" value={String(s.period_minutes)} onChange={num("period_minutes")} keyboard="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="البداية" value={s.start_time} onChange={(v) => setS({ ...s, start_time: v })} placeholder="07:30" /></View>
        </View>
        <Text style={st.label}>الاستراحات</Text>
        {s.breaks.map((b, i) => (
          <View key={i} style={[e.rowR, { gap: 6, marginBottom: 6 }]}>
            <Text style={e.muted}>بعد الحصة</Text>
            <TextInput value={String(b.after)} keyboardType="number-pad" onChangeText={(v) => setS({ ...s, breaks: s.breaks.map((x, j) => (j === i ? { ...x, after: Number(v) || 1 } : x)) })} style={[st.input, st.small]} />
            <TextInput value={String(b.minutes)} keyboardType="number-pad" onChangeText={(v) => setS({ ...s, breaks: s.breaks.map((x, j) => (j === i ? { ...x, minutes: Number(v) || 5 } : x)) })} style={[st.input, st.small]} />
            <Text style={e.muted}>دقيقة</Text>
            <TextInput value={b.label} onChangeText={(v) => setS({ ...s, breaks: s.breaks.map((x, j) => (j === i ? { ...x, label: v } : x)) })} style={[st.input, { flex: 1 }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={() => setS({ ...s, breaks: s.breaks.filter((_, j) => j !== i) })} hitSlop={8}><Ionicons name="close-circle" size={20} color="#C0392B" /></Pressable>
          </View>
        ))}
        {s.breaks.length < 4 && <Btn small ghost label="استراحة" icon="add" onPress={() => setS({ ...s, breaks: [...s.breaks, { after: Math.min(s.periods - 1, 3), minutes: 30, label: "فسحة" }] })} />}
      </Card>
      <H>العام الدراسي</H>
      <Card>
        <Field label="العام" value={s.academic_year} onChange={(v) => setS({ ...s, academic_year: v })} placeholder="2026/2027" />
        <Field label="الفصول الدراسية (مفصولة بفاصلة)" value={terms} onChange={setTerms} />
        <Text style={st.label}>الفصل الحالي</Text>
        <View style={e.wrap}>{terms.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).map((t) => <Pill key={t} label={t} on={s.current_term === t} onPress={() => setS({ ...s, current_term: t })} color={EDU_GOLD} />)}</View>
        <Field label="الدرجة العظمى" value={String(s.max_score)} onChange={num("max_score")} keyboard="number-pad" />
      </Card>
      <View style={{ marginTop: 14 }}><Btn label="حفظ الإعدادات" icon="save-outline" busy={busy} onPress={save} /></View>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  heroBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  warn: { marginTop: 6, borderColor: "#B7791F66", backgroundColor: "#B7791F0D" },
  track: { height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginTop: 8, overflow: "hidden", flexDirection: "row-reverse" },
  fill: { height: 5, borderRadius: 3 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  small: { width: 54, textAlign: "center" },
  score: { width: 70, textAlign: "center", paddingVertical: 6 },
  chip: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: EDU, borderWidth: 1, borderColor: EDU + "44", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8 },
  subj: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  subjT: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  gRow: { gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  attB: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  attT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  lookRow: { gap: 8, padding: 10, marginTop: 6, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
});
