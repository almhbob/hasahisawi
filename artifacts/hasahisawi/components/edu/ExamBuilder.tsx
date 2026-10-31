// منشئ الاختبارات: أسئلة اختيار من متعدد، صح/خطأ، إجابة قصيرة، ومقالية،
// مع توزيع الدرجات تلقائياً وطباعة ورقة الامتحان ونموذج الإجابة.
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { confirmAction, notify } from "@/lib/xplatform";
import { paperDocument, printPaper, esc, blank } from "@/lib/paper";
import { ToolHeader, Field, Btn, Card, Empty, EDU } from "@/components/edu/ui";
import { useTeacherData, uid, type Exam, type Question, type QType } from "@/lib/edu-store";

const TYPES: { k: QType; t: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { k: "mcq", t: "اختيار من متعدد", icon: "list-outline" },
  { k: "tf", t: "صح أم خطأ", icon: "checkmark-done-outline" },
  { k: "short", t: "إجابة قصيرة", icon: "create-outline" },
  { k: "essay", t: "سؤال مقالي", icon: "document-text-outline" },
];
const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

const newExam = (): Exam => ({ id: uid(), title: "", subject: "", grade: "", school: "", duration: "ساعة واحدة", instructions: "أجب عن جميع الأسئلة.\nاكتب إجاباتك بخط واضح.", questions: [], updated_at: Date.now() });
const newQ = (type: QType): Question => ({ id: uid(), type, text: "", options: type === "mcq" ? ["", "", "", ""] : [], answer: "", marks: type === "essay" ? 10 : type === "short" ? 3 : 1 });

export function printExam(e: Exam, withKey: boolean) {
  const total = e.questions.reduce((t, q) => t + (Number(q.marks) || 0), 0);
  const qs = e.questions.map((q, i) => {
    const head = `<div style="display:flex;justify-content:space-between;gap:10px"><b>س${i + 1}: ${esc(q.text)}</b><span class="pill">${q.marks} درجة</span></div>`;
    let body = "";
    if (q.type === "mcq") body = `<ol style="list-style:none;padding-right:8px">${q.options.filter((o) => o.trim()).map((o, j) => `<li>${withKey && q.answer === String(j) ? "✅ " : "◯ "}(${LETTERS[j]}) ${esc(o)}</li>`).join("")}</ol>`;
    else if (q.type === "tf") body = `<p>${withKey ? `الإجابة: <b>${q.answer === "t" ? "صح ✓" : "خطأ ✗"}</b>` : "(&nbsp;&nbsp;&nbsp;&nbsp;) صح &nbsp;&nbsp;&nbsp;&nbsp; (&nbsp;&nbsp;&nbsp;&nbsp;) خطأ"}</p>`;
    else if (withKey) body = `<div class="box" style="background:#F2FAF6">${esc(q.answer || "—").replace(/\n/g, "<br/>")}</div>`;
    else body = Array.from({ length: q.type === "essay" ? 8 : 2 }).map(() => blank("", true)).join("");
    return `<div style="margin:10px 0 14px;page-break-inside:avoid">${head}${body}</div>`;
  }).join("");
  return printPaper(paperDocument({
    theme: "academic", title: withKey ? `نموذج الإجابة — ${e.title}` : e.title, subtitle: [e.subject, e.grade].filter(Boolean).join(" — "),
    bodyHtml: `<div class="box kv"><div>المدرسة: <b>${esc(e.school || "—")}</b></div><div>الزمن: <b>${esc(e.duration || "—")}</b></div><div>الدرجة الكلية: <b>${total}</b></div><div>عدد الأسئلة: <b>${e.questions.length}</b></div></div>
      ${withKey ? "" : `<div class="grid" style="margin-top:8px">${blank("اسم الطالب")}${blank("الفصل")}${blank("رقم الجلوس")}${blank("الدرجة")}</div>`}
      ${e.instructions.trim() ? `<h2>تعليمات</h2><p>${esc(e.instructions).replace(/\n/g, "<br/>")}</p>` : ""}
      <h2>الأسئلة</h2>${qs}<p style="text-align:center;margin-top:16px"><b>— انتهت الأسئلة، مع تمنياتنا بالتوفيق —</b></p>`,
    signatures: withKey ? ["معلم المادة"] : ["المصحّح", "المراجع"],
  }), e.title);
}

export default function ExamBuilder({ onBack }: { onBack: () => void }) {
  const { data, update } = useTeacherData();
  const [e, setE] = useState<Exam | null>(null);
  const total = e ? e.questions.reduce((t, q) => t + (Number(q.marks) || 0), 0) : 0;

  const save = () => {
    if (!e) return;
    if (e.title.trim().length < 2) return notify("عنوان الاختبار مطلوب");
    const bad = e.questions.findIndex((q) => !q.text.trim() || (q.type === "mcq" && q.options.filter((o) => o.trim()).length < 2));
    if (bad >= 0) return notify("سؤال غير مكتمل", `أكمل نص السؤال رقم ${bad + 1}${e.questions[bad].type === "mcq" ? " وخيارين على الأقل" : ""}.`);
    const x = { ...e, updated_at: Date.now() };
    update((d) => ({ ...d, exams: d.exams.some((y) => y.id === x.id) ? d.exams.map((y) => (y.id === x.id ? x : y)) : [x, ...d.exams] }));
    notify("تم حفظ الاختبار");
  };
  const setQ = (id: string, patch: Partial<Question>) => setE((x) => x && ({ ...x, questions: x.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  if (e) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ToolHeader title={e.title || "اختبار جديد"} sub={`${e.questions.length} سؤال · ${total} درجة`} onBack={() => setE(null)} />
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Field label="عنوان الاختبار *" value={e.title} onChangeText={(v) => setE({ ...e, title: v })} placeholder="اختبار الشهر الأول" />
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="المادة" value={e.subject} onChangeText={(v) => setE({ ...e, subject: v })} /></View>
            <View style={{ flex: 1 }}><Field label="الصف" value={e.grade} onChangeText={(v) => setE({ ...e, grade: v })} /></View>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="المدرسة" value={e.school} onChangeText={(v) => setE({ ...e, school: v })} /></View>
            <View style={{ flex: 1 }}><Field label="الزمن" value={e.duration} onChangeText={(v) => setE({ ...e, duration: v })} /></View>
          </View>
          <Field label="التعليمات" value={e.instructions} onChangeText={(v) => setE({ ...e, instructions: v })} multiline />

          {e.questions.map((q, i) => (
            <Card key={q.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                <Text style={st.qn}>س{i + 1}</Text>
                <Text style={st.qtype}>{TYPES.find((t) => t.k === q.type)?.t}</Text>
                <View style={{ flex: 1 }} />
                <TextInput style={st.marks} value={String(q.marks)} onChangeText={(v) => setQ(q.id, { marks: Number(v.replace(/[^\d.]/g, "")) || 0 })} keyboardType="decimal-pad" textAlign="center" />
                <Text style={st.meta}>درجة</Text>
                <Pressable hitSlop={8} onPress={() => setE({ ...e, questions: e.questions.filter((x) => x.id !== q.id) })}><Ionicons name="trash-outline" size={18} color="#D93636" /></Pressable>
              </View>
              <Field value={q.text} onChangeText={(v) => setQ(q.id, { text: v })} placeholder="نص السؤال" multiline />
              {q.type === "mcq" && q.options.map((o, j) => (
                <View key={j} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Pressable onPress={() => setQ(q.id, { answer: String(j) })}>
                    <Ionicons name={q.answer === String(j) ? "radio-button-on" : "radio-button-off"} size={20} color={q.answer === String(j) ? "#0E8A5F" : Colors.textMuted} />
                  </Pressable>
                  <Text style={st.letter}>{LETTERS[j]}</Text>
                  <View style={{ flex: 1 }}><Field value={o} onChangeText={(v) => setQ(q.id, { options: q.options.map((x, k) => (k === j ? v : x)) })} placeholder={`الخيار ${LETTERS[j]}`} /></View>
                </View>
              ))}
              {q.type === "mcq" && q.options.length < 6 && <Pressable onPress={() => setQ(q.id, { options: [...q.options, ""] })}><Text style={st.link}>+ خيار آخر</Text></Pressable>}
              {q.type === "tf" && (
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  {[["t", "صح"], ["f", "خطأ"]].map(([k, t]) => (
                    <Pressable key={k} onPress={() => setQ(q.id, { answer: k })} style={[st.tf, q.answer === k && { backgroundColor: "#0E8A5F", borderColor: "#0E8A5F" }]}>
                      <Text style={[st.tfText, q.answer === k && { color: "#fff" }]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {(q.type === "short" || q.type === "essay") && <Field value={q.answer} onChangeText={(v) => setQ(q.id, { answer: v })} placeholder="الإجابة النموذجية (تظهر في نموذج الإجابة فقط)" multiline />}
            </Card>
          ))}

          <Text style={st.addLabel}>إضافة سؤال</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
            {TYPES.map((t) => (
              <Pressable key={t.k} onPress={() => setE({ ...e, questions: [...e.questions, newQ(t.k)] })} style={st.addBtn}>
                <Ionicons name={t.icon} size={16} color={EDU.ink} /><Text style={st.addText}>{t.t}</Text>
              </Pressable>
            ))}
          </View>
          <Btn title="حفظ الاختبار" icon="checkmark" onPress={save} />
          {e.questions.length > 0 && (
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <Btn title="ورقة الأسئلة" icon="print-outline" color={EDU.teal} onPress={() => printExam(e, false)} style={{ flex: 1 }} />
              <Btn title="نموذج الإجابة" icon="key-outline" color={EDU.gold} onPress={() => printExam(e, true)} style={{ flex: 1 }} />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="منشئ الاختبارات" sub="ورقة امتحان رسمية + نموذج إجابة" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}>
        <Btn title="اختبار جديد" icon="add-circle-outline" color={EDU.teal} onPress={() => setE(newExam())} />
        {data.exams.length === 0 ? <Empty icon="document-text-outline" title="لا توجد اختبارات" sub="أنشئ أسئلتك مرة واحدة واطبع ورقة الامتحان ونموذج الإجابة بتنسيق رسمي." /> :
          data.exams.map((x) => (
            <Card key={x.id} onPress={() => setE(x)}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                <View style={st.icon}><Ionicons name="document-text-outline" size={20} color={EDU.ink} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.title} numberOfLines={1}>{x.title}</Text>
                  <Text style={st.meta}>{[x.subject, x.grade, `${x.questions.length} سؤال`].filter(Boolean).join(" · ")}</Text>
                </View>
                <Pressable hitSlop={8} onPress={async () => { if (await confirmAction("حذف الاختبار", `حذف «${x.title}»؟`, "حذف", true)) update((d) => ({ ...d, exams: d.exams.filter((y) => y.id !== x.id) })); }}>
                  <Ionicons name="trash-outline" size={19} color="#D93636" />
                </Pressable>
              </View>
            </Card>
          ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: EDU.soft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  qn: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", backgroundColor: EDU.ink, paddingHorizontal: 9, borderRadius: 8, overflow: "hidden" },
  qtype: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: EDU.teal },
  marks: { width: 50, height: 34, borderRadius: 8, borderWidth: 1, borderColor: EDU.line, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, backgroundColor: "#F7FAF9" },
  letter: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.ink, width: 18, textAlign: "center" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.teal, textAlign: "right" },
  tf: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: EDU.line, alignItems: "center" },
  tfText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.ink },
  addLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.ink, textAlign: "right", marginTop: 4 },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: EDU.line },
  addText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: EDU.ink },
});
