// نقل الطالب بين المدارس المنضمة — رقم موحّد HSW-TRF-YYYY-NNNN وخط زمني لكل خطوة:
// ١) ولي الأمر/الطالب أو المدرسة الحالية يطلب النقل ← ٢) المدرسة الحالية تُخلي الطرف ← ٣) المدرسة الجديدة تقبل وتُسكّن الفصل ← ينتقل السجل.
//  • ?student=  طلب نقل جديد لطالب + طلباتي
//  • ?ws=       وارد/صادر لإدارة مؤسسة
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { eduApi, EDU, EDU_GOLD, KIND_AR, TR_COLOR, type Institution, type Transfer, type MyEdu, type Klass } from "@/lib/edu-inst";
import { Hero, Card, H, Pill, Btn, Field, Empty, eduStyles as e } from "@/components/edu-inst/ui";
import { Sheet } from "@/components/edu-inst/sheet";

const STEP_AR: Record<string, string> = { requested: "تقديم الطلب", released: "إخلاء طرف المدرسة الحالية", completed: "قبول المدرسة الجديدة وإتمام النقل", rejected: "رفض", cancelled: "إلغاء" };

export default function EduTransfer() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const p = useLocalSearchParams<{ ws?: string; student?: string }>();
  const ws = p.ws ? Number(p.ws) : null;
  const [list, setList] = useState<Transfer[] | null>(null);
  const [mine, setMine] = useState<MyEdu | null>(null);
  const [studentId, setStudentId] = useState<number | null>(p.student ? Number(p.student) : null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<"open" | "incoming" | "outgoing" | "done">("open");
  const [act, setAct] = useState<{ t: Transfer; kind: "release" | "accept"; approve: boolean } | null>(null);
  const [classes, setClasses] = useState<Klass[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    try { setList((await eduApi.transfers(token, ws ?? undefined)).transfers); } catch (x: any) { setList([]); notify("تعذّر", x?.message); }
    if (!ws) eduApi.me(token).then((m) => { setMine(m); if (!studentId && m.students[0]) setStudentId(m.students[0].id); }).catch(() => {});
  }, [token, ws, studentId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (ws && token) eduApi.overview(token, ws).then((o) => setClasses(o.classes)).catch(() => {}); }, [ws, token]);

  if (!token) return <View style={st.center}><Empty icon="lock-closed-outline" title="سجّل الدخول" /></View>;
  const open = (t: Transfer) => ["requested", "released"].includes(t.status);
  const shown = (list ?? []).filter((t) => !ws ? true : filter === "open" ? open(t) : filter === "done" ? !open(t) : t.direction === filter);
  const student = mine?.students.find((s) => s.id === studentId);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Hero insetTop={insets.top} kicker="بين المدارس المنضمة" title={ws ? "طلبات النقل" : "نقل طالب"}
          sub={ws ? "أخلِ طرف المغادرين واقبل القادمين — ينتقل السجل والدرجات تلقائياً." : "قدّم الطلب مرة واحدة وتابِع كل خطوة حتى يُسكَّن ابنك في فصله الجديد."} />
        <View style={{ paddingHorizontal: 16 }}>
          <Steps />
          {!ws && (
            <>
              {mine && !mine.students.length ? (
                <Empty icon="person-outline" title="لا يوجد طالب مرتبط بحسابك" sub="تربط المدرسة الطالب بحسابك عبر رقم هاتف ولي الأمر المسجَّل لديها." />
              ) : (
                <>
                  <H>الطالب</H>
                  <View style={e.wrap}>{(mine?.students ?? []).map((s) => <Pill key={s.id} label={`${s.name} · ${s.ws_name}`} on={studentId === s.id} onPress={() => setStudentId(s.id)} color={EDU_GOLD} />)}</View>
                  {student && <View style={{ marginTop: 12 }}><Btn label="طلب نقل جديد" icon="swap-horizontal" onPress={() => setNewOpen(true)} disabled={(list ?? []).some((t) => t.student_id === student.id && open(t))} /></View>}
                </>
              )}
              <H>طلباتي</H>
            </>
          )}
          {ws && (
            <View style={[e.wrap, { marginTop: 14 }]}>
              <Pill label={`المعلّقة ${(list ?? []).filter(open).length}`} on={filter === "open"} onPress={() => setFilter("open")} />
              <Pill label="وارد" icon="arrow-down" on={filter === "incoming"} onPress={() => setFilter("incoming")} />
              <Pill label="صادر" icon="arrow-up" on={filter === "outgoing"} onPress={() => setFilter("outgoing")} />
              <Pill label="المنتهية" on={filter === "done"} onPress={() => setFilter("done")} />
            </View>
          )}
          {list === null ? <ActivityIndicator color={EDU} style={{ marginTop: 20 }} /> : !shown.length ? <Empty icon="swap-horizontal" title="لا طلبات نقل" /> : shown.map((t) => (
            <TransferCard key={t.id} t={t} ws={ws}
              onRelease={(approve) => setAct({ t, kind: "release", approve })}
              onAccept={(approve) => setAct({ t, kind: "accept", approve })}
              onCancel={() => confirmAction("إلغاء طلب النقل", t.transfer_no, "إلغاء الطلب", true).then(async (ok) => {
                if (!ok) return;
                try { await eduApi.cancelTransfer(token, t.id); load(); } catch (x: any) { notify("تعذّر", x?.message); }
              })} />
          ))}
        </View>
      </ScrollView>
      {newOpen && student && <NewTransfer token={token} student={student} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); load(); }} />}
      {act && <ActSheet act={act} classes={classes} onClose={() => setAct(null)} onDo={async (note, classId) => {
        try {
          if (act.kind === "release") await eduApi.release(token, act.t.id, act.approve, note);
          else await eduApi.accept(token, act.t.id, act.approve, classId, note);
          setAct(null); load();
          notify("تم", act.kind === "accept" && act.approve ? "اكتمل النقل وانتقل سجل الطالب لمدرستكم" : act.approve ? "أُخلي الطرف — بانتظار قبول المدرسة الجديدة" : "رُفض الطلب وأُشعر مقدّمه");
        } catch (x: any) { notify("تعذّر", x?.message); }
      }} />}
    </View>
  );
}

function Steps() {
  const s: [keyof typeof Ionicons.glyphMap, string][] = [["create-outline", "الطلب"], ["log-out-outline", "إخلاء الطرف"], ["log-in-outline", "القبول والتسكين"], ["checkmark-done", "انتقال السجل"]];
  return (
    <Card style={{ marginTop: 14 }}>
      <View style={[e.rowR, { justifyContent: "space-between" }]}>
        {s.map(([i, l], k) => (
          <React.Fragment key={k}>
            <View style={{ alignItems: "center", gap: 4, width: 66 }}>
              <View style={st.stepI}><Ionicons name={i} size={18} color={EDU} /></View>
              <Text style={st.stepT}>{l}</Text>
            </View>
            {k < s.length - 1 && <View style={st.stepLine} />}
          </React.Fragment>
        ))}
      </View>
    </Card>
  );
}

function TransferCard({ t, ws, onRelease, onAccept, onCancel }: { t: Transfer; ws: number | null; onRelease: (a: boolean) => void; onAccept: (a: boolean) => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const c = TR_COLOR[t.status] ?? Colors.textMuted;
  const canRelease = !!ws && t.direction === "outgoing" && t.status === "requested";
  const canAccept = !!ws && t.direction === "incoming" && t.status === "released";
  const canCancel = !ws && ["requested", "released"].includes(t.status);
  return (
    <Card style={{ marginTop: 10, borderColor: c + "66" }}>
      <Pressable onPress={() => setOpen(!open)}>
        <View style={[e.rowR, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={e.t}>{t.student_name}{t.student_no ? ` · ${t.student_no}` : ""}</Text>
            <Text style={e.muted}>{t.from_name}  ←  {t.to_name}</Text>
          </View>
          {ws && <Ionicons name={t.direction === "incoming" ? "arrow-down-circle" : "arrow-up-circle"} size={20} color={t.direction === "incoming" ? "#0E8A5F" : "#2B6CB0"} />}
        </View>
        <View style={[e.rowR, { gap: 8, marginTop: 6 }]}>
          <Text style={[st.chip, { color: c, borderColor: c + "55" }]}>{t.status_label}</Text>
          <Text style={[e.muted, { flex: 1 }]}>{t.transfer_no}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
        </View>
      </Pressable>
      {!!t.reason && <Text style={[e.body, { marginTop: 6 }]}>السبب: {t.reason}</Text>}
      {open && (
        <View style={{ marginTop: 10 }}>
          {(t.history || []).map((h, i) => (
            <View key={i} style={[e.rowR, { gap: 10, alignItems: "flex-start" }]}>
              <View style={{ alignItems: "center" }}>
                <View style={[st.dot, { backgroundColor: TR_COLOR[h.step] ?? EDU }]} />
                {i < t.history.length - 1 && <View style={st.vline} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 10 }}>
                <Text style={[e.t, { fontSize: 13 }]}>{STEP_AR[h.step] ?? h.step}</Text>
                <Text style={e.muted}>{new Date(h.at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{h.note ? ` — ${h.note}` : ""}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {(canRelease || canAccept || canCancel) && (
        <View style={[e.wrap, { marginTop: 10 }]}>
          {canRelease && <><Btn small label="إخلاء الطرف" icon="log-out-outline" color="#2B6CB0" onPress={() => onRelease(true)} /><Btn small ghost color="#C0392B" label="رفض" icon="close" onPress={() => onRelease(false)} /></>}
          {canAccept && <><Btn small label="قبول وتسكين" icon="log-in-outline" color="#0E8A5F" onPress={() => onAccept(true)} /><Btn small ghost color="#C0392B" label="اعتذار" icon="close" onPress={() => onAccept(false)} /></>}
          {canCancel && <Btn small ghost color="#C0392B" label="إلغاء الطلب" icon="trash-outline" onPress={onCancel} />}
        </View>
      )}
    </Card>
  );
}

function NewTransfer({ token, student, onClose, onDone }: { token: string; student: MyEdu["students"][number]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Institution[]>([]);
  const [to, setTo] = useState<Institution | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => eduApi.list(q.trim() || undefined).then((r) => setList(r.institutions.filter((w) => w.id !== student.ws_id))).catch(() => {}), 250); return () => clearTimeout(t); }, [q, student.ws_id]);
  return (
    <Sheet title={`نقل ${student.name}`} sub={`من ${student.ws_name}${student.class_name ? ` (${student.class_name})` : ""} — تظهر فقط المؤسسات المنضمة للتطبيق.`} onClose={onClose}
      footer={<Btn label={to ? `إرسال طلب النقل إلى ${to.name}` : "اختر المدرسة الجديدة"} icon="send" disabled={!to} busy={busy} onPress={async () => {
        if (!to) return; setBusy(true);
        try { const r = await eduApi.requestTransfer(token, student.id, to.id, reason.trim()); notify("أُرسل الطلب", r.message); onDone(); }
        catch (x: any) { notify("تعذّر", x?.message); } finally { setBusy(false); }
      }} />}>
      <Field label="المدرسة الجديدة" value={q} onChange={setQ} placeholder="ابحث بالاسم أو المدينة" />
      {list.slice(0, 20).map((w) => (
        <Pressable key={w.id} onPress={() => setTo(w)} style={[st.pick, to?.id === w.id && { borderColor: EDU, backgroundColor: EDU + "10" }]}>
          <Ionicons name={to?.id === w.id ? "radio-button-on" : "radio-button-off"} size={18} color={EDU} />
          <View style={{ flex: 1 }}>
            <Text style={e.t}>{w.name}</Text>
            <Text style={e.muted}>{[KIND_AR[w.kind], w.stage, w.city].filter(Boolean).join(" · ")}</Text>
          </View>
        </Pressable>
      ))}
      <Field label="سبب النقل" value={reason} onChange={setReason} multiline placeholder="انتقال السكن، قرب المدرسة، ظروف العمل…" />
    </Sheet>
  );
}

function ActSheet({ act, classes, onClose, onDo }: { act: { t: Transfer; kind: "release" | "accept"; approve: boolean }; classes: Klass[]; onClose: () => void; onDo: (note: string, classId: number | null) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [cls, setCls] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const title = act.kind === "release" ? (act.approve ? "إخلاء طرف" : "رفض النقل") : act.approve ? "قبول الطالب" : "الاعتذار عن القبول";
  return (
    <Sheet title={`${title} — ${act.t.student_name}`} sub={act.t.transfer_no} onClose={onClose}
      footer={<Btn label="تأكيد" icon="checkmark" color={act.approve ? "#0E8A5F" : "#C0392B"} busy={busy} disabled={!act.approve && note.trim().length < 3}
        onPress={async () => { setBusy(true); await onDo(note.trim(), cls); setBusy(false); }} />}>
      {act.kind === "accept" && act.approve && (
        <>
          <Text style={st.label}>تسكين في فصل</Text>
          <View style={e.wrap}>{classes.map((c) => <Pill key={c.id} label={`${c.name}${c.students !== undefined ? ` · ${c.students}` : ""}`} on={cls === c.id} onPress={() => setCls(cls === c.id ? null : c.id)} color={EDU_GOLD} />)}</View>
          {!classes.length && <Text style={e.muted}>لا فصول — يمكنك التسكين لاحقاً من قائمة الطلاب.</Text>}
        </>
      )}
      <Field label={act.approve ? "ملاحظة (اختياري)" : "سبب الرفض *"} value={note} onChange={setNote} multiline
        placeholder={act.kind === "release" && act.approve ? "مثال: لا توجد مستحقات، تُسلَّم الملفات للمدرسة الجديدة" : undefined} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  stepI: { width: 36, height: 36, borderRadius: 18, backgroundColor: EDU + "14", alignItems: "center", justifyContent: "center" },
  stepT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  stepLine: { flex: 1, height: 2, backgroundColor: EDU_GOLD + "66", marginBottom: 18 },
  chip: { fontFamily: "Cairo_600SemiBold", fontSize: 12, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  vline: { width: 2, flex: 1, backgroundColor: Colors.divider, marginTop: 2 },
  pick: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, marginTop: 6 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
});
