// بوابة المؤسسات التعليمية:
//  • بلا معاملات: دليل المدارس والجامعات المنضمة + «تعليمي» (إداراتي، تدريسي، أبنائي) + طلب انضمام مؤسسة.
//  • ?id=   صفحة المؤسسة العامة (إحصاءات، إعلانات، روابط الإدارة/الجدول).
//  • ?student=  بوابة الطالب/ولي الأمر: الجدول، الإعلانات، الدرجات، الحضور، طلب الشهادات، والنقل.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import {
  eduApi, EDU, EDU_GOLD, KIND_AR, ROLE_AR, REQ_KINDS, REQ_STATUS, TR_COLOR,
  type Institution, type MyEdu, type Portal, type Announcement,
} from "@/lib/edu-inst";
import { Hero, Card, H, Pill, Btn, Field, Empty, Stat, TimetableGrid, eduStyles as e } from "@/components/edu-inst/ui";
import { Sheet } from "@/components/edu-inst/sheet";

export default function EduInstitutionScreen() {
  const p = useLocalSearchParams<{ id?: string; student?: string }>();
  if (p.student) return <StudentPortal sid={Number(p.student)} />;
  if (p.id) return <InstitutionPage id={Number(p.id)} />;
  return <Directory />;
}

// ─── الدليل + تعليمي ─────────────────────────────────────────
function Directory() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [list, setList] = useState<Institution[] | null>(null);
  const [mine, setMine] = useState<MyEdu | null>(null);
  const [reg, setReg] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setList((await eduApi.list(q.trim() || undefined, kind || undefined)).institutions); } catch { setList([]); }
    if (token) eduApi.me(token).then(setMine).catch(() => {});
  }, [q, kind, token]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useFocusEffect(useCallback(() => { if (token) eduApi.me(token).then(setMine).catch(() => {}); }, [token]));

  const hasMine = !!mine && (mine.admin.length + mine.teaching.length + mine.students.length > 0);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Hero insetTop={insets.top} kicker="بيئة تعليمية متكاملة" title="المدارس والجامعات" sub="جداول بلا تضارب، بوابة للطالب وولي الأمر، طلبات الشهادات، والنقل بين المدارس المنضمة بخطوات واضحة." />
        <View style={{ paddingHorizontal: 16 }}>
          {hasMine && mine && (
            <>
              <H>تعليمي</H>
              {mine.students.map((s) => (
                <Row key={`s${s.id}`} icon={s.relation === "guardian" ? "people" : "person"} color={EDU_GOLD}
                  title={s.name} sub={`${s.ws_name}${s.class_name ? ` · ${s.class_name}` : ""}${s.relation === "guardian" ? " · ولي الأمر" : ""}`}
                  onPress={() => router.push({ pathname: "/edu-institution", params: { student: String(s.id) } } as any)} />
              ))}
              {mine.admin.map((w) => (
                <Row key={`a${w.id}`} icon="shield-checkmark" title={w.name} sub={`${ROLE_AR[w.role || ""] ?? "إدارة"} · ${statusLabel(w.status)}`}
                  badge={w.status !== "active" ? statusLabel(w.status) : undefined}
                  onPress={() => router.push({ pathname: "/edu-admin", params: { id: String(w.id) } } as any)} />
              ))}
              {mine.teaching.map((w) => (
                <Row key={`t${w.id}`} icon="easel" title={w.name} sub="جدولي الأسبوعي كمعلم"
                  onPress={() => router.push({ pathname: "/edu-timetable", params: { id: String(w.id), teacher_id: String(w.staff_id ?? "") } } as any)} />
              ))}
            </>
          )}

          <Card style={{ marginTop: 16, borderColor: EDU_GOLD + "66" }}>
            <View style={[e.rowR, { gap: 10 }]}>
              <View style={[st.ico, { backgroundColor: EDU + "18" }]}><Ionicons name="business" size={20} color={EDU} /></View>
              <View style={{ flex: 1 }}>
                <Text style={e.t}>هل تدير مدرسة أو جامعة؟</Text>
                <Text style={e.muted}>انضم بمؤسستك واحصل على لوحة إدارة كاملة: الطاقم، الطلاب، الجداول، الإعلانات والنقل.</Text>
              </View>
            </View>
            <View style={{ marginTop: 10 }}><Btn label="طلب انضمام مؤسسة" icon="add-circle-outline" onPress={() => (token ? setReg(true) : router.push("/login" as any))} /></View>
          </Card>

          <H>دليل المؤسسات</H>
          <Field value={q} onChange={setQ} placeholder="ابحث بالاسم أو المدينة…" />
          <View style={[e.wrap, { marginTop: 10 }]}>
            {[["", "الكل"], ["school", "مدارس"], ["university", "جامعات"], ["institute", "معاهد"]].map(([k, l]) => <Pill key={k} label={l} on={kind === k} onPress={() => setKind(k)} />)}
          </View>
          {list === null ? <ActivityIndicator color={EDU} style={{ marginTop: 24 }} /> : !list.length ? (
            <Empty title="لا توجد نتائج" sub="جرّب بحثاً آخر، أو اطلب انضمام مؤسستك." />
          ) : list.map((w) => (
            <Row key={w.id} icon={w.kind === "university" ? "library" : "school"} title={w.name}
              sub={[KIND_AR[w.kind], w.stage, w.city].filter(Boolean).join(" · ") + (w.students ? ` · ${w.students} طالب` : "")}
              onPress={() => router.push({ pathname: "/edu-institution", params: { id: String(w.id) } } as any)} />
          ))}
        </View>
      </ScrollView>
      {reg && token && <RegisterSheet token={token} onClose={() => setReg(false)} onDone={() => { setReg(false); load(); }} />}
    </View>
  );
}

function statusLabel(s: string) { return ({ pending: "بانتظار الموافقة", active: "مفعّلة", rejected: "مرفوضة", suspended: "موقوفة" } as Record<string, string>)[s] ?? s; }

function Row({ icon, title, sub, onPress, color = EDU, badge }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; onPress: () => void; color?: string; badge?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[st.ico, { backgroundColor: color + "18" }]}><Ionicons name={icon} size={20} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={e.t} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={e.muted} numberOfLines={1}>{sub}</Text>}
      </View>
      {!!badge && <Text style={st.badge}>{badge}</Text>}
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

function RegisterSheet({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", kind: "school", stage: "", city: "الحصاحيصا", address: "", phone: "", email: "", description: "", role: "owner" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try { const r = await eduApi.register(token, f); notify("تم إرسال الطلب", r.message); onDone(); }
    catch (x: any) { notify("تعذّر الإرسال", x?.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="طلب انضمام مؤسسة تعليمية" sub="تُراجع إدارة التطبيق الطلب ثم تُفعَّل مساحة مؤسستك وتصبح مالكها." onClose={onClose}
      footer={<Btn label="إرسال الطلب" icon="send" onPress={submit} busy={busy} disabled={f.name.trim().length < 4 || f.phone.replace(/\D/g, "").length < 9} />}>
      <Text style={st.label}>نوع المؤسسة</Text>
      <View style={e.wrap}>{Object.entries(KIND_AR).map(([k, l]) => <Pill key={k} label={l} on={f.kind === k} onPress={() => set("kind")(k)} />)}</View>
      <Field label="اسم المؤسسة *" value={f.name} onChange={set("name")} placeholder="مثال: مدرسة الحصاحيصا الثانوية بنين" />
      <Field label="المرحلة / الكليات" value={f.stage} onChange={set("stage")} placeholder="ابتدائي، متوسط، ثانوي، بكالوريوس…" />
      <Field label="هاتف المؤسسة *" value={f.phone} onChange={set("phone")} keyboard="phone-pad" placeholder="09xxxxxxxx" />
      <Field label="المدينة" value={f.city} onChange={set("city")} />
      <Field label="العنوان" value={f.address} onChange={set("address")} placeholder="الحي، الشارع، معلم قريب" />
      <Field label="البريد الإلكتروني" value={f.email} onChange={set("email")} keyboard="email-address" />
      <Field label="نبذة" value={f.description} onChange={set("description")} multiline placeholder="تاريخ المؤسسة، البرامج، المميزات…" />
      <Text style={st.label}>صفتك في المؤسسة</Text>
      <View style={e.wrap}>
        <Pill label="المالك" on={f.role === "owner"} onPress={() => set("role")("owner")} />
        <Pill label="المدير" on={f.role === "principal"} onPress={() => set("role")("principal")} />
      </View>
    </Sheet>
  );
}

// ─── صفحة المؤسسة ───────────────────────────────────────────
function InstitutionPage({ id }: { id: number }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [d, setD] = useState<Awaited<ReturnType<typeof eduApi.get>> | null>(null);
  const [err, setErr] = useState("");
  useFocusEffect(useCallback(() => { eduApi.get(id, token).then(setD).catch((x) => setErr(x?.message || "تعذّر التحميل")); }, [id, token]));
  if (err && !d) return <View style={st.center}><Empty icon="alert-circle-outline" title={err} /></View>;
  if (!d) return <View style={st.center}><ActivityIndicator color={EDU} /></View>;
  const w = d.institution;
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Hero insetTop={insets.top} kicker={[KIND_AR[w.kind], w.stage].filter(Boolean).join(" · ")} title={w.name} sub={[w.city, w.address].filter(Boolean).join(" — ")}>
          {w.status !== "active" && <Text style={st.pending}>{statusLabel(w.status)}{w.admin_note ? ` — ${w.admin_note}` : ""}</Text>}
        </Hero>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[e.rowR, { gap: 8, marginTop: 14 }]}>
            <Stat n={d.stats.students} l="طالب" icon="people" />
            <Stat n={d.stats.teachers} l="معلم" icon="easel" color={EDU_GOLD} />
            <Stat n={d.stats.classes} l="فصل" icon="grid" color="#0E8A5F" />
          </View>
          {(d.me.is_admin || d.me.is_teacher) && (
            <View style={[e.wrap, { marginTop: 14 }]}>
              {d.me.is_admin && <Btn label="لوحة الإدارة" icon="settings-outline" onPress={() => router.push({ pathname: "/edu-admin", params: { id: String(id) } } as any)} />}
              <Btn label="جدول الحصص" icon="calendar-outline" ghost onPress={() => router.push({ pathname: "/edu-timetable", params: { id: String(id) } } as any)} />
            </View>
          )}
          {!!w.description && <><H>عن المؤسسة</H><Card><Text style={e.body}>{w.description}</Text></Card></>}
          <H>التواصل</H>
          <Card>
            {!!w.phone && <Info icon="call-outline" text={w.phone} />}
            {!!w.email && <Info icon="mail-outline" text={w.email} />}
            {!!w.address && <Info icon="location-outline" text={w.address} />}
            {!w.phone && !w.email && !w.address && <Text style={e.muted}>لا توجد بيانات تواصل</Text>}
          </Card>
          <H>الإعلانات</H>
          {d.announcements.length ? d.announcements.map((a) => <AnnCard key={a.id} a={a} />) : <Empty icon="megaphone-outline" title="لا إعلانات حالياً" />}
        </View>
      </ScrollView>
    </View>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={[e.rowR, { gap: 8, paddingVertical: 4 }]}><Ionicons name={icon} size={16} color={EDU} /><Text style={[e.body, { flex: 1 }]}>{text}</Text></View>;
}
const AUD_AR: Record<string, string> = { all: "للجميع", students: "للطلاب", parents: "لأولياء الأمور", teachers: "للمعلمين" };
function AnnCard({ a }: { a: Announcement }) {
  return (
    <Card style={{ marginBottom: 10, borderColor: a.pinned ? EDU_GOLD : Colors.divider }}>
      <View style={[e.rowR, { gap: 6 }]}>
        {a.pinned && <Ionicons name="pin" size={14} color={EDU_GOLD} />}
        <Text style={[e.t, { flex: 1 }]}>{a.title}</Text>
        <Text style={st.chip}>{AUD_AR[a.audience] ?? a.audience}</Text>
      </View>
      <Text style={[e.body, { marginTop: 6 }]}>{a.body}</Text>
      <Text style={[e.muted, { marginTop: 6 }]}>{new Date(a.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}</Text>
    </Card>
  );
}

// ─── بوابة الطالب / ولي الأمر ──────────────────────────────────
type Tab = "timetable" | "grades" | "attendance" | "news" | "requests";
function StudentPortal({ sid }: { sid: number }) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [d, setD] = useState<Portal | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("timetable");
  const [reqOpen, setReqOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!token) return setErr("سجّل الدخول لعرض البوابة");
    try { setD(await eduApi.portal(token, sid)); } catch (x: any) { setErr(x?.message || "تعذّر التحميل"); }
  }, [token, sid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const terms = useMemo(() => [...new Set((d?.grades ?? []).map((g) => g.term))], [d]);
  const [term, setTerm] = useState<string | null>(null);
  const curTerm = term ?? d?.settings.current_term ?? terms[0] ?? null;
  const termGrades = (d?.grades ?? []).filter((g) => g.term === curTerm);
  const avg = useMemo(() => {
    const xs = termGrades.filter((g) => g.score !== null).map((g) => (Number(g.score) / Number(g.max_score || 100)) * 100);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  }, [termGrades]);

  if (err && !d) return <View style={st.center}><Empty icon="lock-closed-outline" title={err} /></View>;
  if (!d) return <View style={st.center}><ActivityIndicator color={EDU} /></View>;
  const s = d.student;
  const att = d.attendance || {};
  const attTotal = Object.values(att).reduce((a, b) => a + b, 0);
  const presentPct = attTotal ? Math.round((((att.present || 0) + (att.late || 0)) / attTotal) * 100) : null;
  const openTransfer = d.transfers.find((t) => ["requested", "released"].includes(t.status));

  const TABS: [Tab, string, keyof typeof Ionicons.glyphMap][] = [
    ["timetable", "الجدول", "calendar-outline"], ["grades", "الدرجات", "stats-chart-outline"], ["attendance", "الحضور", "checkmark-done-outline"],
    ["news", "الإعلانات", "megaphone-outline"], ["requests", "الطلبات", "document-text-outline"],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Hero insetTop={insets.top} kicker={s.ws_name} title={s.name}
          sub={[s.class_name, s.program, s.student_no ? `رقم الطالب ${s.student_no}` : null].filter(Boolean).join(" · ")} />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[e.rowR, { gap: 8, marginTop: 14 }]}>
            <Stat n={d.slots.length} l="حصة/أسبوع" icon="time" />
            <Stat n={avg !== null ? `${avg}%` : "—"} l="المعدل" icon="trophy" color={EDU_GOLD} />
            <Stat n={presentPct !== null ? `${presentPct}%` : "—"} l="الحضور" icon="checkmark-circle" color="#0E8A5F" />
          </View>
          {openTransfer && (
            <Pressable onPress={() => router.push({ pathname: "/edu-transfer", params: { student: String(s.id) } } as any)}>
              <Card style={{ marginTop: 12, borderColor: TR_COLOR[openTransfer.status] }}>
                <Text style={e.t}>طلب نقل قائم · {openTransfer.transfer_no}</Text>
                <Text style={e.muted}>إلى {openTransfer.to_name} — {openTransfer.status_label}</Text>
              </Card>
            </Pressable>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
            {TABS.map(([k, l, i]) => <View key={k} style={{ transform: [{ scaleX: -1 }] }}><Pill label={l} icon={i} on={tab === k} onPress={() => setTab(k)} /></View>)}
          </ScrollView>

          {tab === "timetable" && (
            <View style={{ marginTop: 12 }}>
              {d.slots.length ? <TimetableGrid settings={d.settings} slots={d.slots} mode="class" /> : <Empty icon="calendar-outline" title="لم يُنشر جدول فصلك بعد" />}
            </View>
          )}

          {tab === "grades" && (
            <View style={{ marginTop: 12 }}>
              {!!terms.length && <View style={e.wrap}>{terms.map((t) => <Pill key={t} label={t} on={curTerm === t} onPress={() => setTerm(t)} color={EDU_GOLD} />)}</View>}
              {termGrades.length ? (
                <Card style={{ marginTop: 10, paddingVertical: 6 }}>
                  {termGrades.map((g, i) => {
                    const pct = g.score !== null ? Math.round((Number(g.score) / Number(g.max_score || 100)) * 100) : null;
                    const c = pct === null ? Colors.textMuted : pct >= 75 ? "#0E8A5F" : pct >= 50 ? "#B7791F" : "#C0392B";
                    return (
                      <View key={i} style={[e.rowR, st.gradeRow, i === termGrades.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flex: 1 }}><Text style={e.t}>{g.subject}</Text>{!!g.note && <Text style={e.muted}>{g.note}</Text>}</View>
                        <Text style={[st.score, { color: c }]}>{g.score ?? "—"}<Text style={st.max}> / {g.max_score}</Text></Text>
                      </View>
                    );
                  })}
                </Card>
              ) : <Empty icon="stats-chart-outline" title="لا درجات مرصودة لهذا الفصل الدراسي" />}
            </View>
          )}

          {tab === "attendance" && (
            <Card style={{ marginTop: 12 }}>
              {[["present", "حاضر", "#0E8A5F"], ["late", "متأخر", "#B7791F"], ["absent", "غائب", "#C0392B"], ["excused", "غياب بعذر", "#2B6CB0"]].map(([k, l, c]) => (
                <View key={k} style={[e.rowR, { gap: 10, paddingVertical: 7 }]}>
                  <View style={[st.dot, { backgroundColor: c }]} />
                  <Text style={[e.t, { flex: 1 }]}>{l}</Text>
                  <Text style={[e.t, { color: c }]}>{att[k] || 0} يوم</Text>
                </View>
              ))}
              <Text style={[e.muted, { marginTop: 6 }]}>آخر ٩٠ يوماً دراسياً</Text>
            </Card>
          )}

          {tab === "news" && (
            <View style={{ marginTop: 12 }}>{d.announcements.length ? d.announcements.map((a) => <AnnCard key={a.id} a={a} />) : <Empty icon="megaphone-outline" title="لا إعلانات" />}</View>
          )}

          {tab === "requests" && (
            <View style={{ marginTop: 12 }}>
              <Text style={e.muted}>اطلب ما تحتاجه من المدرسة — ستصلك إشعارات بكل تحديث.</Text>
              <View style={[e.wrap, { marginTop: 10 }]}>
                {REQ_KINDS.map((k) => (
                  <Pressable key={k.k} onPress={() => setReqOpen(k.k)} style={st.reqTile} accessibilityRole="button">
                    <Ionicons name={k.i as any} size={20} color={EDU} />
                    <Text style={st.reqT}>{k.l}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => router.push({ pathname: "/edu-transfer", params: { student: String(s.id) } } as any)} style={[st.reqTile, { borderColor: EDU_GOLD }]}>
                  <Ionicons name="swap-horizontal" size={20} color={EDU_GOLD} />
                  <Text style={st.reqT}>نقل لمدرسة أخرى</Text>
                </Pressable>
              </View>
              <H>طلباتي</H>
              {d.requests.length ? d.requests.map((r) => {
                const rs = REQ_STATUS[r.status] ?? { l: r.status, c: Colors.textMuted };
                return (
                  <Card key={r.id} style={{ marginBottom: 8 }}>
                    <View style={[e.rowR, { gap: 8 }]}>
                      <Text style={[e.t, { flex: 1 }]}>{r.kind_label ?? REQ_KINDS.find((k) => k.k === r.kind)?.l ?? r.kind}</Text>
                      <Text style={[st.chip, { color: rs.c, borderColor: rs.c + "55" }]}>{rs.l}</Text>
                    </View>
                    {!!r.note && <Text style={e.muted}>{r.note}</Text>}
                    {!!r.response && <Text style={[e.body, { marginTop: 4 }]}>ردّ المدرسة: {r.response}</Text>}
                  </Card>
                );
              }) : <Empty icon="document-text-outline" title="لا طلبات بعد" />}
            </View>
          )}
        </View>
      </ScrollView>
      {reqOpen && token && <RequestSheet kind={reqOpen} onClose={() => setReqOpen(null)} onSend={async (note) => {
        const r = await eduApi.request(token, sid, reqOpen, note); setReqOpen(null); notify("تم", r.message); setTab("requests"); load();
      }} />}
    </View>
  );
}

function RequestSheet({ kind, onClose, onSend }: { kind: string; onClose: () => void; onSend: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const k = REQ_KINDS.find((x) => x.k === kind);
  return (
    <Sheet title={k?.l ?? "طلب"} sub="يصل الطلب لإدارة المدرسة مباشرة." onClose={onClose}
      footer={<Btn label="إرسال" icon="send" busy={busy} onPress={async () => { setBusy(true); try { await onSend(note); } catch (x: any) { notify("تعذّر", x?.message); } finally { setBusy(false); } }} />}>
      <Field label="تفاصيل (اختياري)" value={note} onChange={setNote} multiline placeholder={kind === "leave" ? "التاريخ وسبب الغياب" : "الغرض من الشهادة، الجهة المقدَّمة لها…"} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, marginTop: 8, borderWidth: 1, borderColor: Colors.divider },
  ico: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badge: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#B7791F", backgroundColor: "#B7791F18", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  pending: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#FFE7A8", textAlign: "right", marginTop: 8 },
  chip: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: EDU, borderWidth: 1, borderColor: EDU + "44", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8 },
  gradeRow: { gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  score: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  max: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  reqTile: { width: "31%", minWidth: 100, flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  reqT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary, textAlign: "center" },
});
