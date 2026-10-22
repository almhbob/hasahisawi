// تحضير الدروس: نموذج تحضير احترافي يُحفظ على الجهاز ويُطبع على ورق رسمي.
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { confirmAction, notify } from "@/lib/xplatform";
import { paperDocument, printPaper, esc } from "@/lib/paper";
import { ToolHeader, Field, Btn, Card, Empty, EDU } from "@/components/edu/ui";
import { useTeacherData, uid, today, type LessonPlan } from "@/lib/edu-store";

const EMPTY = (): LessonPlan => ({ id: uid(), title: "", subject: "", grade: "", date: today(), duration: "45 دقيقة", objectives: "", materials: "", warmup: "", steps: "", activities: "", assessment: "", homework: "", notes: "", updated_at: Date.now() });

const SECTIONS: { key: keyof LessonPlan; label: string; ph: string }[] = [
  { key: "objectives", label: "الأهداف السلوكية", ph: "أن يذكر الطالب...\nأن يحلّ الطالب..." },
  { key: "materials", label: "الوسائل والمصادر", ph: "السبورة، الكتاب المدرسي ص 24، بطاقات..." },
  { key: "warmup", label: "التمهيد / التهيئة", ph: "سؤال مثير أو ربط بالدرس السابق" },
  { key: "steps", label: "خطوات العرض", ph: "1) ...\n2) ...\n3) ..." },
  { key: "activities", label: "الأنشطة والتطبيق", ph: "نشاط جماعي، تمرين على السبورة..." },
  { key: "assessment", label: "التقويم", ph: "أسئلة ختامية للتحقق من الأهداف" },
  { key: "homework", label: "الواجب المنزلي", ph: "تمارين ص 30 (1، 2، 5)" },
  { key: "notes", label: "ملاحظات المعلم", ph: "" },
];

const nl = (t: string) => esc(t).replace(/\n/g, "<br/>");

export function printLesson(p: LessonPlan) {
  const blocks = SECTIONS.filter((x) => String(p[x.key] || "").trim()).map((x) => `<h2>${x.label}</h2><p>${nl(String(p[x.key]))}</p>`).join("");
  return printPaper(paperDocument({
    theme: "academic", title: "تحضير درس", subtitle: p.title,
    bodyHtml: `<div class="box kv"><div>المادة: <b>${esc(p.subject || "—")}</b></div><div>الصف: <b>${esc(p.grade || "—")}</b></div><div>التاريخ: <b>${esc(p.date)}</b></div><div>زمن الحصة: <b>${esc(p.duration || "—")}</b></div></div>${blocks}`,
    signatures: ["توقيع المعلم", "توقيع الموجّه التربوي"],
  }), `تحضير ${p.title}`);
}

export default function LessonPlanner({ onBack }: { onBack: () => void }) {
  const { data, update } = useTeacherData();
  const [edit, setEdit] = useState<LessonPlan | null>(null);

  const save = () => {
    if (!edit) return;
    if (edit.title.trim().length < 2) return notify("عنوان الدرس مطلوب");
    const p = { ...edit, updated_at: Date.now() };
    update((d) => ({ ...d, lessons: d.lessons.some((x) => x.id === p.id) ? d.lessons.map((x) => (x.id === p.id ? p : x)) : [p, ...d.lessons] }));
    setEdit(null);
  };

  if (edit) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ToolHeader title={edit.title || "درس جديد"} sub="تحضير الدرس" onBack={() => setEdit(null)} />
        <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Field label="عنوان الدرس *" value={edit.title} onChangeText={(v) => setEdit({ ...edit, title: v })} placeholder="المعادلات من الدرجة الثانية" />
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="المادة" value={edit.subject} onChangeText={(v) => setEdit({ ...edit, subject: v })} placeholder="الرياضيات" /></View>
            <View style={{ flex: 1 }}><Field label="الصف" value={edit.grade} onChangeText={(v) => setEdit({ ...edit, grade: v })} placeholder="الثاني ثانوي" /></View>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="التاريخ" value={edit.date} onChangeText={(v) => setEdit({ ...edit, date: v })} placeholder="2026-11-01" /></View>
            <View style={{ flex: 1 }}><Field label="زمن الحصة" value={edit.duration} onChangeText={(v) => setEdit({ ...edit, duration: v })} /></View>
          </View>
          {SECTIONS.map((x) => (
            <Field key={x.key} label={x.label} value={String(edit[x.key] ?? "")} onChangeText={(v) => setEdit({ ...edit, [x.key]: v } as LessonPlan)} placeholder={x.ph} multiline />
          ))}
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <Btn title="حفظ" icon="checkmark" onPress={save} style={{ flex: 1 }} />
            <Btn title="طباعة" icon="print-outline" color={EDU.teal} onPress={() => printLesson(edit)} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="تحضير الدروس" sub="خطط دروس منظّمة جاهزة للطباعة" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}>
        <Btn title="تحضير درس جديد" icon="add-circle-outline" color={EDU.teal} onPress={() => setEdit(EMPTY())} />
        {data.lessons.length === 0 ? <Empty icon="book-outline" title="لا توجد دروس محضّرة" sub="حضّر درسك بالأهداف والخطوات والتقويم، واطبعه بتنسيق رسمي أنيق." /> :
          data.lessons.map((p) => (
            <Card key={p.id} onPress={() => setEdit(p)}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                <View style={st.icon}><Ionicons name="reader-outline" size={20} color={EDU.ink} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.title} numberOfLines={1}>{p.title}</Text>
                  <Text style={st.meta}>{[p.subject, p.grade, p.date].filter(Boolean).join(" · ")}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => printLesson(p)}><Ionicons name="print-outline" size={20} color={EDU.teal} /></Pressable>
                <Pressable hitSlop={8} onPress={async () => { if (await confirmAction("حذف التحضير", `حذف «${p.title}»؟`, "حذف", true)) update((d) => ({ ...d, lessons: d.lessons.filter((x) => x.id !== p.id) })); }}>
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
});
