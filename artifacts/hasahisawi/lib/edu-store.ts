// تخزين محلي لأدوات المعلم والطالب — يعمل بالكامل بدون إنترنت،
// ويُحفظ تلقائياً على الجهاز (مع نسخة احتياطية قابلة للمشاركة).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export type Student = { id: string; name: string; phone?: string };
export type Assessment = { id: string; title: string; max: number; weight?: number; date?: string };
export type AttMark = "p" | "a" | "l" | "e"; // حاضر، غائب، متأخر، بعذر
export type ClassRoom = {
  id: string; name: string; subject: string; school?: string; year?: string;
  students: Student[];
  assessments: Assessment[];
  scores: Record<string, Record<string, number>>;          // assessmentId → studentId → score
  attendance: Record<string, Record<string, AttMark>>;     // yyyy-mm-dd → studentId → mark
  created_at: number;
};
export type LessonPlan = {
  id: string; title: string; subject: string; grade: string; date: string; duration: string;
  objectives: string; materials: string; warmup: string; steps: string; activities: string;
  assessment: string; homework: string; notes: string; updated_at: number;
};
export type QType = "mcq" | "tf" | "short" | "essay";
export type Question = { id: string; type: QType; text: string; options: string[]; answer: string; marks: number };
export type Exam = {
  id: string; title: string; subject: string; grade: string; school: string; duration: string;
  instructions: string; questions: Question[]; updated_at: number;
};
export type TeacherData = { classes: ClassRoom[]; lessons: LessonPlan[]; exams: Exam[] };

export type StudyBlock = { id: string; day: number; time: string; subject: string; done?: boolean };
export type Flashcard = { id: string; front: string; back: string; known?: boolean };
export type Deck = { id: string; title: string; subject: string; cards: Flashcard[] };
export type StudentData = { plan: StudyBlock[]; decks: Deck[] };

const TEACHER_KEY = "edu_teacher_v1";
const STUDENT_KEY = "edu_student_v1";

function usePersisted<T>(key: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    AsyncStorage.getItem(key).then((raw) => {
      try { if (raw) setData({ ...initial, ...JSON.parse(raw) }); } catch {}
      setReady(true);
    }).catch(() => setReady(true));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; return; }
    AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
  }, [key, data, ready]);
  const update = useCallback((fn: (d: T) => T) => setData((d) => fn(d)), []);
  return { data, update, ready, replace: setData };
}

export const useTeacherData = () => usePersisted<TeacherData>(TEACHER_KEY, { classes: [], lessons: [], exams: [] });
export const useStudentData = () => usePersisted<StudentData>(STUDENT_KEY, { plan: [], decks: [] });

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Total + percentage for a student across a class's assessments (missing = not counted). */
export function studentTotals(c: ClassRoom, studentId: string) {
  let got = 0, max = 0, missing = 0;
  for (const a of c.assessments) {
    const v = c.scores[a.id]?.[studentId];
    if (typeof v === "number" && !isNaN(v)) { got += v; max += a.max; } else missing++;
  }
  return { got, max, pct: max ? (got / max) * 100 : 0, missing };
}

export function attendanceStats(c: ClassRoom, studentId: string) {
  let p = 0, a = 0, l = 0, e = 0;
  for (const day of Object.values(c.attendance)) {
    const m = day[studentId];
    if (m === "p") p++; else if (m === "a") a++; else if (m === "l") l++; else if (m === "e") e++;
  }
  const total = p + a + l + e;
  return { p, a, l, e, total, rate: total ? ((p + l) / total) * 100 : 0 };
}
