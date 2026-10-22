// مساحة الطالب والمعلم — أدوات تعليمية احترافية تعمل بدون إنترنت.
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, BackHandler } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import { Segmented, ToolHeader, EDU } from "@/components/edu/ui";
import ShahadaCalculator from "@/components/edu/ShahadaCalculator";
import TeacherClasses from "@/components/edu/TeacherClasses";
import LessonPlanner from "@/components/edu/LessonPlanner";
import ExamBuilder from "@/components/edu/ExamBuilder";
import { StudyPlanner, Flashcards } from "@/components/edu/StudentTools";
import type { StudentData, TeacherData } from "@/lib/edu-store";

type Role = "student" | "teacher";
type ToolId = "shahada" | "planner" | "cards" | "classes" | "lessons" | "exams";
type Tool = { id: ToolId | "library" | "upload"; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string };

const STUDENT: Tool[] = [
  { id: "shahada", title: "حاسبة الشهادة", sub: "كل مادة من 100 · النسبة والتقدير والهدف", icon: "ribbon-outline", color: "#7C3AED" },
  { id: "planner", title: "جدول المذاكرة", sub: "خطة أسبوعية مع متابعة الإنجاز", icon: "calendar-outline", color: "#0E8A5F" },
  { id: "cards", title: "بطاقات المراجعة", sub: "احفظ القوانين والمصطلحات بسرعة", icon: "albums-outline", color: "#C2580A" },
  { id: "library", title: "المكتبة المنهجية", sub: "كتب المنهج السوداني لكل المراحل", icon: "library-outline", color: "#1D66D4" },
];
const TEACHER: Tool[] = [
  { id: "classes", title: "فصولي ودفتر الدرجات", sub: "الطلاب · الدرجات · الحضور · التقارير", icon: "people-outline", color: "#12355B" },
  { id: "lessons", title: "تحضير الدروس", sub: "أهداف وخطوات وتقويم — جاهز للطباعة", icon: "reader-outline", color: "#2F7D6D" },
  { id: "exams", title: "منشئ الاختبارات", sub: "ورقة أسئلة رسمية + نموذج إجابة", icon: "document-text-outline", color: "#B78200" },
  { id: "upload", title: "شارك موادك", sub: "ارفع الكتب والملخصات للمكتبة", icon: "cloud-upload-outline", color: "#1D66D4" },
];
const ROLE_KEY = "edu_hub_role";

export default function EduHub() {
  const params = useLocalSearchParams<{ role?: string; tool?: string }>();
  const [role, setRole] = useState<Role>(params.role === "teacher" ? "teacher" : "student");
  const [tool, setTool] = useState<ToolId | null>((params.tool as ToolId) || null);
  const [t, setT] = useState<TeacherData>({ classes: [], lessons: [], exams: [] });
  const [s, setS] = useState<StudentData>({ plan: [], decks: [] });
  // إحصاءات محدّثة كلما عدنا من أداة.
  useEffect(() => {
    if (tool) return;
    AsyncStorage.multiGet(["edu_teacher_v1", "edu_student_v1"]).then(([a, b]) => {
      try { if (a[1]) setT({ classes: [], lessons: [], exams: [], ...JSON.parse(a[1]) }); } catch {}
      try { if (b[1]) setS({ plan: [], decks: [], ...JSON.parse(b[1]) }); } catch {}
    }).catch(() => {});
  }, [tool]);

  useEffect(() => { if (!params.role) AsyncStorage.getItem(ROLE_KEY).then((r) => { if (r === "teacher" || r === "student") setRole(r); }).catch(() => {}); }, [params.role]);
  useEffect(() => { AsyncStorage.setItem(ROLE_KEY, role).catch(() => {}); }, [role]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (tool) { setTool(null); return true; } return false; });
    return () => sub.remove();
  }, [tool]);

  const close = () => setTool(null);
  if (tool === "shahada") return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="حاسبة درجات الشهادة" sub="كل مادة من 100" onBack={close} />
      <View style={{ flex: 1, padding: 14 }}><ShahadaCalculator /></View>
    </View>
  );
  if (tool === "planner") return <StudyPlanner onBack={close} />;
  if (tool === "cards") return <Flashcards onBack={close} />;
  if (tool === "classes") return <TeacherClasses onBack={close} />;
  if (tool === "lessons") return <LessonPlanner onBack={close} />;
  if (tool === "exams") return <ExamBuilder onBack={close} />;

  const tools = role === "student" ? STUDENT : TEACHER;
  const stats = role === "teacher"
    ? [[t.classes.length, "فصول"], [t.classes.reduce((n, c) => n + c.students.length, 0), "طالب"], [t.lessons.length, "دروس محضّرة"], [t.exams.length, "اختبارات"]]
    : [[s.plan.length, "حصص مذاكرة"], [s.plan.filter((b) => b.done).length, "منجزة"], [s.decks.length, "مجموعات"], [s.decks.reduce((n, d) => n + d.cards.length, 0), "بطاقة"]];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ModernHeader title="مساحة الطالب والمعلم" subtitle="أدوات تعليمية تعمل حتى بدون إنترنت" icon="school-outline" showBack onBack={() => router.back()}>
        <Segmented value={role} onChange={setRole} options={[{ key: "student", label: "🎓 أنا طالب" }, { key: "teacher", label: "👨‍🏫 أنا معلم" }]} />
      </ModernHeader>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}>
        <View style={st.stats}>
          {stats.map(([v, l]) => (
            <View key={String(l)} style={st.stat}><Text style={st.statV}>{v}</Text><Text style={st.statL}>{l}</Text></View>
          ))}
        </View>
        <View style={st.grid}>
          {tools.map((x) => (
            <Pressable key={x.id} style={({ pressed }) => [st.tile, pressed && { transform: [{ scale: 0.98 }] }]}
              onPress={() => (x.id === "library" ? router.push("/curriculum" as any) : x.id === "upload" ? router.push({ pathname: "/curriculum", params: { tab: "upload" } } as any) : setTool(x.id as ToolId))}>
              <View style={[st.tileIcon, { backgroundColor: x.color + "16" }]}><Ionicons name={x.icon} size={26} color={x.color} /></View>
              <Text style={st.tileTitle}>{x.title}</Text>
              <Text style={st.tileSub}>{x.sub}</Text>
            </Pressable>
          ))}
        </View>
        <View style={st.note}>
          <Ionicons name="shield-checkmark-outline" size={18} color={EDU.teal} />
          <Text style={st.noteText}>بياناتك محفوظة على جهازك ولا تُرسل لأي جهة، وتعمل الأدوات بالكامل بدون إنترنت. كل الكشوف والأوراق تُطبع أو تُحفظ PDF بتنسيق رسمي.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  stats: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: EDU.line, paddingVertical: 10, alignItems: "center" },
  statV: { fontFamily: "Cairo_700Bold", fontSize: 18, color: EDU.ink },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: EDU.line, padding: 14, gap: 6, minHeight: 150 },
  tileIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  tileTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: EDU.ink, textAlign: "right", marginTop: 4 },
  tileSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
  note: { flexDirection: "row-reverse", gap: 8, backgroundColor: EDU.soft, borderRadius: 14, padding: 12, alignItems: "flex-start" },
  noteText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: EDU.ink, textAlign: "right", lineHeight: 20 },
});
