// فصولي: الطلاب، دفتر الدرجات، سجل الحضور، والتقارير المطبوعة — كله على الجهاز.
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { confirmAction, notify } from "@/lib/xplatform";
import { paperDocument, printPaper, esc } from "@/lib/paper";
import { gradeOf } from "@/components/edu/ShahadaCalculator";
import { ToolHeader, Field, Btn, Card, Empty, Segmented, EDU } from "@/components/edu/ui";
import { useTeacherData, uid, today, studentTotals, attendanceStats, type ClassRoom, type AttMark } from "@/lib/edu-store";

type View_ = "students" | "grades" | "attendance" | "reports";
const MARKS: { k: AttMark; t: string; c: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { k: "p", t: "حاضر", c: "#0E8A5F", icon: "checkmark-circle" },
  { k: "a", t: "غائب", c: "#D93636", icon: "close-circle" },
  { k: "l", t: "متأخر", c: "#C2580A", icon: "time" },
  { k: "e", t: "بعذر", c: "#1D66D4", icon: "document-text" },
];

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const dayLabel = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("ar-SD", { weekday: "long", day: "numeric", month: "long" });

export default function TeacherClasses({ onBack }: { onBack: () => void }) {
  const { data, update, ready } = useTeacherData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", school: "", year: "" });
  const cls = data.classes.find((c) => c.id === openId) ?? null;

  const create = () => {
    if (form.name.trim().length < 2) return notify("اسم الفصل مطلوب", "مثال: الصف الثاني ثانوي (أ)");
    const c: ClassRoom = { id: uid(), name: form.name.trim(), subject: form.subject.trim(), school: form.school.trim(), year: form.year.trim(), students: [], assessments: [], scores: {}, attendance: {}, created_at: Date.now() };
    update((d) => ({ ...d, classes: [c, ...d.classes] }));
    setForm({ name: "", subject: "", school: "", year: "" }); setCreating(false); setOpenId(c.id);
  };

  if (cls) return <ClassView cls={cls} onBack={() => setOpenId(null)} save={(fn) => update((d) => ({ ...d, classes: d.classes.map((c) => (c.id === cls.id ? fn(c) : c)) }))}
    onDelete={async () => { if (await confirmAction("حذف الفصل", `سيُحذف «${cls.name}» بكل درجاته وحضوره.`, "حذف", true)) { update((d) => ({ ...d, classes: d.classes.filter((c) => c.id !== cls.id) })); setOpenId(null); } }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="فصولي ودفتر الدرجات" sub="الطلاب · الدرجات · الحضور · التقارير" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}>
        {creating ? (
          <Card style={{ gap: 10 }}>
            <Field label="اسم الفصل *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="الصف الثاني ثانوي (أ)" />
            <Field label="المادة" value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} placeholder="الرياضيات" />
            <Field label="المدرسة" value={form.school} onChangeText={(v) => setForm({ ...form, school: v })} placeholder="مدرسة الحصاحيصا الثانوية" />
            <Field label="العام الدراسي" value={form.year} onChangeText={(v) => setForm({ ...form, year: v })} placeholder="2026 / 2027" />
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <Btn title="إنشاء الفصل" icon="checkmark" onPress={create} style={{ flex: 1 }} />
              <Btn title="إلغاء" outline onPress={() => setCreating(false)} />
            </View>
          </Card>
        ) : <Btn title="فصل جديد" icon="add-circle-outline" onPress={() => setCreating(true)} color={EDU.teal} />}

        {ready && data.classes.length === 0 && !creating && (
          <Empty icon="people-outline" title="لا توجد فصول بعد" sub="أنشئ فصلاً وأضف طلابك، ثم سجّل الدرجات والحضور يومياً — يعمل كل شيء بدون إنترنت." />
        )}
        {data.classes.map((c) => {
          const avg = c.students.length ? c.students.reduce((t, s) => t + studentTotals(c, s.id).pct, 0) / c.students.length : 0;
          return (
            <Card key={c.id} onPress={() => setOpenId(c.id)}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                <View style={s.icon}><Ionicons name="school-outline" size={22} color={EDU.ink} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{c.name}</Text>
                  <Text style={s.sub}>{[c.subject, c.school].filter(Boolean).join(" · ") || "—"}</Text>
                  <Text style={s.meta}>{c.students.length} طالب · {c.assessments.length} تقييم{c.assessments.length ? ` · متوسط ${avg.toFixed(1)}%` : ""}</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ClassView({ cls, onBack, save, onDelete }: { cls: ClassRoom; onBack: () => void; save: (fn: (c: ClassRoom) => ClassRoom) => void; onDelete: () => void }) {
  const [view, setView] = useState<View_>("students");
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title={cls.name} sub={[cls.subject, `${cls.students.length} طالب`].filter(Boolean).join(" · ")} onBack={onBack}
        right={<Pressable onPress={onDelete} hitSlop={8}><Ionicons name="trash-outline" size={20} color="#D93636" /></Pressable>} />
      <View style={{ padding: 12, paddingBottom: 0 }}>
        <Segmented value={view} onChange={setView} options={[
          { key: "students", label: "الطلاب" }, { key: "grades", label: "الدرجات" }, { key: "attendance", label: "الحضور" }, { key: "reports", label: "التقارير" },
        ]} />
      </View>
      {view === "students" && <Students cls={cls} save={save} />}
      {view === "grades" && <Grades cls={cls} save={save} />}
      {view === "attendance" && <Attendance cls={cls} save={save} />}
      {view === "reports" && <Reports cls={cls} />}
    </View>
  );
}

function Students({ cls, save }: { cls: ClassRoom; save: (fn: (c: ClassRoom) => ClassRoom) => void }) {
  const [names, setNames] = useState("");
  const add = () => {
    const list = names.split(/\n|،|,/).map((n) => n.trim()).filter((n) => n.length > 1);
    if (!list.length) return notify("أدخل الأسماء", "اكتب اسم طالب، أو الصق قائمة أسماء كل اسم في سطر.");
    const existing = new Set(cls.students.map((x) => x.name));
    const fresh = list.filter((n) => !existing.has(n)).map((name) => ({ id: uid(), name }));
    save((c) => ({ ...c, students: [...c.students, ...fresh] }));
    setNames("");
    if (fresh.length < list.length) notify("تمت الإضافة", `أُضيف ${fresh.length} طالب، وتُجوهل ${list.length - fresh.length} اسم مكرّر.`);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 8 }}>
        <Field label="إضافة طلاب (اسم في كل سطر)" value={names} onChangeText={setNames} multiline placeholder={"محمد أحمد\nآمنة عثمان\n..."} />
        <Btn title="إضافة" icon="person-add-outline" onPress={add} color={EDU.teal} />
      </Card>
      {cls.students.length === 0 ? <Empty icon="person-outline" title="لا يوجد طلاب" sub="أضف أسماء طلاب الفصل لتبدأ رصد الدرجات والحضور." /> :
        cls.students.map((st, i) => (
          <View key={st.id} style={s.rowItem}>
            <Text style={s.num}>{i + 1}</Text>
            <TextInput style={s.rowName} value={st.name} onChangeText={(v) => save((c) => ({ ...c, students: c.students.map((x) => (x.id === st.id ? { ...x, name: v } : x)) }))} />
            <Pressable hitSlop={8} onPress={async () => { if (await confirmAction("حذف طالب", `حذف ${st.name} من الفصل؟`, "حذف", true)) save((c) => ({ ...c, students: c.students.filter((x) => x.id !== st.id) })); }}>
              <Ionicons name="remove-circle-outline" size={20} color="#D93636" />
            </Pressable>
          </View>
        ))}
    </ScrollView>
  );
}

function Grades({ cls, save }: { cls: ClassRoom; save: (fn: (c: ClassRoom) => ClassRoom) => void }) {
  const [aId, setAId] = useState<string | null>(cls.assessments[0]?.id ?? null);
  const [title, setTitle] = useState(""); const [max, setMax] = useState("100");
  const a = cls.assessments.find((x) => x.id === aId) ?? null;
  const addA = () => {
    const m = Number(max);
    if (title.trim().length < 2 || !(m > 0 && m <= 1000)) return notify("بيانات ناقصة", "اكتب اسم التقييم والدرجة الكبرى (مثل 100 أو 20).");
    const na = { id: uid(), title: title.trim(), max: m, date: today() };
    save((c) => ({ ...c, assessments: [...c.assessments, na] })); setAId(na.id); setTitle(""); setMax("100");
  };
  const stats = useMemo(() => {
    if (!a) return null;
    const vals = cls.students.map((st) => cls.scores[a.id]?.[st.id]).filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return { avg: vals.reduce((t, v) => t + v, 0) / vals.length, hi: Math.max(...vals), lo: Math.min(...vals), pass: vals.filter((v) => v >= a.max / 2).length, n: vals.length };
  }, [a, cls]);
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 8 }}>
        <Text style={s.title}>تقييم جديد</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <View style={{ flex: 1 }}><Field value={title} onChangeText={setTitle} placeholder="اختبار الشهر الأول / واجب / مشروع" /></View>
          <View style={{ width: 80 }}><Field value={max} onChangeText={(v) => setMax(v.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="100" /></View>
        </View>
        <Btn title="إضافة التقييم" icon="add" onPress={addA} color={EDU.teal} />
      </Card>
      {cls.assessments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
          {cls.assessments.map((x) => (
            <Pressable key={x.id} onPress={() => setAId(x.id)} style={[s.chip, aId === x.id && s.chipOn]}>
              <Text style={[s.chipText, aId === x.id && { color: "#fff" }]}>{x.title} ({x.max})</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {!a ? <Empty icon="clipboard-outline" title="أضف تقييماً أولاً" sub="مثل: اختبار شهري من 20، امتحان نصف العام من 100." /> : cls.students.length === 0 ? <Empty icon="person-outline" title="أضف الطلاب أولاً" /> : (
        <>
          {stats && (
            <View style={s.statsRow}>
              {[["المتوسط", stats.avg.toFixed(1)], ["الأعلى", stats.hi], ["الأدنى", stats.lo], ["النجاح", `${stats.pass}/${stats.n}`]].map(([l, v]) => (
                <View key={String(l)} style={s.stat}><Text style={s.statV}>{v}</Text><Text style={s.statL}>{l}</Text></View>
              ))}
            </View>
          )}
          {cls.students.map((st, i) => {
            const v = cls.scores[a.id]?.[st.id];
            const over = typeof v === "number" && v > a.max;
            return (
              <View key={st.id} style={[s.rowItem, over && { borderColor: "#D93636" }]}>
                <Text style={s.num}>{i + 1}</Text>
                <Text style={[s.rowName, { paddingVertical: 8 }]} numberOfLines={1}>{st.name}</Text>
                <TextInput style={s.score} keyboardType="decimal-pad" textAlign="center" placeholder="—" placeholderTextColor={Colors.textMuted}
                  value={typeof v === "number" ? String(v) : ""}
                  onChangeText={(t) => {
                    const clean = t.replace(/[^\d.]/g, "");
                    save((c) => {
                      const col = { ...(c.scores[a.id] || {}) };
                      if (clean === "") delete col[st.id]; else col[st.id] = Math.min(Number(clean), a.max);
                      return { ...c, scores: { ...c.scores, [a.id]: col } };
                    });
                  }} />
                <Text style={s.of}>/{a.max}</Text>
              </View>
            );
          })}
          <Btn title="حذف هذا التقييم" icon="trash-outline" outline color="#D93636" onPress={async () => {
            if (await confirmAction("حذف التقييم", `حذف «${a.title}» ودرجاته؟`, "حذف", true)) { save((c) => { const sc = { ...c.scores }; delete sc[a.id]; return { ...c, assessments: c.assessments.filter((x) => x.id !== a.id), scores: sc }; }); setAId(null); }
          }} />
        </>
      )}
    </ScrollView>
  );
}

function Attendance({ cls, save }: { cls: ClassRoom; save: (fn: (c: ClassRoom) => ClassRoom) => void }) {
  const [date, setDate] = useState(today());
  const day = cls.attendance[date] || {};
  const set = (sid: string, m: AttMark) => save((c) => ({ ...c, attendance: { ...c.attendance, [date]: { ...(c.attendance[date] || {}), [sid]: m } } }));
  const counts = MARKS.map((m) => ({ ...m, n: Object.values(day).filter((x) => x === m.k).length }));
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}>
      <View style={s.dateBar}>
        <Pressable onPress={() => setDate(shiftDate(date, 1))} hitSlop={8}><Ionicons name="chevron-back" size={22} color={EDU.ink} /></Pressable>
        <Text style={s.dateText}>{dayLabel(date)}{date === today() ? " · اليوم" : ""}</Text>
        <Pressable onPress={() => setDate(shiftDate(date, -1))} hitSlop={8}><Ionicons name="chevron-forward" size={22} color={EDU.ink} /></Pressable>
      </View>
      {cls.students.length === 0 ? <Empty icon="person-outline" title="أضف الطلاب أولاً" /> : (
        <>
          <View style={s.statsRow}>{counts.map((m) => <View key={m.k} style={s.stat}><Text style={[s.statV, { color: m.c }]}>{m.n}</Text><Text style={s.statL}>{m.t}</Text></View>)}</View>
          <Btn title="تسجيل الجميع حاضرين" icon="checkmark-done" color={EDU.teal} onPress={() => save((c) => ({ ...c, attendance: { ...c.attendance, [date]: Object.fromEntries(c.students.map((x) => [x.id, (c.attendance[date] || {})[x.id] || "p"])) } }))} />
          {cls.students.map((st, i) => (
            <View key={st.id} style={s.attRow}>
              <Text style={s.num}>{i + 1}</Text>
              <Text style={s.attName} numberOfLines={1}>{st.name}</Text>
              <View style={{ flexDirection: "row-reverse", gap: 4 }}>
                {MARKS.map((m) => {
                  const on = day[st.id] === m.k;
                  return (
                    <Pressable key={m.k} onPress={() => set(st.id, m.k)} style={[s.mark, on && { backgroundColor: m.c, borderColor: m.c }]}>
                      <Text style={[s.markText, { color: on ? "#fff" : m.c }]}>{m.t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Reports({ cls }: { cls: ClassRoom }) {
  const rows = useMemo(() => {
    const r = cls.students.map((st) => ({ st, t: studentTotals(cls, st.id), a: attendanceStats(cls, st.id) }));
    const sorted = [...r].sort((x, y) => y.t.pct - x.t.pct);
    return r.map((x) => ({ ...x, rank: x.t.max ? sorted.findIndex((y) => y.st.id === x.st.id) + 1 : 0 }));
  }, [cls]);
  const avg = rows.length ? rows.reduce((t, r) => t + r.t.pct, 0) / rows.length : 0;
  const days = Object.keys(cls.attendance).length;

  const printGrades = () => {
    const head = cls.assessments.map((a) => `<th>${esc(a.title)}<br/><small>/${a.max}</small></th>`).join("");
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td class="r">${esc(r.st.name)}</td>${cls.assessments.map((a) => `<td>${cls.scores[a.id]?.[r.st.id] ?? "—"}</td>`).join("")}<td><b>${r.t.got}/${r.t.max}</b></td><td><b>${r.t.pct.toFixed(1)}%</b></td><td>${gradeOf(r.t.pct).t}</td><td>${r.rank || "—"}</td></tr>`).join("");
    printPaper(paperDocument({
      theme: "academic", title: "كشف درجات الفصل", subtitle: `${cls.name}${cls.subject ? " — " + cls.subject : ""}`, ref: cls.year || undefined,
      landscape: cls.assessments.length > 4,
      bodyHtml: `<div class="box kv"><div>المدرسة: <b>${esc(cls.school || "—")}</b></div><div>عدد الطلاب: <b>${cls.students.length}</b></div><div>عدد التقييمات: <b>${cls.assessments.length}</b></div><div>متوسط الفصل: <b>${avg.toFixed(1)}%</b></div></div>
        <table><thead><tr><th>#</th><th class="r">اسم الطالب</th>${head}<th>المجموع</th><th>النسبة</th><th>التقدير</th><th>الترتيب</th></tr></thead><tbody>${body}</tbody></table>`,
      signatures: ["معلم المادة", "رئيس القسم", "مدير المدرسة"],
    }), "كشف درجات الفصل");
  };
  const printAttendance = () => {
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td class="r">${esc(r.st.name)}</td><td>${r.a.p}</td><td>${r.a.a}</td><td>${r.a.l}</td><td>${r.a.e}</td><td><b>${r.a.rate.toFixed(0)}%</b></td></tr>`).join("");
    printPaper(paperDocument({
      theme: "academic", title: "كشف الحضور والغياب", subtitle: `${cls.name} — ${days} يوماً مسجّلاً`,
      bodyHtml: `<table><thead><tr><th>#</th><th class="r">اسم الطالب</th><th>حضور</th><th>غياب</th><th>تأخير</th><th>بعذر</th><th>نسبة الحضور</th></tr></thead><tbody>${body}</tbody></table>`,
      signatures: ["معلم الفصل", "وكيل شؤون الطلاب"],
    }), "كشف الحضور");
  };
  const shareCsv = () => {
    const head = ["الاسم", ...cls.assessments.map((a) => `${a.title} (/${a.max})`), "المجموع", "النسبة", "الحضور"].join(",");
    const lines = rows.map((r) => [r.st.name, ...cls.assessments.map((a) => cls.scores[a.id]?.[r.st.id] ?? ""), `${r.t.got}/${r.t.max}`, `${r.t.pct.toFixed(1)}%`, `${r.a.rate.toFixed(0)}%`].join(","));
    Share.share({ message: [head, ...lines].join("\n"), title: `درجات ${cls.name}` });
  };

  if (!cls.students.length) return <Empty icon="bar-chart-outline" title="لا توجد بيانات بعد" sub="أضف الطلاب وسجّل الدرجات والحضور لتظهر التقارير." />;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}>
      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statV}>{avg.toFixed(1)}%</Text><Text style={s.statL}>متوسط الفصل</Text></View>
        <View style={s.stat}><Text style={s.statV}>{rows.filter((r) => r.t.max && r.t.pct >= 50).length}</Text><Text style={s.statL}>ناجحون</Text></View>
        <View style={s.stat}><Text style={s.statV}>{days}</Text><Text style={s.statL}>أيام الحضور</Text></View>
      </View>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <Btn title="كشف الدرجات" icon="print-outline" onPress={printGrades} style={{ flex: 1 }} />
        <Btn title="كشف الحضور" icon="calendar-outline" onPress={printAttendance} color={EDU.teal} style={{ flex: 1 }} />
      </View>
      <Btn title="مشاركة الدرجات (جدول CSV)" icon="share-outline" outline onPress={shareCsv} />
      {[...rows].sort((x, y) => (x.rank || 999) - (y.rank || 999)).map((r) => {
        const g = gradeOf(r.t.pct);
        return (
          <View key={r.st.id} style={s.rowItem}>
            <Text style={[s.num, r.rank === 1 && { backgroundColor: "#F7D76A" }]}>{r.rank || "—"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{r.st.name}</Text>
              <Text style={s.meta}>حضور {r.a.rate.toFixed(0)}% · غياب {r.a.a}{r.t.missing ? ` · ${r.t.missing} تقييم ناقص` : ""}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={[s.statV, { color: g.c }]}>{r.t.max ? `${r.t.pct.toFixed(1)}%` : "—"}</Text>
              {r.t.max ? <Text style={[s.meta, { color: g.c }]}>{g.t}</Text> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  icon: { width: 46, height: 46, borderRadius: 14, backgroundColor: EDU.soft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  rowItem: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: EDU.line, paddingHorizontal: 10, paddingVertical: 6 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: EDU.soft, textAlign: "center", lineHeight: 26, fontFamily: "Cairo_700Bold", fontSize: 11.5, color: EDU.ink, overflow: "hidden" },
  rowName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  score: { width: 62, height: 38, borderRadius: 10, backgroundColor: "#F4F8F6", borderWidth: 1, borderColor: "#DCE7E2", fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
  of: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted, minWidth: 30 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: EDU.line, backgroundColor: "#fff" },
  chipOn: { backgroundColor: EDU.ink, borderColor: EDU.ink },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: EDU.ink },
  statsRow: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: EDU.line, paddingVertical: 8, alignItems: "center" },
  statV: { fontFamily: "Cairo_700Bold", fontSize: 16, color: EDU.ink },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  dateBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: EDU.line, paddingHorizontal: 12, paddingVertical: 10 },
  dateText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: EDU.ink },
  attRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: EDU.line, padding: 8, flexWrap: "wrap" },
  attName: { flex: 1, minWidth: 110, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "right" },
  mark: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "#E1EAE6" },
  markText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
});
