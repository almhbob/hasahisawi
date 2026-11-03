// جدول الحصص الاحترافي — لكل فصل ولكل معلم. كل حصة تُفحص على الخادم ضد التضارب:
// المعلم في فصلين بالوقت نفسه، القاعة المحجوزة، وتجاوز النصاب الأسبوعي. تعبئة تلقائية، نسخ يوم، مسح، ومشاركة.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, StyleSheet, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { eduApi, EduError, EDU, EDU_GOLD, DAY_AR, periodTime, todayIndex, type Overview, type Settings, type Slot } from "@/lib/edu-inst";
import { Hero, Pill, Btn, Card, Empty, TimetableGrid, eduStyles as e } from "@/components/edu-inst/ui";

type Mode = "class" | "teacher";

export default function EduTimetable() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const p = useLocalSearchParams<{ id: string; class_id?: string; teacher_id?: string }>();
  const wsId = Number(p.id);
  const [ov, setOv] = useState<Overview | null>(null);
  const [mode, setMode] = useState<Mode>(p.teacher_id ? "teacher" : "class");
  const [classId, setClassId] = useState<number | null>(p.class_id ? Number(p.class_id) : null);
  const [teacherId, setTeacherId] = useState<number | null>(p.teacher_id ? Number(p.teacher_id) : null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [myStaff, setMyStaff] = useState<number | null>(null);
  const [cell, setCell] = useState<{ day: number; period: number; slot?: Slot } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const canEdit = !!ov?.me.perms.includes("timetable");

  const loadOv = useCallback(async () => {
    if (!token) return;
    try {
      const o = await eduApi.overview(token, wsId);
      setOv(o);
      if (!classId && !teacherId) {
        if (o.me.perms.includes("timetable") && o.classes[0]) setClassId(o.classes[0].id);
        else if (o.me.staff_id) { setMode("teacher"); setTeacherId(o.me.staff_id); }
      }
    } catch (x: any) { setErr(x?.message || "تعذّر التحميل"); }
  }, [token, wsId]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    if (!token) return;
    const f = mode === "class" ? (classId ? { class_id: classId } : null) : teacherId ? { teacher_id: teacherId } : {};
    if (!f) return;
    try { const r = await eduApi.timetable(token, wsId, f); setSettings(r.settings); setSlots(r.slots); setMyStaff(r.my_staff_id); } catch (x: any) { setErr(x?.message); }
  }, [token, wsId, mode, classId, teacherId]);
  useFocusEffect(useCallback(() => { loadOv(); }, [loadOv]));
  useEffect(() => { load(); }, [load]);

  const klass = ov?.classes.find((c) => c.id === classId);
  const teacher = ov?.staff.find((t) => t.id === teacherId);
  const teachers = (ov?.staff ?? []).filter((t) => t.kind === "teacher" && t.active);
  const load_ = (id: number) => ov?.staff.find((t) => t.id === id)?.weekly_load ?? 0;

  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } catch (x: any) { notify("تعذّر", x?.message); } finally { setBusy(null); } };
  const autofill = () => run("auto", async () => {
    const r = await eduApi.autofill(token!, wsId, classId!);
    await load(); loadOv();
    notify("التعبئة التلقائية", `وُضعت ${r.placed} حصة دون تضارب${r.missing.length ? `\n\nلم تكتمل:\n${r.missing.join("\n")}` : ""}`);
  });
  const clearAll = async () => {
    if (!(await confirmAction("مسح الجدول", `مسح كل حصص «${klass?.name}»؟`, "مسح", true))) return;
    run("clear", async () => { await eduApi.clear(token!, wsId, classId!); await load(); loadOv(); });
  };
  const share = () => {
    if (!settings) return;
    const title = mode === "class" ? `جدول فصل ${klass?.name ?? ""}` : `جدول ${teacher?.name ?? "المعلم"}`;
    const lines = settings.days.map((d) => {
      const day = slots.filter((x) => x.day === d).sort((a, b) => a.period - b.period);
      return `▪︎ ${DAY_AR[d]}: ${day.length ? day.map((x) => `${x.period}) ${x.subject_name}${mode === "class" ? ` – ${x.teacher_name ?? ""}` : ` – ${x.class_name}`}`).join("  ") : "—"}`;
    });
    Share.share({ message: `🏫 ${ov?.institution.name}\n${title} — ${settings.academic_year}\n\n${lines.join("\n")}` }).catch(() => {});
  };

  if (err && !ov) return <View style={st.center}><Empty icon="alert-circle-outline" title={err} /></View>;
  if (!ov) return <View style={st.center}><ActivityIndicator color={EDU} /></View>;
  const total = slots.length;
  const today = todayIndex();
  const todaySlots = slots.filter((x) => x.day === today).sort((a, b) => a.period - b.period);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Hero insetTop={insets.top} kicker={ov.institution.name} title="جدول الحصص" sub={settings ? `${settings.academic_year} · ${settings.current_term} · ${settings.days.length} أيام × ${settings.periods} حصص` : undefined}
          right={<Pressable onPress={share} style={st.heroBtn} accessibilityLabel="مشاركة الجدول"><Ionicons name="share-social" size={18} color="#fff" /></Pressable>} />

        <View style={{ paddingHorizontal: 16 }}>
          {canEdit && (
            <View style={[e.rowR, { gap: 8, marginTop: 14 }]}>
              <Pill label="جدول الفصول" on={mode === "class"} onPress={() => setMode("class")} icon="grid-outline" />
              <Pill label="جدول المعلمين" on={mode === "teacher"} onPress={() => { setMode("teacher"); if (!teacherId && teachers[0]) setTeacherId(teachers[0].id); }} icon="person-outline" />
            </View>
          )}
          {mode === "class" && canEdit && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
              {ov.classes.map((c) => <View key={c.id} style={{ transform: [{ scaleX: -1 }] }}><Pill label={`${c.name}${c.slots ? ` · ${c.slots}` : ""}`} on={classId === c.id} onPress={() => setClassId(c.id)} color={EDU_GOLD} /></View>)}
            </ScrollView>
          )}
          {mode === "teacher" && canEdit && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
              {teachers.map((t) => <View key={t.id} style={{ transform: [{ scaleX: -1 }] }}><Pill label={`${t.name} · ${t.weekly_load ?? 0}/${t.max_weekly}`} on={teacherId === t.id} onPress={() => setTeacherId(t.id)} color={EDU_GOLD} /></View>)}
            </ScrollView>
          )}

          {mode === "class" && !ov.classes.length && <Empty icon="grid-outline" title="لا توجد فصول بعد" sub="أضف الفصول والمواد من لوحة المؤسسة أولاً." />}

          {mode === "teacher" && !!teacherId && (
            <Card style={{ marginTop: 14, borderColor: EDU_GOLD + "66" }}>
              <View style={[e.rowR, { justifyContent: "space-between" }]}>
                <View>
                  <Text style={e.t}>{teacherId === myStaff && !canEdit ? "جدولي الأسبوعي" : teacher?.name}</Text>
                  <Text style={e.muted}>{total} حصة أسبوعياً{teacher ? ` من ${teacher.max_weekly}` : ""}{teacher?.subjects.length ? ` · ${teacher.subjects.join("، ")}` : ""}</Text>
                </View>
                <Ionicons name="person-circle" size={34} color={EDU} />
              </View>
              <Text style={[e.t, { marginTop: 10, fontSize: 13.5, color: EDU_GOLD }]}>اليوم — {DAY_AR[today]}</Text>
              {todaySlots.length ? todaySlots.map((x) => (
                <View key={x.id} style={[e.rowR, st.todayRow]}>
                  <Text style={st.todayP}>{x.period}</Text>
                  <View style={{ flex: 1 }}><Text style={e.t}>{x.subject_name} · {x.class_name}</Text><Text style={e.muted}>{settings ? periodTime(settings, x.period) : ""}{x.room ? ` · ${x.room}` : ""}</Text></View>
                </View>
              )) : <Text style={e.muted}>لا حصص اليوم</Text>}
            </Card>
          )}

          {settings && (mode === "teacher" ? !!teacherId : !!classId) && (
            <View style={{ marginTop: 14 }}>
              {mode === "class" && canEdit && (
                <View style={[e.wrap, { marginBottom: 10 }]}>
                  <Btn small label="خطة الحصص" icon="list-outline" ghost onPress={() => setPlanOpen(true)} />
                  <Btn small label="تعبئة تلقائية" icon="flash-outline" onPress={autofill} busy={busy === "auto"} />
                  <Btn small label="نسخ يوم" icon="copy-outline" ghost onPress={() => setCopyOpen(true)} />
                  <Btn small label="مسح" icon="trash-outline" ghost color="#C0392B" onPress={clearAll} busy={busy === "clear"} />
                </View>
              )}
              <TimetableGrid settings={settings} slots={slots} mode={mode} onCell={mode === "class" && canEdit ? (day, period, slot) => setCell({ day, period, slot }) : undefined} />
              <Text style={[e.muted, { marginTop: 8 }]}>{mode === "class" ? `${total} من ${settings.days.length * settings.periods} حصة مُسندة. اضغط أي خانة لإسناد مادة ومعلم — يرفض النظام أي تضارب.` : "عرض للقراءة — يُعدَّل من جدول الفصول."}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {cell && classId && settings && (
        <SlotSheet ov={ov} wsId={wsId} token={token!} classId={classId} cell={cell} settings={settings} loadOf={load_} defaultRoom={klass?.room || ""}
          onClose={() => setCell(null)} onSaved={() => { setCell(null); load(); loadOv(); }} />
      )}
      {planOpen && classId && settings && <PlanSheet ov={ov} wsId={wsId} token={token!} classId={classId} settings={settings} onClose={() => setPlanOpen(false)} />}
      {copyOpen && classId && settings && (
        <CopySheet settings={settings} onClose={() => setCopyOpen(false)} onCopy={(from, to) => run("copy", async () => {
          const r = await eduApi.copyDay(token!, wsId, classId, from, to);
          setCopyOpen(false); await load(); loadOv();
          notify("نسخ اليوم", `نُسخت ${r.copied} حصة${r.skipped.length ? `\n\nتُخطّي بسبب التضارب:\n${r.skipped.join("\n")}` : ""}`);
        })} />
      )}
    </View>
  );
}

// ─── اختيار المادة والمعلم لخانة ───────────────────────────────
function SlotSheet({ ov, wsId, token, classId, cell, settings, loadOf, defaultRoom, onClose, onSaved }: {
  ov: Overview; wsId: number; token: string; classId: number; cell: { day: number; period: number; slot?: Slot }; settings: Settings;
  loadOf: (id: number) => number; defaultRoom: string; onClose: () => void; onSaved: () => void;
}) {
  const [subject, setSubject] = useState<number | null>(cell.slot?.subject_id ?? null);
  const [teacher, setTeacher] = useState<number | null>(cell.slot?.teacher_id ?? null);
  const [room, setRoom] = useState(cell.slot?.room ?? defaultRoom);
  const [av, setAv] = useState<{ busy: Record<string, string>; full: Record<string, string>; rooms: string[] } | null>(null);
  const [plan, setPlan] = useState<{ subject_id: number; teacher_id: number | null }[]>([]);
  const [conflict, setConflict] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    eduApi.availability(token, wsId, cell.day, cell.period, classId).then(setAv).catch(() => {});
    eduApi.plan(token, wsId, classId).then((r) => setPlan(r.plan)).catch(() => {});
  }, [token, wsId, cell, classId]);
  const pickSubject = (id: number) => {
    setSubject(id); setConflict("");
    const pl = plan.find((x) => x.subject_id === id);
    if (pl?.teacher_id && !teacher) setTeacher(pl.teacher_id);
  };
  const subjName = ov.subjects.find((x) => x.id === subject)?.name;
  const teachers = ov.staff.filter((t) => t.kind === "teacher" && t.active)
    .sort((a, b) => Number(!!subjName && b.subjects.includes(subjName)) - Number(!!subjName && a.subjects.includes(subjName)));
  const save = async () => {
    if (!subject) return setConflict("اختر المادة");
    setSaving(true); setConflict("");
    try { await eduApi.setSlot(token, wsId, { class_id: classId, day: cell.day, period: cell.period, subject_id: subject, teacher_id: teacher, room: room.trim() || null }); onSaved(); }
    catch (x: any) { setConflict(x instanceof EduError ? x.message : "تعذّر الحفظ"); } finally { setSaving(false); }
  };
  const remove = async () => { try { await eduApi.delSlot(token, wsId, classId, cell.day, cell.period); onSaved(); } catch (x: any) { setConflict(x?.message); } };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.handle} />
          <Text style={st.sheetT}>{DAY_AR[cell.day]} · الحصة {cell.period}</Text>
          <Text style={e.muted}>{periodTime(settings, cell.period)}</Text>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <Text style={st.lbl}>المادة</Text>
            <View style={e.wrap}>
              {ov.subjects.map((x) => <Pill key={x.id} label={x.name} on={subject === x.id} onPress={() => pickSubject(x.id)} color={x.color} />)}
              {!ov.subjects.length && <Text style={e.muted}>أضف المواد من لوحة المؤسسة.</Text>}
            </View>
            <Text style={st.lbl}>المعلم</Text>
            <View style={{ gap: 6 }}>
              <Pressable onPress={() => setTeacher(null)} style={[st.tRow, teacher === null && st.tOn]}><Text style={e.t}>بدون معلم</Text></Pressable>
              {teachers.map((t) => {
                const busy = av?.busy[String(t.id)];
                const full = !busy && av?.full[String(t.id)] && cell.slot?.teacher_id !== t.id ? av.full[String(t.id)] : null;
                const reason = busy ? `مشغول ${busy}` : full;
                const fits = !!subjName && t.subjects.includes(subjName);
                return (
                  <Pressable key={t.id} disabled={!!reason} onPress={() => { setTeacher(t.id); setConflict(""); }} style={[st.tRow, teacher === t.id && st.tOn, !!reason && { opacity: 0.45 }]}
                    accessibilityState={{ disabled: !!reason, selected: teacher === t.id }}>
                    <View style={{ flex: 1 }}>
                      <Text style={e.t}>{t.name}{fits ? " ✓" : ""}</Text>
                      <Text style={[e.muted, reason ? { color: "#C0392B" } : null]}>{reason || `${t.subjects.join("، ") || "—"} · ${loadOf(t.id)}/${t.max_weekly} حصة`}</Text>
                    </View>
                    <Ionicons name={reason ? "lock-closed" : teacher === t.id ? "radio-button-on" : "radio-button-off"} size={20} color={reason ? "#C0392B" : teacher === t.id ? EDU : Colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={st.lbl}>القاعة (اختياري)</Text>
            <TextInput value={room} onChangeText={setRoom} placeholder="مثال: معمل العلوم" placeholderTextColor={Colors.textMuted} style={st.input} />
            {!!room && av?.rooms.includes(room) && <Text style={[e.muted, { color: "#C0392B" }]}>هذه القاعة محجوزة في هذا الوقت</Text>}
          </ScrollView>
          {!!conflict && <View style={st.conflict}><Ionicons name="warning" size={18} color="#C0392B" /><Text style={st.conflictT}>{conflict}</Text></View>}
          <View style={[e.rowR, { gap: 8, marginTop: 12 }]}>
            <View style={{ flex: 1 }}><Btn label="حفظ الحصة" icon="checkmark" onPress={save} busy={saving} /></View>
            {cell.slot && <Btn label="إفراغ" icon="trash-outline" ghost color="#C0392B" onPress={remove} />}
            <Btn label="إغلاق" ghost color={Colors.textSecondary} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── خطة الحصص الأسبوعية (لكل مادة: المعلم وعدد الحصص) ─────────────
function PlanSheet({ ov, wsId, token, classId, settings, onClose }: { ov: Overview; wsId: number; token: string; classId: number; settings: Settings; onClose: () => void }) {
  const [rows, setRows] = useState<Record<number, { teacher_id: number | null; weekly: number; placed: number }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { eduApi.plan(token, wsId, classId).then((r) => setRows(Object.fromEntries(r.plan.map((x) => [x.subject_id, x])))).catch(() => {}); }, [token, wsId, classId]);
  const total = useMemo(() => Object.values(rows).reduce((a, x) => a + (x.weekly || 0), 0), [rows]);
  const cap = settings.days.length * settings.periods;
  const set = (sid: number, patch: Partial<{ teacher_id: number | null; weekly: number }>) => setRows((r) => ({ ...r, [sid]: { ...(r[sid] ?? { teacher_id: null, weekly: 0, placed: 0 }), ...patch } }));
  const save = async () => {
    setSaving(true);
    try { await eduApi.savePlan(token, wsId, classId, Object.entries(rows).map(([k, v]) => ({ subject_id: Number(k), teacher_id: v.teacher_id, weekly: v.weekly }))); onClose(); notify("حُفظت الخطة", "استخدم «تعبئة تلقائية» لتوزيع الحصص دون تضارب"); }
    catch (x: any) { notify("تعذّر", x?.message); } finally { setSaving(false); }
  };
  const teachers = ov.staff.filter((t) => t.kind === "teacher" && t.active);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={[st.sheet, { maxHeight: "92%" }]}>
          <View style={st.handle} />
          <Text style={st.sheetT}>خطة الحصص الأسبوعية</Text>
          <Text style={[e.muted, { color: total > cap ? "#C0392B" : Colors.textMuted }]}>المجموع {total} من سعة {cap} حصة</Text>
          <ScrollView style={{ marginTop: 8 }}>
            {ov.subjects.map((sb) => {
              const r = rows[sb.id] || { teacher_id: null, weekly: 0, placed: 0 };
              return (
                <View key={sb.id} style={st.planRow}>
                  <View style={[e.rowR, { justifyContent: "space-between" }]}>
                    <Text style={[e.t, { color: sb.color }]}>{sb.name}</Text>
                    <View style={[e.rowR, { gap: 8 }]}>
                      <Pressable onPress={() => set(sb.id, { weekly: Math.max(0, r.weekly - 1) })} style={st.step}><Ionicons name="remove" size={16} color={EDU} /></Pressable>
                      <Text style={[e.t, { minWidth: 24, textAlign: "center" }]}>{r.weekly}</Text>
                      <Pressable onPress={() => set(sb.id, { weekly: Math.min(20, r.weekly + 1) })} style={st.step}><Ionicons name="add" size={16} color={EDU} /></Pressable>
                    </View>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
                    {teachers.map((t) => (
                      <View key={t.id} style={{ transform: [{ scaleX: -1 }] }}>
                        <Pill label={`${t.name}${t.subjects.includes(sb.name) ? " ✓" : ""}`} on={r.teacher_id === t.id} onPress={() => set(sb.id, { teacher_id: r.teacher_id === t.id ? null : t.id })} color={sb.color} />
                      </View>
                    ))}
                  </ScrollView>
                  {r.placed > 0 && <Text style={e.muted}>مُوزّع في الجدول: {r.placed}</Text>}
                </View>
              );
            })}
            {!ov.subjects.length && <Empty title="لا مواد بعد" />}
          </ScrollView>
          <View style={[e.rowR, { gap: 8, marginTop: 10 }]}>
            <View style={{ flex: 1 }}><Btn label="حفظ الخطة" icon="save-outline" onPress={save} busy={saving} disabled={total > cap} /></View>
            <Btn label="إغلاق" ghost color={Colors.textSecondary} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CopySheet({ settings, onClose, onCopy }: { settings: Settings; onClose: () => void; onCopy: (from: number, to: number) => void }) {
  const [from, setFrom] = useState(settings.days[0]);
  const [to, setTo] = useState(settings.days[1] ?? settings.days[0]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <Text style={st.sheetT}>نسخ يوم</Text>
          <Text style={st.lbl}>من</Text>
          <View style={e.wrap}>{settings.days.map((d) => <Pill key={d} label={DAY_AR[d]} on={from === d} onPress={() => setFrom(d)} />)}</View>
          <Text style={st.lbl}>إلى</Text>
          <View style={e.wrap}>{settings.days.map((d) => <Pill key={d} label={DAY_AR[d]} on={to === d} onPress={() => setTo(d)} color={EDU_GOLD} />)}</View>
          <Text style={[e.muted, { marginTop: 8 }]}>تُستبدل حصص اليوم الهدف، وتُتخطّى أي حصة تسبب تضارباً مع فصل آخر.</Text>
          <View style={[e.rowR, { gap: 8, marginTop: 12 }]}>
            <View style={{ flex: 1 }}><Btn label="نسخ" icon="copy" onPress={() => onCopy(from, to)} disabled={from === to} /></View>
            <Btn label="إلغاء" ghost color={Colors.textSecondary} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  heroBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  todayRow: { gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  todayP: { width: 30, height: 30, borderRadius: 15, backgroundColor: EDU, color: "#fff", textAlign: "center", lineHeight: 30, fontFamily: "Cairo_700Bold", overflow: "hidden" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 10 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  tRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  tOn: { borderColor: EDU, backgroundColor: EDU + "0F" },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  conflict: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#C0392B12", borderWidth: 1, borderColor: "#C0392B44" },
  conflictT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#9B2C2C", textAlign: "right", lineHeight: 20 },
  planRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  step: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: EDU + "55", alignItems: "center", justifyContent: "center" },
});
