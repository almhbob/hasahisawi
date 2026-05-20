import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Linking, TextInput, Modal, Alert, KeyboardAvoidingView, Pressable, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";

// ─── Keys ────────────────────────────────────────────────────────────────────
export const SCHOOLS_KEY = "edu_institutions_v2";
export const INSTITUTIONS_KEY = SCHOOLS_KEY;
const INST_KEY       = SCHOOLS_KEY;
const INST_INIT_KEY  = "edu_institutions_initialized_v2";
const REQ_KEY        = "edu_join_requests_v1";
const ADMIN_KEY      = "admin_logged_in";
const ADMIN_PIN_KEY  = "admin_pin";
const DEFAULT_PIN    = "4444";

// ─── Types ───────────────────────────────────────────────────────────────────
export type InstType =
  | "kindergarten" | "primary" | "secondary" | "university"
  | "institute"    | "training"| "quran"     | "private"   | "other";

export type ServiceType =
  | "results" | "enrollment" | "transfer" | "library"
  | "tutoring"| "scholarship"| "activity" | "textbooks"
  | "guidance"| "exam"       | "transport"| "office";

export type Institution = {
  id: string;
  name: string;
  type: InstType;
  address: string;
  phone: string;
  principal?: string;
  email?: string;
  website?: string;
  description?: string;
  grades?: string;
  shifts?: string;
  services: ServiceType[];
  status: "active" | "pending" | "rejected";
  createdAt: string;
};

export type JoinRequest = {
  id: string;
  institutionName: string;
  instType: InstType;
  address: string;
  phone: string;
  contactName: string;
  email?: string;
  description?: string;
  requestedServices: ServiceType[];
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt: string;
};

// ─── Lookups ─────────────────────────────────────────────────────────────────
const INST_LABELS: Record<InstType, string> = {
  kindergarten: "روضة أطفال",
  primary:      "مدرسة أساسية",
  secondary:    "مدرسة ثانوية",
  university:   "جامعة / كلية",
  institute:    "معهد تقني",
  training:     "مركز تدريب",
  quran:        "خلوة / حفظ قرآن",
  private:      "مدرسة خاصة",
  other:        "أخرى",
};
const INST_ICONS: Record<InstType, string> = {
  kindergarten: "happy-outline",
  primary:      "school-outline",
  secondary:    "library-outline",
  university:   "business-outline",
  institute:    "hardware-chip-outline",
  training:     "barbell-outline",
  quran:        "star-outline",
  private:      "ribbon-outline",
  other:        "grid-outline",
};
const INST_COLORS: Record<InstType, string> = {
  kindergarten: "#E67E22",
  primary:      Colors.primary,
  secondary:    "#2E7D9A",
  university:   Colors.accent,
  institute:    "#6A5ACD",
  training:     "#1E6E8A",
  quran:        "#27AE60",
  private:      "#C0392B",
  other:        Colors.textSecondary,
};
const SVC_LABELS: Record<ServiceType, string> = {
  results:    "نتائج الشهادة",
  enrollment: "قيد التلاميذ",
  transfer:   "نقل الوثائق",
  library:    "المكتبة",
  tutoring:   "دروس خصوصية",
  scholarship:"المنح الدراسية",
  activity:   "النشاط الطلابي",
  textbooks:  "الكتب المدرسية",
  guidance:   "التوجيه والإرشاد",
  exam:       "الاستعداد للامتحانات",
  transport:  "المواصلات المدرسية",
  office:     "مكتب التربية",
};

// ─── Seed Institutions ───────────────────────────────────────────────────────
const SEED_INSTITUTIONS: Institution[] = [
  {
    id:"i1", name:"مدرسة الحصاحيصا الأساسية الأولى", type:"primary",
    address:"حي الضحى، الحصاحيصا", phone:"+249912345700",
    principal:"الأستاذ/ أحمد محمد علي",
    grades:"الصف الأول – الثامن", shifts:"صباحية",
    services:["enrollment","transfer","textbooks","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i2", name:"مدرسة البنات الأساسية", type:"primary",
    address:"حي السلام، الحصاحيصا", phone:"+249912345701",
    principal:"الأستاذة/ فاطمة إبراهيم",
    grades:"الصف الأول – الثامن", shifts:"صباحية",
    services:["enrollment","transfer","textbooks"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i3", name:"ثانوية الحصاحيصا الكبرى", type:"secondary",
    address:"المنطقة المركزية، الحصاحيصا", phone:"+249912345702",
    principal:"الأستاذ/ محمد الأمين",
    grades:"الصف التاسع – الثاني عشر", shifts:"صباحية ومسائية",
    services:["results","enrollment","transfer","activity","guidance","exam","textbooks"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i4", name:"ثانوية البنات بالحصاحيصا", type:"secondary",
    address:"شارع المدارس، الحصاحيصا", phone:"+249912345703",
    principal:"الأستاذة/ آمنة عبدالله",
    grades:"الصف التاسع – الثاني عشر", shifts:"صباحية",
    services:["results","enrollment","transfer","activity","exam"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i5", name:"معهد التقنية والحاسوب", type:"institute",
    address:"شارع السوق، الحصاحيصا", phone:"+249912345704",
    principal:"الأستاذ/ عمر محمد",
    grades:"شهادة تقنية ومهنية", shifts:"صباحية ومسائية",
    services:["enrollment","scholarship","tutoring","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i6", name:"كلية الحصاحيصا الجامعية", type:"university",
    address:"جنوب الحصاحيصا", phone:"+249912345705",
    principal:"الدكتور/ يوسف الحسن",
    grades:"بكالوريوس", shifts:"صباحية",
    services:["enrollment","scholarship","library","activity","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i7", name:"روضة الزهور", type:"kindergarten",
    address:"حي الأزهار، الحصاحيصا", phone:"+249912345706",
    grades:"3 – 6 سنوات", shifts:"صباحية",
    services:["enrollment","activity"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i8", name:"خلوة الشيخ عبدالرحمن", type:"quran",
    address:"حي الإسلامي، الحصاحيصا", phone:"+249912345707",
    grades:"جميع الأعمار", shifts:"صباحية ومسائية",
    services:["enrollment","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
];

// ─── Public Type Alias ───────────────────────────────────────────────────────
export type School = Institution;

// ─── Public Helpers ───────────────────────────────────────────────────────────
export function getInstitutionTypeLabel(type: InstType, _t?: unknown): string { return INST_LABELS[type] ?? type; }
export function getInstitutionTypeIcon(type: InstType, _t?: unknown): string  { return INST_ICONS[type] ?? "grid-outline"; }
export function getInstitutionTypeColor(type: InstType, _t?: unknown): string { return INST_COLORS[type] ?? Colors.primary; }
export const getSchoolTypeLabel = getInstitutionTypeLabel;
export const getSchoolTypeIcon  = getInstitutionTypeIcon;
export const getSchoolTypeColor = getInstitutionTypeColor;
export async function loadSchools(): Promise<Institution[]> { return loadInstitutions(); }

// ─── API + Storage Helpers ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInstitution(row: any): Institution {
  return {
    id: String(row.id),
    name: row.name,
    type: row.type as InstType,
    address: row.address || "",
    phone: row.phone || "",
    principal: row.principal || undefined,
    email: row.email || undefined,
    website: row.website || undefined,
    description: row.description || undefined,
    grades: row.grades || undefined,
    shifts: row.shifts || undefined,
    services: (row.services || []) as ServiceType[],
    status: row.status as "active" | "pending" | "rejected",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export async function loadInstitutions(): Promise<Institution[]> {
  try {
    const res = await fetchWithTimeout(`${getApiUrl()}/api/educational-institutions`);
    if (res.ok) {
      const data = await res.json();
      return (data.institutions || []).map(mapInstitution);
    }
  } catch { /* offline */ }
  return [];
}
async function saveInstitutions(_list: Institution[]) {
  // no-op: admin now manages via backend dashboard
}
async function loadRequests(): Promise<JoinRequest[]> {
  const raw = await AsyncStorage.getItem(REQ_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveRequests(list: JoinRequest[]) {
  await AsyncStorage.setItem(REQ_KEY, JSON.stringify(list));
}
async function getAdminPin(): Promise<string> {
  return DEFAULT_PIN;
}

// ─── Student Tools Data ───────────────────────────────────────────────────────
const STUDENT_TOOLS = [
  { id:"gpa",      icon:"calculator-outline",      color:"#2E7D9A",      title:"حاسبة المعدل",             tag:"حاسبة" },
  { id:"countdown",icon:"timer-outline",            color:"#E74C3C",      title:"العداد التنازلي للشهادة",  tag:"الامتحانات" },
  { id:"timer",    icon:"hourglass-outline",        color:Colors.primary, title:"مؤقت المذاكرة",            tag:"تركيز" },
  { id:"tasks",    icon:"checkmark-circle-outline", color:"#27AE60",      title:"مهامي الدراسية",           tag:"تنظيم" },
  { id:"shahada",  icon:"ribbon-outline",           color:"#8E44AD",      title:"حاسبة درجات الشهادة",      tag:"شهادة سودانية" },
  { id:"tips",     icon:"bulb-outline",             color:Colors.accent,  title:"نصائح الاستذكار",          tag:"إرشادات" },
  { id:"calendar", icon:"calendar-outline",         color:"#16A085",      title:"التقويم الدراسي",           tag:"مواعيد" },
  { id:"schedule", icon:"time-outline",             color:"#6A5ACD",      title:"جدولي اليومي",              tag:"جدول" },
];
type StudentTool = typeof STUDENT_TOOLS[0];

const INST_TYPE_FILTERS: { key: "all" | InstType; label: string }[] = [
  { key:"all",          label:"الكل" },
  { key:"primary",      label:"أساسي" },
  { key:"secondary",    label:"ثانوي" },
  { key:"kindergarten", label:"رياض" },
  { key:"university",   label:"جامعي" },
  { key:"institute",    label:"معاهد" },
  { key:"training",     label:"تدريب" },
  { key:"quran",        label:"قرآن" },
  { key:"private",      label:"خاص" },
];

const ALL_SVC_TYPES: ServiceType[] = ["results","enrollment","transfer","library","tutoring","scholarship","activity","textbooks","guidance","exam","transport","office"];

// ─── Tool: GPA Calculator ─────────────────────────────────────────────────────
function GpaCalculator() {
  const [rows, setRows] = useState([{ subject:"", grade:"" }]);
  const validRows = rows.filter(r => r.subject.trim() && r.grade.trim() !== "" && !isNaN(Number(r.grade)));
  const avg = validRows.length > 0 ? validRows.reduce((s,r) => s + Math.min(Number(r.grade), 100), 0) / validRows.length : 0;
  const avgColor = avg >= 80 ? Colors.primary : avg >= 60 ? Colors.accent : "#E74C3C";
  return (
    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 20 }}>
      {rows.map((row, i) => (
        <View key={i} style={tl.gpaRow}>
          <TouchableOpacity hitSlop={8} onPress={() => setRows(r => r.filter((_,j) => j !== i))}>
            <Ionicons name="close-circle-outline" size={20} color={Colors.danger + "80"} />
          </TouchableOpacity>
          <TextInput style={[tl.gpaInput, { width:64 }]} value={row.grade}
            onChangeText={v => setRows(r => r.map((x,j) => j===i ? {...x, grade:v} : x))}
            placeholder="الدرجة" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" maxLength={3} />
          <TextInput style={[tl.gpaInput, { flex:1 }]} value={row.subject}
            onChangeText={v => setRows(r => r.map((x,j) => j===i ? {...x, subject:v} : x))}
            placeholder="اسم المادة" placeholderTextColor={Colors.textMuted} textAlign="right" />
        </View>
      ))}
      <TouchableOpacity style={tl.addRow} onPress={() => setRows(r => [...r, { subject:"", grade:"" }])}>
        <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
        <Text style={tl.addRowText}>إضافة مادة</Text>
      </TouchableOpacity>
      {validRows.length > 0 && (
        <View style={[tl.resultBox, { borderColor: avgColor+"50", backgroundColor: avgColor+"12" }]}>
          <Text style={tl.resultLabel}>المعدل العام</Text>
          <Text style={[tl.resultValue, { color: avgColor }]}>{avg.toFixed(1)}%</Text>
          <Text style={[tl.resultSub, { color: avgColor }]}>
            {avg>=85?"ممتاز":avg>=75?"جيد جداً":avg>=65?"جيد":avg>=50?"مقبول":"دون المتوسط"}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tool: Exam Countdown ─────────────────────────────────────────────────────
function ExamCountdown() {
  const target = new Date("2026-05-26T08:00:00");
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const diff = target.getTime() - now.getTime();
  const past = diff <= 0;
  const days  = Math.max(0, Math.floor(diff / 86400000));
  const hours = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const mins  = Math.max(0, Math.floor((diff % 3600000)  / 60000));
  const secs  = Math.max(0, Math.floor((diff % 60000)    / 1000));
  return (
    <View style={{ alignItems:"center", paddingVertical:12, gap:16 }}>
      <Text style={tl.cdTitle}>امتحانات الشهادة السودانية 2026</Text>
      {past ? <Text style={[tl.cdTitle, { color:Colors.primary }]}>انتهت الامتحانات — بالتوفيق!</Text> : (
        <>
          <View style={[tl.daysBox, { backgroundColor:Colors.danger+"15", borderColor:Colors.danger+"40" }]}>
            <Text style={[tl.daysNum, { color:Colors.danger }]}>{days}</Text>
            <Text style={tl.daysLabel}>يوم متبقٍ</Text>
          </View>
          <View style={tl.cdRow}>
            {[{ v:hours, l:"ساعة" }, { v:mins, l:"دقيقة" }, { v:secs, l:"ثانية" }].map((u,i,arr) => (
              <React.Fragment key={u.l}>
                <View style={{ alignItems:"center", gap:4 }}>
                  <View style={tl.cdUnit}><Text style={tl.cdUnitNum}>{String(u.v).padStart(2,"0")}</Text></View>
                  <Text style={tl.cdUnitLabel}>{u.l}</Text>
                </View>
                {i < arr.length-1 && <Text style={tl.cdSep}>:</Text>}
              </React.Fragment>
            ))}
          </View>
          <Text style={tl.cdHint}>ابدأ المذاكرة الآن — كل يوم يُحدث فرقاً!</Text>
        </>
      )}
    </View>
  );
}

// ─── Tool: Study Timer (Pomodoro) ─────────────────────────────────────────────
const POMODORO = 25 * 60;
function StudyTimer() {
  const [secs, setSecs]       = useState(POMODORO);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            setSessions(n => n + 1);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return POMODORO;
          }
          return s - 1;
        });
      }, 1000);
    } else { if (intervalRef.current) clearInterval(intervalRef.current); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);
  const mm = String(Math.floor(secs/60)).padStart(2,"0");
  const ss = String(secs%60).padStart(2,"0");
  const progress = (POMODORO - secs) / POMODORO;
  return (
    <View style={{ alignItems:"center", gap:20, paddingVertical:12 }}>
      <View style={[tl.timerCircle, { borderColor: running ? Colors.primary : Colors.divider }]}>
        <Text style={tl.timerText}>{mm}:{ss}</Text>
        <Text style={tl.timerSub}>{Math.round(progress*100)}% مكتمل</Text>
      </View>
      <View style={{ flexDirection:"row-reverse", gap:12 }}>
        <TouchableOpacity style={[tl.timerBtn, { backgroundColor:Colors.primary+"20", borderColor:Colors.primary }]}
          onPress={() => { if (Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setRunning(r=>!r); }}>
          <Ionicons name={running?"pause":"play"} size={20} color={Colors.primary} />
          <Text style={[tl.timerBtnText, { color:Colors.primary }]}>{running?"إيقاف مؤقت":"ابدأ"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[tl.timerBtn, { backgroundColor:Colors.bg, borderColor:Colors.divider }]}
          onPress={() => { setRunning(false); setSecs(POMODORO); }}>
          <Ionicons name="refresh" size={18} color={Colors.textMuted} />
          <Text style={[tl.timerBtnText, { color:Colors.textMuted }]}>إعادة</Text>
        </TouchableOpacity>
      </View>
      {sessions > 0 && (
        <View style={tl.sessionsRow}>
          {Array.from({ length:sessions }).map((_,i) => <View key={i} style={tl.sessionDot} />)}
          <Text style={tl.sessionsText}>{sessions} جلسة مكتملة</Text>
        </View>
      )}
      <Text style={tl.cdHint}>اعمل 25 دقيقة ثم استرح 5 دقائق</Text>
    </View>
  );
}

// ─── Tool: Task List ─────────────────────────────────────────────────────────
const TASKS_KEY = "student_tasks_v1";
type StudentTask = { id:string; subject:string; task:string; done:boolean; createdAt:string };
function TaskRow({ t, onToggle, onDelete }: { t:StudentTask; onToggle:(id:string)=>void; onDelete:(id:string)=>void }) {
  return (
    <View style={[tl.taskRow, t.done && { opacity:0.45 }]}>
      <TouchableOpacity hitSlop={8} onPress={() => onDelete(t.id)}>
        <Ionicons name="trash-outline" size={16} color={Colors.danger+"70"} />
      </TouchableOpacity>
      <View style={{ flex:1 }}>
        <Text style={[tl.taskText, t.done && { textDecorationLine:"line-through" }]}>{t.task}</Text>
        <Text style={tl.taskSubject}>{t.subject}</Text>
      </View>
      <TouchableOpacity onPress={() => onToggle(t.id)}>
        <Ionicons name={t.done?"checkmark-circle":"ellipse-outline"} size={22} color={t.done?Colors.primary:Colors.divider} />
      </TouchableOpacity>
    </View>
  );
}
function TaskListTool() {
  const [tasks, setTasks]     = useState<StudentTask[]>([]);
  const [subject, setSubject] = useState("");
  const [taskText, setTask]   = useState("");
  useEffect(() => { AsyncStorage.getItem(TASKS_KEY).then(r => { if(r) setTasks(JSON.parse(r)); }); }, []);
  const save = async (list: StudentTask[]) => { setTasks(list); await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(list)); };
  const add  = () => {
    if (!taskText.trim()) return;
    save([...tasks, { id:`t_${Date.now()}`, subject:subject.trim()||"عام", task:taskText.trim(), done:false, createdAt:new Date().toISOString() }]);
    setTask(""); setSubject("");
  };
  const pending = tasks.filter(t => !t.done);
  const done    = tasks.filter(t => t.done);
  return (
    <View style={{ flex:1, minHeight:200 }}>
      <View style={tl.taskInput}>
        <TextInput style={[tl.taskInputField, { width:72 }]} value={subject} onChangeText={setSubject} placeholder="المادة" placeholderTextColor={Colors.textMuted} textAlign="right" />
        <TextInput style={[tl.taskInputField, { flex:1 }]} value={taskText} onChangeText={setTask} placeholder="المهمة الدراسية..." placeholderTextColor={Colors.textMuted} textAlign="right" onSubmitEditing={add} returnKeyType="done" />
        <TouchableOpacity style={tl.taskAddBtn} onPress={add}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight:280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {pending.map(t => <TaskRow key={t.id} t={t} onToggle={id => save(tasks.map(x=>x.id===id?{...x,done:!x.done}:x))} onDelete={id => save(tasks.filter(x=>x.id!==id))} />)}
        {done.length > 0 && <Text style={tl.doneSep}>✓ المنجزة</Text>}
        {done.map(t => <TaskRow key={t.id} t={t} onToggle={id => save(tasks.map(x=>x.id===id?{...x,done:!x.done}:x))} onDelete={id => save(tasks.filter(x=>x.id!==id))} />)}
        {tasks.length === 0 && <Text style={tl.emptyTasks}>أضف مهامك الدراسية هنا</Text>}
      </ScrollView>
    </View>
  );
}

// ─── Tool: Shahada Calculator ─────────────────────────────────────────────────
const SHAHADA_SUBS = [
  { key:"arabic",   label:"اللغة العربية",        max:200 },
  { key:"english",  label:"اللغة الإنجليزية",      max:100 },
  { key:"math",     label:"الرياضيات",             max:200 },
  { key:"religion", label:"التربية الإسلامية",      max:100 },
  { key:"social",   label:"الدراسات الاجتماعية",   max:100 },
  { key:"physics",  label:"الفيزياء",               max:100 },
  { key:"chemistry",label:"الكيمياء",               max:100 },
  { key:"biology",  label:"الأحياء",                max:100 },
];
function ShahadaCalculator() {
  const [scores, setScores] = useState<Record<string,string>>({});
  const valid   = SHAHADA_SUBS.filter(s => scores[s.key] && !isNaN(Number(scores[s.key])));
  const total   = valid.reduce((s,sub) => s + Math.min(Number(scores[sub.key]), sub.max), 0);
  const maxTotal= valid.reduce((s,sub) => s + sub.max, 0);
  const pct     = maxTotal > 0 ? total / maxTotal * 100 : 0;
  const pctColor= pct>=85?"#27AE60":pct>=75?Colors.primary:pct>=65?Colors.accent:pct>=50?"#E67E22":Colors.danger;
  return (
    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom:16 }}>
      <Text style={[tl.cdHint, { marginBottom:12, textAlign:"right" }]}>أدخل درجاتك في كل مادة:</Text>
      {SHAHADA_SUBS.map(sub => (
        <View key={sub.key} style={tl.shahadaRow}>
          <Text style={tl.shahadaMax}>/{sub.max}</Text>
          <TextInput style={tl.shahadaInput} value={scores[sub.key]||""}
            onChangeText={v => setScores(s => ({...s, [sub.key]:v}))}
            placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" maxLength={3} />
          <Text style={tl.shahadaLabel}>{sub.label}</Text>
        </View>
      ))}
      {valid.length > 0 && (
        <View style={[tl.resultBox, { borderColor:pctColor+"50", backgroundColor:pctColor+"12", marginTop:12 }]}>
          <Text style={tl.resultLabel}>المجموع الكلي</Text>
          <Text style={[tl.resultValue, { color:pctColor }]}>{total} / {maxTotal}</Text>
          <Text style={[tl.resultSub, { color:pctColor }]}>
            {pct.toFixed(1)}% — {pct>=85?"ممتاز":pct>=75?"جيد جداً":pct>=65?"جيد":pct>=50?"مقبول":"دون المتوسط"}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Tool: Study Tips ────────────────────────────────────────────────────────
const TIPS_DATA: Record<string, string[]> = {
  "تنظيم الوقت":    ["ضع جدولاً أسبوعياً وحدد وقتاً ثابتاً للمذاكرة يومياً","ابدأ بالمواد الصعبة في أول الجلسة حين يكون تركيزك أعلى","خصص وقتاً للراحة — الدماغ يحتاج استراحات منتظمة ليُرسّخ المعلومات","استخدم تقنية بومودورو: 25 دقيقة مذاكرة ثم 5 دقائق استراحة"],
  "أساليب المذاكرة":["اشرح المعلومة بأسلوبك الخاص — هذا يُرسّخها في ذهنك","ارسم خرائط ذهنية للمفاهيم المعقدة وربطها ببعضها","راجع الدرس بعد 24 ساعة ثم بعد أسبوع ثم بعد شهر","حل أسئلة امتحانات سابقة بانتظام لتعرف نقاط ضعفك"],
  "قبل الامتحان":   ["نم 8 ساعات ليلة الامتحان — النوم يُعزز الذاكرة ويُحسّن التركيز","تناول وجبة متوازنة قبل الامتحان ولا تدخل بمعدة فارغة","راجع ملاحظاتك القصيرة فقط — لا الكتب الكاملة في اللحظات الأخيرة","تنفس بعمق إذا شعرت بتوتر داخل القاعة — الهدوء مفتاح النجاح"],
  "الصحة الدراسية": ["اشرب الماء بانتظام — الجفاف يُضعف التركيز بشكل ملحوظ","تحرك كل ساعة وامشِ قليلاً لتحسين الدورة الدموية للدماغ","ضع الهاتف بعيداً أثناء المذاكرة — كل إشعار يُضيع دقائق ثمينة","تذكر: التقدم التدريجي اليومي أفضل بكثير من الحفظ الليلي المتواصل"],
};
function StudyTips() {
  const cats = Object.keys(TIPS_DATA);
  const [cat, setCat] = useState(cats[0]);
  return (
    <View style={{ flex:1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingBottom:12 }} style={{ flexGrow:0 }}>
        {cats.map(c => (
          <TouchableOpacity key={c} style={[tl.tipCat, cat===c && { backgroundColor:Colors.accent+"25", borderColor:Colors.accent }]} onPress={() => setCat(c)}>
            <Text style={[tl.tipCatText, cat===c && { color:Colors.accent, fontFamily:"Cairo_600SemiBold" }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {TIPS_DATA[cat].map((tip, i) => (
          <View key={i} style={tl.tipItem}>
            <Text style={tl.tipNum}>{i+1}</Text>
            <Text style={tl.tipItemText}>{tip}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Tool: Academic Calendar ──────────────────────────────────────────────────
const CALENDAR_EVENTS = [
  { date:"سبتمبر 2025",  event:"بداية العام الدراسي 2025–2026",      color:Colors.primary },
  { date:"نوفمبر 2025",  event:"امتحانات الفصل الأول",                color:"#E74C3C" },
  { date:"ديسمبر 2025",  event:"إجازة منتصف العام الدراسي",           color:"#16A085" },
  { date:"يناير 2026",   event:"بداية الفصل الدراسي الثاني",          color:Colors.primary },
  { date:"مارس 2026",   event:"مراجعة نهاية الفصل الثاني",           color:Colors.accent },
  { date:"أبريل 2026",  event:"امتحانات نهاية العام للمرحلة الأساسية", color:"#E74C3C" },
  { date:"مايو 2026",   event:"امتحانات الشهادة السودانية (ثانوي)",    color:"#8E44AD" },
  { date:"يوليو 2026",  event:"إعلان نتائج الشهادة السودانية",        color:"#27AE60" },
  { date:"أغسطس 2026",  event:"التسجيل للعام الدراسي 2026–2027",      color:"#2E7D9A" },
];
function AcademicCalendar() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom:16 }}>
      {CALENDAR_EVENTS.map((ev, i) => (
        <View key={i} style={[tl.calRow, { borderRightColor:ev.color }]}>
          <Text style={tl.calEvent}>{ev.event}</Text>
          <View style={[tl.calDate, { backgroundColor:ev.color+"18" }]}>
            <Text style={[tl.calDateText, { color:ev.color }]}>{ev.date}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Tool: Daily Schedule ─────────────────────────────────────────────────────
const SCHEDULE_KEY = "student_schedule_v1";
const DEFAULT_SLOTS = ["06:00","07:00","08:00","09:00","10:00","11:00","14:00","15:00","16:00","20:00","21:00"].map((t,i) => ({ id:`s${i}`, time:t, subject:"" }));
function DailySchedule() {
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  useEffect(() => { AsyncStorage.getItem(SCHEDULE_KEY).then(r => { if(r) setSlots(JSON.parse(r)); }); }, []);
  const update = async (id:string, subject:string) => {
    const next = slots.map(s => s.id===id ? {...s, subject} : s);
    setSlots(next); await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(next));
  };
  return (
    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom:20 }}>
      <Text style={[tl.cdHint, { textAlign:"right", marginBottom:12 }]}>أدخل المادة لكل وقت — يُحفظ تلقائياً</Text>
      {slots.map(slot => (
        <View key={slot.id} style={tl.scheduleRow}>
          <TextInput style={tl.scheduleInput} value={slot.subject} onChangeText={v => update(slot.id, v)}
            placeholder="اسم المادة أو النشاط" placeholderTextColor={Colors.textMuted} textAlign="right" />
          <View style={tl.scheduleTime}>
            <Text style={tl.scheduleTimeText}>{slot.time}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Tool Modal (wraps all tools) ─────────────────────────────────────────────
function ToolModal({ tool, visible, onClose }: { tool:StudentTool|null; visible:boolean; onClose:()=>void }) {
  const insets = useSafeAreaInsets();
  if (!tool) return null;
  const renderContent = () => {
    switch (tool.id) {
      case "gpa":      return <GpaCalculator />;
      case "countdown":return <ExamCountdown />;
      case "timer":    return <StudyTimer />;
      case "tasks":    return <TaskListTool />;
      case "shahada":  return <ShahadaCalculator />;
      case "tips":     return <StudyTips />;
      case "calendar": return <AcademicCalendar />;
      case "schedule": return <DailySchedule />;
      default:         return null;
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={tl.backdrop} onPress={onClose}>
          <Pressable style={[tl.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            <View style={tl.handle} />
            <View style={tl.sheetHeader}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </TouchableOpacity>
              <Text style={tl.sheetTitle}>{tool.title}</Text>
              <View style={[tl.sheetIcon, { backgroundColor: tool.color+"20" }]}>
                <Ionicons name={tool.icon as any} size={22} color={tool.color} />
              </View>
            </View>
            <View style={{ flex:1 }}>
              {renderContent()}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const tl = StyleSheet.create({
  backdrop:     { flex:1, backgroundColor:"rgba(0,0,0,0.72)", justifyContent:"flex-end" },
  sheet:        { backgroundColor:Colors.cardBgElevated, borderTopLeftRadius:28, borderTopRightRadius:28, maxHeight:"88%", paddingHorizontal:20, paddingTop:8 },
  handle:       { width:40, height:4, borderRadius:2, backgroundColor:Colors.divider, alignSelf:"center", marginBottom:16 },
  sheetHeader:  { flexDirection:"row-reverse", alignItems:"center", gap:12, marginBottom:16 },
  sheetIcon:    { width:42, height:42, borderRadius:12, justifyContent:"center", alignItems:"center" },
  sheetTitle:   { fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textPrimary, flex:1, textAlign:"right" },
  gpaRow:       { flexDirection:"row-reverse", alignItems:"center", gap:8, marginBottom:10 },
  gpaInput:     { backgroundColor:Colors.bg, borderRadius:10, paddingHorizontal:10, paddingVertical:8, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  addRow:       { flexDirection:"row-reverse", alignItems:"center", gap:6, paddingVertical:8 },
  addRowText:   { fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.primary },
  resultBox:    { borderRadius:16, padding:16, alignItems:"center", borderWidth:1, marginTop:8 },
  resultLabel:  { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textSecondary, marginBottom:4 },
  resultValue:  { fontFamily:"Cairo_700Bold", fontSize:40 },
  resultSub:    { fontFamily:"Cairo_600SemiBold", fontSize:14, marginTop:6 },
  cdTitle:      { fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"center" },
  cdRow:        { flexDirection:"row-reverse", alignItems:"flex-start", gap:10 },
  cdSep:        { fontFamily:"Cairo_700Bold", fontSize:28, color:Colors.textMuted, marginTop:10 },
  cdUnit:       { backgroundColor:Colors.bg, borderRadius:12, width:62, height:62, justifyContent:"center", alignItems:"center", borderWidth:1, borderColor:Colors.divider },
  cdUnitNum:    { fontFamily:"Cairo_700Bold", fontSize:26, color:Colors.textPrimary },
  cdUnitLabel:  { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted },
  daysBox:      { borderRadius:20, paddingHorizontal:32, paddingVertical:16, alignItems:"center", borderWidth:1 },
  daysNum:      { fontFamily:"Cairo_700Bold", fontSize:56 },
  daysLabel:    { fontFamily:"Cairo_500Medium", fontSize:14, color:Colors.textSecondary },
  cdHint:       { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, textAlign:"center" },
  timerCircle:  { width:164, height:164, borderRadius:82, backgroundColor:Colors.bg, justifyContent:"center", alignItems:"center", borderWidth:3 },
  timerText:    { fontFamily:"Cairo_700Bold", fontSize:42, color:Colors.textPrimary },
  timerSub:     { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, marginTop:4 },
  timerBtn:     { flexDirection:"row-reverse", alignItems:"center", gap:8, paddingHorizontal:20, paddingVertical:12, borderRadius:14, borderWidth:1 },
  timerBtnText: { fontFamily:"Cairo_600SemiBold", fontSize:14 },
  sessionsRow:  { flexDirection:"row-reverse", alignItems:"center", gap:6, flexWrap:"wrap", justifyContent:"center" },
  sessionDot:   { width:10, height:10, borderRadius:5, backgroundColor:Colors.primary },
  sessionsText: { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textSecondary },
  taskInput:    { flexDirection:"row-reverse", gap:8, marginBottom:10, alignItems:"center" },
  taskInputField:{ backgroundColor:Colors.bg, borderRadius:10, paddingHorizontal:10, paddingVertical:8, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  taskAddBtn:   { width:36, height:36, borderRadius:10, backgroundColor:Colors.primary, justifyContent:"center", alignItems:"center" },
  taskRow:      { flexDirection:"row-reverse", alignItems:"center", gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:Colors.divider },
  taskText:     { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textPrimary, textAlign:"right" },
  taskSubject:  { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, textAlign:"right", marginTop:2 },
  doneSep:      { fontFamily:"Cairo_600SemiBold", fontSize:12, color:Colors.textMuted, textAlign:"right", paddingVertical:8 },
  emptyTasks:   { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textMuted, textAlign:"center", paddingVertical:20 },
  shahadaRow:   { flexDirection:"row-reverse", alignItems:"center", gap:10, paddingVertical:8, borderBottomWidth:1, borderBottomColor:Colors.divider },
  shahadaLabel: { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textPrimary, textAlign:"right", flex:1 },
  shahadaInput: { backgroundColor:Colors.bg, borderRadius:8, width:56, paddingVertical:8, fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider, textAlign:"center" },
  shahadaMax:   { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, minWidth:28, textAlign:"left" },
  tipCat:       { paddingHorizontal:14, paddingVertical:7, borderRadius:10, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider },
  tipCatText:   { fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textMuted },
  tipItem:      { flexDirection:"row-reverse", gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:Colors.divider, alignItems:"flex-start" },
  tipNum:       { width:24, height:24, borderRadius:12, backgroundColor:Colors.accent+"20", textAlign:"center", lineHeight:24, fontFamily:"Cairo_700Bold", fontSize:13, color:Colors.accent },
  tipItemText:  { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, textAlign:"right", flex:1, lineHeight:20 },
  calRow:       { flexDirection:"row-reverse", alignItems:"center", justifyContent:"space-between", gap:10, paddingVertical:10, paddingRight:10, borderBottomWidth:1, borderBottomColor:Colors.divider, borderRightWidth:3 },
  calDate:      { borderRadius:8, paddingHorizontal:8, paddingVertical:5, minWidth:100, alignItems:"center" },
  calDateText:  { fontFamily:"Cairo_600SemiBold", fontSize:11 },
  calEvent:     { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textPrimary, textAlign:"right", flex:1 },
  scheduleRow:  { flexDirection:"row-reverse", alignItems:"center", gap:10, marginBottom:8 },
  scheduleTime: { backgroundColor:Colors.primary+"18", borderRadius:8, paddingHorizontal:10, paddingVertical:9, minWidth:60, alignItems:"center" },
  scheduleTimeText:{ fontFamily:"Cairo_700Bold", fontSize:13, color:Colors.primary },
  scheduleInput:{ flex:1, backgroundColor:Colors.bg, borderRadius:10, paddingHorizontal:10, paddingVertical:9, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
});

// ─── Institution Card ─────────────────────────────────────────────────────────
function InstCard({ item, onCall, onApprove, onReject, isAdmin }: {
  item: Institution; onCall: (p:string)=>void;
  onApprove?: ()=>void; onReject?: ()=>void; isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = INST_COLORS[item.type];
  return (
    <View style={ic.card}>
      <LinearGradient colors={[color+"08", Colors.cardBg]} style={ic.gradient}>
        {/* Top Row */}
        <View style={ic.topRow}>
          <View style={[ic.iconBox, { backgroundColor: color+"20" }]}>
            <Ionicons name={INST_ICONS[item.type] as any} size={26} color={color} />
          </View>
          <View style={ic.infoBox}>
            <Text style={ic.name}>{item.name}</Text>
            <View style={ic.tagRow}>
              <View style={[ic.tag, { backgroundColor: color+"20" }]}>
                <Text style={[ic.tagText, { color }]}>{INST_LABELS[item.type]}</Text>
              </View>
              {item.status === "pending" && (
                <View style={[ic.tag, { backgroundColor: Colors.accent+"20" }]}>
                  <Text style={[ic.tagText, { color: Colors.accent }]}>قيد المراجعة</Text>
                </View>
              )}
              {item.status === "rejected" && (
                <View style={[ic.tag, { backgroundColor: Colors.danger+"20" }]}>
                  <Text style={[ic.tagText, { color: Colors.danger }]}>مرفوض</Text>
                </View>
              )}
            </View>
          </View>
          <AnimatedPress onPress={() => { if (Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(e=>!e); }}>
            <Ionicons name={expanded?"chevron-up":"chevron-down"} size={20} color={Colors.textMuted} />
          </AnimatedPress>
        </View>

        {/* Details */}
        {expanded && (
          <Animated.View entering={FadeInDown.duration(200)} style={ic.details}>
            <View style={ic.divider} />
            {item.principal && <DetailRow icon="person-outline" text={item.principal} />}
            <DetailRow icon="location-outline" text={item.address} />
            {item.grades && <DetailRow icon="layers-outline" text={`الصفوف: ${item.grades}`} />}
            {item.shifts && <DetailRow icon="time-outline" text={`الفترة: ${item.shifts}`} />}
            {item.email && <DetailRow icon="mail-outline" text={item.email} />}
            {/* Services Badges */}
            {item.services.length > 0 && (
              <View style={ic.svcsWrap}>
                {item.services.map(s => (
                  <View key={s} style={ic.svcBadge}>
                    <Text style={ic.svcBadgeText}>{SVC_LABELS[s]}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={ic.btns}>
              <AnimatedPress style={[ic.callBtn, { backgroundColor: color }]}
                onPress={() => onCall(item.phone)}>
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={ic.callBtnText}>اتصل</Text>
              </AnimatedPress>
              {isAdmin && onApprove && (
                <AnimatedPress style={[ic.actionBtn, { backgroundColor: Colors.primary+"20", borderColor: Colors.primary+"40" }]} onPress={onApprove}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
                  <Text style={[ic.actionBtnText, { color: Colors.primary }]}>تفعيل</Text>
                </AnimatedPress>
              )}
              {isAdmin && onReject && (
                <AnimatedPress style={[ic.actionBtn, { backgroundColor: Colors.danger+"20", borderColor: Colors.danger+"40" }]} onPress={onReject}>
                  <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                  <Text style={[ic.actionBtnText, { color: Colors.danger }]}>تعليق</Text>
                </AnimatedPress>
              )}
            </View>
          </Animated.View>
        )}
      </LinearGradient>
    </View>
  );
}
function DetailRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={ic.detailRow}>
      <Text style={ic.detailText}>{text}</Text>
      <Ionicons name={icon as any} size={13} color={Colors.textMuted} />
    </View>
  );
}
const ic = StyleSheet.create({
  card:      { borderRadius:16, marginBottom:12, overflow:"hidden", borderWidth:1, borderColor:Colors.divider },
  gradient:  { padding:16 },
  topRow:    { flexDirection:"row-reverse", alignItems:"center", gap:12 },
  iconBox:   { width:48, height:48, borderRadius:14, justifyContent:"center", alignItems:"center" },
  infoBox:   { flex:1 },
  name:      { fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"right" },
  tagRow:    { flexDirection:"row-reverse", gap:6, marginTop:4, flexWrap:"wrap" },
  tag:       { borderRadius:6, paddingHorizontal:8, paddingVertical:2 },
  tagText:   { fontFamily:"Cairo_500Medium", fontSize:11 },
  details:   { marginTop:12 },
  divider:   { height:1, backgroundColor:Colors.divider, marginBottom:12 },
  detailRow: { flexDirection:"row-reverse", alignItems:"center", gap:6, marginBottom:6 },
  detailText:{ fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"right", flex:1 },
  svcsWrap:  { flexDirection:"row-reverse", flexWrap:"wrap", gap:6, marginTop:8, marginBottom:12 },
  svcBadge:  { backgroundColor:Colors.primary+"15", borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:Colors.primary+"30" },
  svcBadgeText:{ fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.primary },
  btns:      { flexDirection:"row-reverse", gap:8, marginTop:4 },
  callBtn:   { flexDirection:"row-reverse", alignItems:"center", gap:6, paddingHorizontal:16, paddingVertical:8, borderRadius:10 },
  callBtnText:{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:"#fff" },
  actionBtn: { flexDirection:"row-reverse", alignItems:"center", gap:6, paddingHorizontal:12, paddingVertical:8, borderRadius:10, borderWidth:1 },
  actionBtnText:{ fontFamily:"Cairo_600SemiBold", fontSize:12 },
});

// ─── Join Request Card (Admin) ────────────────────────────────────────────────
function RequestCard({ req, onApprove, onReject }: {
  req: JoinRequest; onApprove: ()=>void; onReject: ()=>void;
}) {
  const color = INST_COLORS[req.instType] || Colors.textSecondary;
  const statusColor = req.status === "pending" ? Colors.accent : req.status === "approved" ? Colors.primary : Colors.danger;
  const statusLabel = req.status === "pending" ? "قيد المراجعة" : req.status === "approved" ? "تم القبول" : "مرفوض";
  return (
    <View style={rq.card}>
      <View style={rq.header}>
        <View style={[rq.statusBadge, { backgroundColor: statusColor+"20" }]}>
          <Text style={[rq.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={rq.nameRow}>
          <View style={[rq.iconBox, { backgroundColor: color+"20" }]}>
            <Ionicons name={INST_ICONS[req.instType] as any} size={20} color={color} />
          </View>
          <View>
            <Text style={rq.name}>{req.institutionName}</Text>
            <Text style={rq.type}>{INST_LABELS[req.instType]}</Text>
          </View>
        </View>
      </View>
      <View style={rq.divider} />
      <DetailRow icon="person-outline" text={`مقدم الطلب: ${req.contactName}`} />
      <DetailRow icon="call-outline"    text={req.phone} />
      <DetailRow icon="location-outline" text={req.address} />
      {req.description && <DetailRow icon="information-circle-outline" text={req.description} />}
      {req.requestedServices.length > 0 && (
        <View style={rq.svcsWrap}>
          <Text style={rq.svcsLabel}>الخدمات المطلوبة:</Text>
          <View style={rq.svcsRow}>
            {req.requestedServices.map(s => (
              <View key={s} style={rq.svcBadge}>
                <Text style={rq.svcText}>{SVC_LABELS[s]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {req.status === "pending" && (
        <View style={rq.btns}>
          <AnimatedPress style={[rq.btn, { backgroundColor: Colors.danger+"20", borderColor: Colors.danger+"40" }]} onPress={onReject}>
            <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
            <Text style={[rq.btnText, { color: Colors.danger }]}>رفض</Text>
          </AnimatedPress>
          <AnimatedPress style={[rq.btn, { backgroundColor: Colors.primary+"20", borderColor: Colors.primary+"40" }]} onPress={onApprove}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
            <Text style={[rq.btnText, { color: Colors.primary }]}>قبول وإضافة</Text>
          </AnimatedPress>
        </View>
      )}
    </View>
  );
}
const rq = StyleSheet.create({
  card:      { backgroundColor:Colors.cardBg, borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:Colors.divider },
  header:    { flexDirection:"row-reverse", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  nameRow:   { flexDirection:"row-reverse", alignItems:"center", gap:10, flex:1 },
  iconBox:   { width:40, height:40, borderRadius:12, justifyContent:"center", alignItems:"center" },
  name:      { fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.textPrimary, textAlign:"right" },
  type:      { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right" },
  statusBadge:{ borderRadius:8, paddingHorizontal:10, paddingVertical:4 },
  statusText: { fontFamily:"Cairo_600SemiBold", fontSize:11 },
  divider:   { height:1, backgroundColor:Colors.divider, marginVertical:10 },
  svcsWrap:  { marginTop:8 },
  svcsLabel: { fontFamily:"Cairo_600SemiBold", fontSize:12, color:Colors.textSecondary, textAlign:"right", marginBottom:6 },
  svcsRow:   { flexDirection:"row-reverse", flexWrap:"wrap", gap:6 },
  svcBadge:  { backgroundColor:Colors.primary+"15", borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  svcText:   { fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.primary },
  btns:      { flexDirection:"row-reverse", gap:8, marginTop:12 },
  btn:       { flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:10, borderRadius:10, borderWidth:1 },
  btnText:   { fontFamily:"Cairo_600SemiBold", fontSize:13 },
});

// ─── Add/Edit Institution Modal ───────────────────────────────────────────────
function InstFormModal({ visible, initial, onClose, onSave }: {
  visible: boolean; initial?: Partial<Institution>; onClose: ()=>void; onSave: (inst: Institution)=>void;
}) {
  const [name, setName]         = useState(initial?.name || "");
  const [type, setType]         = useState<InstType>(initial?.type || "primary");
  const [address, setAddress]   = useState(initial?.address || "");
  const [phone, setPhone]       = useState(initial?.phone || "");
  const [principal, setPrincipal] = useState(initial?.principal || "");
  const [grades, setGrades]     = useState(initial?.grades || "");
  const [shifts, setShifts]     = useState(initial?.shifts || "");
  const [desc, setDesc]         = useState(initial?.description || "");
  const [svcs, setSvcs]         = useState<ServiceType[]>(initial?.services || []);

  useEffect(() => {
    if (visible) {
      setName(initial?.name||""); setType(initial?.type||"primary");
      setAddress(initial?.address||""); setPhone(initial?.phone||"");
      setPrincipal(initial?.principal||""); setGrades(initial?.grades||"");
      setShifts(initial?.shifts||""); setDesc(initial?.description||"");
      setSvcs(initial?.services||[]);
    }
  }, [visible, initial]);

  const toggleSvc = (s: ServiceType) => setSvcs(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s]);

  const handleSave = () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      Alert.alert("تنبيه", "يرجى ملء الاسم والهاتف والعنوان");
      return;
    }
    onSave({
      id: initial?.id || `inst_${Date.now()}`,
      name: name.trim(), type, address: address.trim(), phone: phone.trim(),
      principal: principal.trim()||undefined, grades: grades.trim()||undefined,
      shifts: shifts.trim()||undefined, description: desc.trim()||undefined,
      services: svcs, status: initial?.status || "active",
      createdAt: initial?.createdAt || new Date().toISOString(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":"height"}>
        <View style={imf.backdrop}>
          <View style={imf.sheet}>
            <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]} style={imf.inner}>
              <View style={imf.titleRow}>
                <AnimatedPress onPress={onClose}><Ionicons name="close-circle" size={26} color={Colors.textMuted} /></AnimatedPress>
                <Text style={imf.title}>{initial?.id ? "تعديل المؤسسة" : "إضافة مؤسسة جديدة"}</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={imf.label}>اسم المؤسسة *</Text>
                <TextInput style={imf.input} value={name} onChangeText={setName} placeholder="اسم المؤسسة التعليمية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={imf.label}>نوع المؤسسة *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingBottom:4 }}>
                  {(Object.keys(INST_LABELS) as InstType[]).map(k => (
                    <AnimatedPress key={k} style={[imf.typeChip, type===k && { backgroundColor: INST_COLORS[k]+"30", borderColor: INST_COLORS[k]+"80" }]} onPress={()=>setType(k)}>
                      <Text style={[imf.typeChipText, type===k && { color: INST_COLORS[k] }]}>{INST_LABELS[k]}</Text>
                    </AnimatedPress>
                  ))}
                </ScrollView>

                <Text style={imf.label}>العنوان *</Text>
                <TextInput style={imf.input} value={address} onChangeText={setAddress} placeholder="الحي والشارع" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={imf.label}>رقم الهاتف *</Text>
                <TextInput style={imf.input} value={phone} onChangeText={setPhone} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />

                <Text style={imf.label}>اسم المدير / الناظر</Text>
                <TextInput style={imf.input} value={principal} onChangeText={setPrincipal} placeholder="الاسم الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={imf.label}>الصفوف الدراسية</Text>
                <TextInput style={imf.input} value={grades} onChangeText={setGrades} placeholder="مثال: الصف الأول – الثامن" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={imf.label}>الفترة الزمنية</Text>
                <TextInput style={imf.input} value={shifts} onChangeText={setShifts} placeholder="صباحية / مسائية / صباحية ومسائية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={imf.label}>وصف إضافي</Text>
                <TextInput style={[imf.input, { height:80, textAlignVertical:"top", paddingTop:10 }]} value={desc} onChangeText={setDesc} placeholder="نبذة عن المؤسسة..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

                <Text style={imf.label}>الخدمات المتاحة</Text>
                <View style={imf.svcsGrid}>
                  {ALL_SVC_TYPES.map(s => (
                    <AnimatedPress key={s} style={[imf.svcCheck, svcs.includes(s) && imf.svcCheckActive]} onPress={()=>toggleSvc(s)}>
                      <Ionicons name={svcs.includes(s)?"checkmark-circle":"ellipse-outline"} size={14} color={svcs.includes(s)?Colors.primary:Colors.textMuted} />
                      <Text style={[imf.svcCheckText, svcs.includes(s) && { color: Colors.primary }]}>{SVC_LABELS[s]}</Text>
                    </AnimatedPress>
                  ))}
                </View>

                <AnimatedPress style={imf.saveBtn} onPress={handleSave}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={imf.saveBtnInner}>
                    <Ionicons name="save-outline" size={18} color="#000" />
                    <Text style={imf.saveBtnText}>حفظ</Text>
                  </LinearGradient>
                </AnimatedPress>
                <View style={{ height: 40 }} />
              </ScrollView>
            </LinearGradient>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const imf = StyleSheet.create({
  backdrop:   { flex:1, backgroundColor:"rgba(0,0,0,0.8)", justifyContent:"flex-end" },
  sheet:      { maxHeight:"90%", borderTopLeftRadius:24, borderTopRightRadius:24, overflow:"hidden" },
  inner:      { padding:20, maxHeight:"100%" },
  titleRow:   { flexDirection:"row-reverse", alignItems:"center", gap:12, marginBottom:20 },
  title:      { fontFamily:"Cairo_700Bold", fontSize:18, color:Colors.textPrimary, flex:1, textAlign:"right" },
  label:      { fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:6, marginTop:14 },
  input:      { backgroundColor:Colors.bg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  typeChip:   { paddingHorizontal:12, paddingVertical:6, borderRadius:10, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider },
  typeChipText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textSecondary },
  svcsGrid:   { flexDirection:"row-reverse", flexWrap:"wrap", gap:8, marginTop:4 },
  svcCheck:   { flexDirection:"row-reverse", alignItems:"center", gap:6, backgroundColor:Colors.bg, borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:Colors.divider },
  svcCheckActive:{ borderColor:Colors.primary+"60", backgroundColor:Colors.primary+"10" },
  svcCheckText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textSecondary },
  saveBtn:    { marginTop:20, borderRadius:14, overflow:"hidden" },
  saveBtnInner:{ flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:14 },
  saveBtnText:{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#000" },
});

// ─── Join Request Form ────────────────────────────────────────────────────────
function JoinRequestForm({ onSubmit, onCancel }: { onSubmit: (r:JoinRequest)=>void; onCancel: ()=>void }) {
  const [name, setName]         = useState("");
  const [type, setType]         = useState<InstType>("primary");
  const [address, setAddress]   = useState("");
  const [phone, setPhone]       = useState("");
  const [contact, setContact]   = useState("");
  const [email, setEmail]       = useState("");
  const [desc, setDesc]         = useState("");
  const [svcs, setSvcs]         = useState<ServiceType[]>([]);

  const toggleSvc = (s: ServiceType) => setSvcs(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s]);

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim() || !address.trim() || !contact.trim()) {
      Alert.alert("تنبيه", "يرجى ملء الحقول الإلزامية: الاسم، الهاتف، العنوان، اسم مقدم الطلب");
      return;
    }
    onSubmit({
      id: `req_${Date.now()}`,
      institutionName: name.trim(), instType: type,
      address: address.trim(), phone: phone.trim(),
      contactName: contact.trim(), email: email.trim()||undefined,
      description: desc.trim()||undefined,
      requestedServices: svcs,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, paddingBottom:120 }}>
      <Animated.View entering={FadeInDown.springify()}>
        <LinearGradient colors={[Colors.accent+"12", Colors.cardBg]} style={jf.banner}>
          <MaterialCommunityIcons name="school-outline" size={32} color={Colors.accent} />
          <View style={{ flex:1 }}>
            <Text style={jf.bannerTitle}>انضمام مؤسسة تعليمية</Text>
            <Text style={jf.bannerSub}>أضف مؤسستك لدليل حصاحيصاوي التعليمي ليجدك الطلاب وأولياء الأمور</Text>
          </View>
        </LinearGradient>

        <Text style={jf.label}>اسم المؤسسة *</Text>
        <TextInput style={jf.input} value={name} onChangeText={setName} placeholder="الاسم الكامل للمؤسسة" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={jf.label}>نوع المؤسسة *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingBottom:4 }}>
          {(Object.keys(INST_LABELS) as InstType[]).map(k => (
            <AnimatedPress key={k} style={[jf.typeChip, type===k && { backgroundColor: INST_COLORS[k]+"30", borderColor: INST_COLORS[k]+"80" }]} onPress={()=>setType(k)}>
              <Ionicons name={INST_ICONS[k] as any} size={14} color={type===k ? INST_COLORS[k] : Colors.textMuted} />
              <Text style={[jf.typeChipText, type===k && { color: INST_COLORS[k] }]}>{INST_LABELS[k]}</Text>
            </AnimatedPress>
          ))}
        </ScrollView>

        <Text style={jf.label}>العنوان *</Text>
        <TextInput style={jf.input} value={address} onChangeText={setAddress} placeholder="الحي والشارع" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={jf.label}>رقم هاتف المؤسسة *</Text>
        <TextInput style={jf.input} value={phone} onChangeText={setPhone} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />

        <Text style={jf.label}>اسم مقدم الطلب *</Text>
        <TextInput style={jf.input} value={contact} onChangeText={setContact} placeholder="المدير أو الشخص المفوض" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={jf.label}>البريد الإلكتروني</Text>
        <TextInput style={jf.input} value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={Colors.textMuted} keyboardType="email-address" textAlign="right" />

        <Text style={jf.label}>وصف المؤسسة</Text>
        <TextInput style={[jf.input, { height:80, textAlignVertical:"top", paddingTop:10 }]} value={desc} onChangeText={setDesc} placeholder="نبذة مختصرة عن المؤسسة..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

        <Text style={jf.label}>الخدمات التي تقدمها مؤسستك</Text>
        <View style={jf.svcsGrid}>
          {ALL_SVC_TYPES.map(s => (
            <AnimatedPress key={s} style={[jf.svcCheck, svcs.includes(s) && jf.svcCheckActive]} onPress={()=>toggleSvc(s)}>
              <Ionicons name={svcs.includes(s)?"checkmark-circle":"ellipse-outline"} size={14} color={svcs.includes(s)?Colors.accent:Colors.textMuted} />
              <Text style={[jf.svcCheckText, svcs.includes(s) && { color: Colors.accent }]}>{SVC_LABELS[s]}</Text>
            </AnimatedPress>
          ))}
        </View>

        <View style={{ flexDirection:"row-reverse", gap:10, marginTop:20 }}>
          <AnimatedPress style={[jf.btn, { backgroundColor: Colors.bg, borderColor: Colors.divider, borderWidth:1, flex:1 }]} onPress={onCancel}>
            <Text style={[jf.btnText, { color: Colors.textSecondary }]}>إلغاء</Text>
          </AnimatedPress>
          <AnimatedPress style={[jf.btn, { flex:2, overflow:"hidden", borderRadius:14 }]} onPress={handleSubmit}>
            <LinearGradient colors={[Colors.accent, Colors.accentDim]} style={jf.btnInner}>
              <Ionicons name="send" size={16} color="#000" />
              <Text style={[jf.btnText, { color: "#000" }]}>إرسال الطلب</Text>
            </LinearGradient>
          </AnimatedPress>
        </View>
      </Animated.View>
    </ScrollView>
  );
}
const jf = StyleSheet.create({
  banner:      { flexDirection:"row-reverse", alignItems:"flex-start", gap:12, padding:16, borderRadius:16, marginBottom:16, marginTop:8, borderWidth:1, borderColor:Colors.accent+"30" },
  bannerTitle: { fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"right", marginBottom:2 },
  bannerSub:   { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", lineHeight:18 },
  label:       { fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:6, marginTop:14 },
  input:       { backgroundColor:Colors.cardBg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  typeChip:    { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:12, paddingVertical:7, borderRadius:10, backgroundColor:Colors.cardBg, borderWidth:1, borderColor:Colors.divider },
  typeChipText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textSecondary },
  svcsGrid:    { flexDirection:"row-reverse", flexWrap:"wrap", gap:8, marginTop:4 },
  svcCheck:    { flexDirection:"row-reverse", alignItems:"center", gap:6, backgroundColor:Colors.cardBg, borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:Colors.divider },
  svcCheckActive:{ borderColor:Colors.accent+"60", backgroundColor:Colors.accent+"10" },
  svcCheckText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textSecondary },
  btn:         { borderRadius:14 },
  btnInner:    { flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:14 },
  btnText:     { fontFamily:"Cairo_700Bold", fontSize:14 },
});

// ════════════════════════════════════════════════════════════════
// 📋 استمارات التسجيل والنقل
// ════════════════════════════════════════════════════════════════

type FormStep = 1 | 2 | 3;

type RegistrationData = {
  institution_id: string;
  institution_name: string;
  grade: string;
  academic_year: string;
  student_name: string;
  student_dob: string;
  student_gender: string;
  student_nationality: string;
  previous_school: string;
  previous_grade: string;
  has_special_needs: boolean;
  special_needs_details: string;
  parent_name: string;
  parent_relation: string;
  parent_phone: string;
  parent_whatsapp: string;
  parent_id_number: string;
  parent_address: string;
  parent_occupation: string;
  parent_email: string;
  notes: string;
};

type TransferData = {
  from_institution_name: string;
  from_grade: string;
  from_reg_number: string;
  to_institution_id: string;
  to_institution_name: string;
  to_grade: string;
  student_name: string;
  student_dob: string;
  student_gender: string;
  transfer_reason: string;
  transfer_reason_detail: string;
  parent_name: string;
  parent_phone: string;
  parent_whatsapp: string;
  parent_id_number: string;
  parent_address: string;
  notes: string;
};

const GRADES_PRIMARY   = ["الصف الأول","الصف الثاني","الصف الثالث","الصف الرابع","الصف الخامس","الصف السادس","الصف السابع","الصف الثامن"];
const GRADES_SECONDARY = ["الصف التاسع","الصف العاشر","الصف الحادي عشر","الصف الثاني عشر"];
const GRADES_ALL       = [...GRADES_PRIMARY, ...GRADES_SECONDARY, "التمهيدي", "السنة الأولى جامعة", "السنة الثانية جامعة", "السنة الثالثة جامعة", "السنة الرابعة جامعة", "دبلوم", "KG1", "KG2", "KG3"];
const RELATIONS        = ["أب","أم","جد","جدة","أخ","أخت","وصي قانوني","أخرى"];
const TRANSFER_REASONS = ["انتقال إقامة","تغيير بيئة دراسية","مشاكل مع الإدارة","بُعد المسافة","مستوى التعليم","الرسوم الدراسية","أسباب صحية","أخرى"];
const STATUS_COLORS: Record<string, string> = {
  pending:"#F59E0B", accepted:"#10B981", approved:"#10B981",
  rejected:"#EF4444", processing:"#3B82F6", waitlisted:"#8B5CF6",
};
const STATUS_LABELS: Record<string, string> = {
  pending:"قيد المراجعة", accepted:"مقبول", approved:"موافق عليه",
  rejected:"مرفوض", processing:"جاري المعالجة", waitlisted:"قائمة الانتظار",
};

// ── مكوّن حقل الإدخال المُوحَّد ──
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={ff.label}>{label}{required && <Text style={{ color: Colors.danger }}> *</Text>}</Text>
      {children}
    </View>
  );
}
function FInput({ value, onChangeText, placeholder, keyboardType, multiline, editable }: {
  value: string; onChangeText?: (v: string) => void; placeholder?: string;
  keyboardType?: "default"|"phone-pad"|"email-address"|"numeric";
  multiline?: boolean; editable?: boolean;
}) {
  return (
    <TextInput
      style={[ff.input, multiline && { height: 70, textAlignVertical: "top", paddingTop: 10 }]}
      value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor={Colors.textMuted}
      keyboardType={keyboardType || "default"} textAlign="right"
      multiline={multiline} editable={editable !== false}
    />
  );
}
function ChipSelect({ options, value, onSelect, color }: {
  options: string[]; value: string; onSelect: (v: string) => void; color?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {options.map(o => (
        <TouchableOpacity key={o}
          style={[ff.chip, value === o && { backgroundColor: (color||Colors.primary)+"20", borderColor: (color||Colors.primary)+"70" }]}
          onPress={() => onSelect(o)}>
          <Text style={[ff.chipText, value === o && { color: color||Colors.primary, fontFamily: "Cairo_600SemiBold" }]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── خطوات التسجيل ──
function RegStep1({ inst, data, setData }: { inst: Institution[]; data: RegistrationData; setData: (d: Partial<RegistrationData>) => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      <FormField label="المؤسسة التعليمية" required>
        <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator nestedScrollEnabled>
          {inst.filter(i => i.status === "active").map(i => (
            <TouchableOpacity key={i.id}
              style={[ff.instRow, data.institution_id === i.id && ff.instRowActive]}
              onPress={() => setData({ institution_id: i.id, institution_name: i.name })}>
              <View style={[ff.instDot, { backgroundColor: INST_COLORS[i.type] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[ff.instName, data.institution_id === i.id && { color: Colors.primary }]}>{i.name}</Text>
                <Text style={ff.instSub}>{INST_LABELS[i.type]}{i.grades ? ` — ${i.grades}` : ""}</Text>
              </View>
              {data.institution_id === i.id && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
            </TouchableOpacity>
          ))}
          <View style={{ marginTop: 8 }}>
            <Text style={ff.label}>أو أدخل اسم المؤسسة يدوياً</Text>
            <FInput value={data.institution_name} onChangeText={v => setData({ institution_name: v, institution_id: "" })} placeholder="اسم المؤسسة التعليمية" />
          </View>
        </ScrollView>
      </FormField>
      <FormField label="الصف الدراسي المطلوب" required>
        <ChipSelect options={GRADES_ALL} value={data.grade} onSelect={v => setData({ grade: v })} />
      </FormField>
      <FormField label="العام الدراسي">
        <ChipSelect options={["2025/2026","2024/2025","2026/2027"]} value={data.academic_year} onSelect={v => setData({ academic_year: v })} />
      </FormField>
    </ScrollView>
  );
}
function RegStep2({ data, setData }: { data: RegistrationData; setData: (d: Partial<RegistrationData>) => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      <FormField label="اسم الطالب الرباعي" required>
        <FInput value={data.student_name} onChangeText={v => setData({ student_name: v })} placeholder="الاسم الكامل للطالب" />
      </FormField>
      <FormField label="الجنس">
        <ChipSelect options={["ذكر","أنثى"]} value={data.student_gender} onSelect={v => setData({ student_gender: v })} />
      </FormField>
      <FormField label="الجنسية">
        <ChipSelect options={["سودانية","أخرى"]} value={data.student_nationality} onSelect={v => setData({ student_nationality: v })} />
      </FormField>
      <FormField label="تاريخ الميلاد (اختياري)">
        <FInput value={data.student_dob} onChangeText={v => setData({ student_dob: v })} placeholder="مثال: 2015-03-15" />
      </FormField>
      <FormField label="المدرسة السابقة (إن وجدت)">
        <FInput value={data.previous_school} onChangeText={v => setData({ previous_school: v })} placeholder="اسم المدرسة السابقة" />
      </FormField>
      <FormField label="الصف السابق">
        <FInput value={data.previous_grade} onChangeText={v => setData({ previous_grade: v })} placeholder="مثال: الصف الخامس" />
      </FormField>
      <TouchableOpacity style={ff.switchRow} onPress={() => setData({ has_special_needs: !data.has_special_needs })}>
        <View style={[ff.toggle, data.has_special_needs && { backgroundColor: Colors.primary }]}>
          {data.has_special_needs && <Ionicons name="checkmark" size={12} color="#000" />}
        </View>
        <Text style={ff.switchLabel}>الطالب لديه احتياجات خاصة</Text>
      </TouchableOpacity>
      {data.has_special_needs && (
        <FormField label="تفاصيل الاحتياجات الخاصة">
          <FInput value={data.special_needs_details} onChangeText={v => setData({ special_needs_details: v })} placeholder="اذكر نوع الاحتياج..." multiline />
        </FormField>
      )}
    </ScrollView>
  );
}
function RegStep3({ data, setData }: { data: RegistrationData; setData: (d: Partial<RegistrationData>) => void }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
      <FormField label="اسم ولي الأمر الرباعي" required>
        <FInput value={data.parent_name} onChangeText={v => setData({ parent_name: v })} placeholder="الاسم الكامل لولي الأمر" />
      </FormField>
      <FormField label="صلة القرابة">
        <ChipSelect options={RELATIONS} value={data.parent_relation} onSelect={v => setData({ parent_relation: v })} />
      </FormField>
      <FormField label="رقم الهاتف" required>
        <FInput value={data.parent_phone} onChangeText={v => setData({ parent_phone: v })} placeholder="+249..." keyboardType="phone-pad" />
      </FormField>
      <FormField label="واتساب (اختياري)">
        <FInput value={data.parent_whatsapp} onChangeText={v => setData({ parent_whatsapp: v })} placeholder="+249..." keyboardType="phone-pad" />
      </FormField>
      <FormField label="رقم الهوية الوطنية (اختياري)">
        <FInput value={data.parent_id_number} onChangeText={v => setData({ parent_id_number: v })} placeholder="رقم البطاقة الوطنية" />
      </FormField>
      <FormField label="العنوان">
        <FInput value={data.parent_address} onChangeText={v => setData({ parent_address: v })} placeholder="الحي والشارع" />
      </FormField>
      <FormField label="المهنة (اختياري)">
        <FInput value={data.parent_occupation} onChangeText={v => setData({ parent_occupation: v })} placeholder="مثال: موظف، معلم، تاجر..." />
      </FormField>
      <FormField label="ملاحظات إضافية">
        <FInput value={data.notes} onChangeText={v => setData({ notes: v })} placeholder="أي ملاحظات تودّ إضافتها..." multiline />
      </FormField>
    </ScrollView>
  );
}

// ── مودال استمارة تسجيل طالب ──
const REG_EMPTY: RegistrationData = {
  institution_id:"", institution_name:"", grade:"", academic_year:"2025/2026",
  student_name:"", student_dob:"", student_gender:"ذكر", student_nationality:"سودانية",
  previous_school:"", previous_grade:"", has_special_needs:false, special_needs_details:"",
  parent_name:"", parent_relation:"أب", parent_phone:"", parent_whatsapp:"",
  parent_id_number:"", parent_address:"", parent_occupation:"", parent_email:"", notes:"",
};

function RegistrationModal({ visible, onClose, institutions }: {
  visible: boolean; onClose: () => void; institutions: Institution[];
}) {
  const [step, setStep] = useState<FormStep>(1);
  const [data, setDataState] = useState<RegistrationData>(REG_EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reg_number: string } | null>(null);
  const setData = (patch: Partial<RegistrationData>) => setDataState(prev => ({ ...prev, ...patch }));

  const reset = () => { setStep(1); setDataState(REG_EMPTY); setResult(null); };
  const close = () => { reset(); onClose(); };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!data.institution_name.trim()) return "يرجى اختيار المؤسسة التعليمية أو كتابة اسمها";
      if (!data.grade) return "يرجى اختيار الصف الدراسي";
    }
    if (step === 2) {
      if (!data.student_name.trim()) return "يرجى إدخال اسم الطالب";
    }
    if (step === 3) {
      if (!data.parent_name.trim()) return "يرجى إدخال اسم ولي الأمر";
      if (!data.parent_phone.trim()) return "يرجى إدخال رقم هاتف ولي الأمر";
    }
    return null;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/education/register-student`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, institution_id: data.institution_id ? parseInt(data.institution_id) : undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ reg_number: json.reg_number });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("خطأ", json.error || "تعذّر إرسال الطلب");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت");
    } finally { setSubmitting(false); }
  };

  const STEP_TITLES = ["اختيار المؤسسة والصف","بيانات الطالب","بيانات ولي الأمر"];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":undefined}>
        <LinearGradient colors={[Colors.cardBgElevated, Colors.bg]} style={{ flex:1 }}>
          {/* Header */}
          <View style={[fm.header, { paddingTop: Platform.OS==="ios"?52:24 }]}>
            <TouchableOpacity onPress={close} style={fm.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex:1 }}>
              <Text style={fm.headerTitle}>استمارة تسجيل طالب</Text>
              <Text style={fm.headerSub}>{result ? "تم التقديم بنجاح" : STEP_TITLES[step-1]}</Text>
            </View>
            <View style={[fm.stepBadge, { backgroundColor: Colors.primary+"20" }]}>
              <Text style={[fm.stepText, { color: Colors.primary }]}>{result ? "✓" : `${step}/3`}</Text>
            </View>
          </View>

          {!result ? (
            <>
              {/* Progress */}
              <View style={fm.progressRow}>
                {[1,2,3].map(s => (
                  <View key={s} style={[fm.progressDot, s<=step && { backgroundColor: Colors.primary }]} />
                ))}
              </View>

              <View style={{ flex:1, paddingHorizontal: 20 }}>
                {step === 1 && <RegStep1 inst={institutions} data={data} setData={setData} />}
                {step === 2 && <RegStep2 data={data} setData={setData} />}
                {step === 3 && <RegStep3 data={data} setData={setData} />}
              </View>

              {/* Navigation */}
              <View style={fm.navRow}>
                {step > 1 && (
                  <TouchableOpacity style={[fm.navBtn, fm.navBtnOutline]} onPress={() => setStep((step-1) as FormStep)}>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                    <Text style={[fm.navBtnText, { color: Colors.textSecondary }]}>السابق</Text>
                  </TouchableOpacity>
                )}
                {step < 3 ? (
                  <TouchableOpacity style={[fm.navBtn, { backgroundColor: Colors.primary, flex:1 }]}
                    onPress={() => {
                      const err = validateStep();
                      if (err) { Alert.alert("تنبيه", err); return; }
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setStep((step+1) as FormStep);
                    }}>
                    <Text style={[fm.navBtnText, { color: "#000" }]}>التالي</Text>
                    <Ionicons name="chevron-back" size={16} color="#000" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[fm.navBtn, { backgroundColor: Colors.primary, flex:1, opacity: submitting?0.7:1 }]}
                    onPress={() => {
                      const err = validateStep();
                      if (err) { Alert.alert("تنبيه", err); return; }
                      submit();
                    }} disabled={submitting}>
                    {submitting ? <Text style={[fm.navBtnText, { color:"#000" }]}>جارٍ الإرسال...</Text> : (
                      <>
                        <Ionicons name="send" size={16} color="#000" />
                        <Text style={[fm.navBtnText, { color:"#000" }]}>إرسال الطلب</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <Animated.View entering={ZoomIn.springify()} style={fm.successBox}>
              <LinearGradient colors={[Colors.primary+"20", Colors.cardBg]} style={fm.successInner}>
                <View style={[fm.successIcon, { backgroundColor: Colors.primary+"25" }]}>
                  <Ionicons name="checkmark-circle" size={60} color={Colors.primary} />
                </View>
                <Text style={fm.successTitle}>تم التقديم بنجاح!</Text>
                <Text style={fm.successSub}>تم استلام طلب تسجيل الطالب {data.student_name} في {data.institution_name}</Text>
                <View style={fm.refBox}>
                  <Text style={fm.refLabel}>رقم الطلب المرجعي</Text>
                  <Text style={fm.refNum}>{result.reg_number}</Text>
                  <Text style={fm.refHint}>احتفظ بهذا الرقم للاستعلام عن حالة طلبك</Text>
                </View>
                <View style={{ gap:10, width:"100%", marginTop:8 }}>
                  <TouchableOpacity style={[fm.navBtn, { backgroundColor: Colors.primary }]} onPress={reset}>
                    <Ionicons name="add-circle-outline" size={16} color="#000" />
                    <Text style={[fm.navBtnText, { color:"#000" }]}>تسجيل طالب آخر</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[fm.navBtn, fm.navBtnOutline]} onPress={close}>
                    <Text style={[fm.navBtnText, { color: Colors.textSecondary }]}>إغلاق</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          )}
        </LinearGradient>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── مودال طلب نقل طالب ──
const TRF_EMPTY: TransferData = {
  from_institution_name:"", from_grade:"", from_reg_number:"",
  to_institution_id:"", to_institution_name:"", to_grade:"",
  student_name:"", student_dob:"", student_gender:"ذكر",
  transfer_reason:"انتقال إقامة", transfer_reason_detail:"",
  parent_name:"", parent_phone:"", parent_whatsapp:"",
  parent_id_number:"", parent_address:"", notes:"",
};

function TransferModal({ visible, onClose, institutions }: {
  visible: boolean; onClose: () => void; institutions: Institution[];
}) {
  const [step, setStep] = useState<FormStep>(1);
  const [data, setDataState] = useState<TransferData>(TRF_EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ transfer_number: string } | null>(null);
  const setData = (patch: Partial<TransferData>) => setDataState(prev => ({ ...prev, ...patch }));
  const reset = () => { setStep(1); setDataState(TRF_EMPTY); setResult(null); };
  const close = () => { reset(); onClose(); };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!data.from_institution_name.trim()) return "يرجى إدخال اسم المدرسة الحالية";
      if (!data.to_institution_name.trim()) return "يرجى اختيار المدرسة المطلوب النقل إليها";
    }
    if (step === 2) {
      if (!data.student_name.trim()) return "يرجى إدخال اسم الطالب";
    }
    if (step === 3) {
      if (!data.parent_name.trim()) return "يرجى إدخال اسم ولي الأمر";
      if (!data.parent_phone.trim()) return "يرجى إدخال رقم هاتف ولي الأمر";
    }
    return null;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/education/transfer-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, to_institution_id: data.to_institution_id ? parseInt(data.to_institution_id) : undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ transfer_number: json.transfer_number });
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("خطأ", json.error || "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); } finally { setSubmitting(false); }
  };

  const STEP_TITLES = ["المدارس (من/إلى)","بيانات الطالب","ولي الأمر وسبب النقل"];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==="ios"?"padding":undefined}>
        <LinearGradient colors={[Colors.cardBgElevated, Colors.bg]} style={{ flex:1 }}>
          <View style={[fm.header, { paddingTop: Platform.OS==="ios"?52:24 }]}>
            <TouchableOpacity onPress={close} style={fm.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex:1 }}>
              <Text style={fm.headerTitle}>طلب نقل طالب</Text>
              <Text style={fm.headerSub}>{result ? "تم التقديم بنجاح" : STEP_TITLES[step-1]}</Text>
            </View>
            <View style={[fm.stepBadge, { backgroundColor: Colors.accent+"20" }]}>
              <Text style={[fm.stepText, { color: Colors.accent }]}>{result ? "✓" : `${step}/3`}</Text>
            </View>
          </View>

          {!result ? (
            <>
              <View style={fm.progressRow}>
                {[1,2,3].map(s => (
                  <View key={s} style={[fm.progressDot, s<=step && { backgroundColor: Colors.accent }]} />
                ))}
              </View>

              <View style={{ flex:1, paddingHorizontal:20 }}>
                {step === 1 && (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:20 }}>
                    <FormField label="المدرسة الحالية" required>
                      <FInput value={data.from_institution_name} onChangeText={v=>setData({from_institution_name:v})} placeholder="اسم المدرسة الحالية" />
                    </FormField>
                    <FormField label="الصف الحالي">
                      <ChipSelect options={GRADES_ALL} value={data.from_grade} onSelect={v=>setData({from_grade:v})} color={Colors.accent} />
                    </FormField>
                    <FormField label="رقم قيد الطالب في المدرسة الحالية">
                      <FInput value={data.from_reg_number} onChangeText={v=>setData({from_reg_number:v})} placeholder="رقم القيد (إن وُجد)" />
                    </FormField>
                    <View style={fm.arrowSep}>
                      <View style={fm.arrowLine} />
                      <View style={fm.arrowIcon}><Ionicons name="arrow-down" size={18} color={Colors.accent} /></View>
                      <View style={fm.arrowLine} />
                    </View>
                    <FormField label="المدرسة المطلوب النقل إليها" required>
                      <ScrollView style={{ maxHeight:180 }} showsVerticalScrollIndicator nestedScrollEnabled>
                        {institutions.filter(i=>i.status==="active").map(i => (
                          <TouchableOpacity key={i.id}
                            style={[ff.instRow, data.to_institution_id===i.id && ff.instRowActive]}
                            onPress={()=>setData({to_institution_id:i.id, to_institution_name:i.name})}>
                            <View style={[ff.instDot, { backgroundColor: INST_COLORS[i.type] }]} />
                            <Text style={[ff.instName, data.to_institution_id===i.id && { color:Colors.accent }]}>{i.name}</Text>
                            {data.to_institution_id===i.id && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <View style={{ marginTop:8 }}>
                        <Text style={ff.label}>أو اكتب الاسم</Text>
                        <FInput value={data.to_institution_name} onChangeText={v=>setData({to_institution_name:v, to_institution_id:""})} placeholder="اسم المدرسة الجديدة" />
                      </View>
                    </FormField>
                    <FormField label="الصف المطلوب في المدرسة الجديدة">
                      <ChipSelect options={GRADES_ALL} value={data.to_grade} onSelect={v=>setData({to_grade:v})} color={Colors.accent} />
                    </FormField>
                  </ScrollView>
                )}
                {step === 2 && (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:20 }}>
                    <FormField label="اسم الطالب الرباعي" required>
                      <FInput value={data.student_name} onChangeText={v=>setData({student_name:v})} placeholder="الاسم الكامل للطالب" />
                    </FormField>
                    <FormField label="الجنس">
                      <ChipSelect options={["ذكر","أنثى"]} value={data.student_gender} onSelect={v=>setData({student_gender:v})} color={Colors.accent} />
                    </FormField>
                    <FormField label="تاريخ الميلاد (اختياري)">
                      <FInput value={data.student_dob} onChangeText={v=>setData({student_dob:v})} placeholder="2015-03-15" />
                    </FormField>
                  </ScrollView>
                )}
                {step === 3 && (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:20 }}>
                    <FormField label="سبب النقل" required>
                      <ChipSelect options={TRANSFER_REASONS} value={data.transfer_reason} onSelect={v=>setData({transfer_reason:v})} color={Colors.accent} />
                    </FormField>
                    <FormField label="تفاصيل السبب (اختياري)">
                      <FInput value={data.transfer_reason_detail} onChangeText={v=>setData({transfer_reason_detail:v})} placeholder="وضح سبب النقل بالتفصيل..." multiline />
                    </FormField>
                    <FormField label="اسم ولي الأمر" required>
                      <FInput value={data.parent_name} onChangeText={v=>setData({parent_name:v})} placeholder="الاسم الكامل لولي الأمر" />
                    </FormField>
                    <FormField label="رقم الهاتف" required>
                      <FInput value={data.parent_phone} onChangeText={v=>setData({parent_phone:v})} placeholder="+249..." keyboardType="phone-pad" />
                    </FormField>
                    <FormField label="العنوان">
                      <FInput value={data.parent_address} onChangeText={v=>setData({parent_address:v})} placeholder="الحي والشارع" />
                    </FormField>
                    <FormField label="ملاحظات">
                      <FInput value={data.notes} onChangeText={v=>setData({notes:v})} placeholder="أي معلومات إضافية..." multiline />
                    </FormField>
                  </ScrollView>
                )}
              </View>

              <View style={fm.navRow}>
                {step > 1 && (
                  <TouchableOpacity style={[fm.navBtn, fm.navBtnOutline]} onPress={()=>setStep((step-1) as FormStep)}>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                    <Text style={[fm.navBtnText, { color:Colors.textSecondary }]}>السابق</Text>
                  </TouchableOpacity>
                )}
                {step < 3 ? (
                  <TouchableOpacity style={[fm.navBtn, { backgroundColor:Colors.accent, flex:1 }]}
                    onPress={()=>{ const e=validateStep(); if(e){Alert.alert("تنبيه",e);return;} setStep((step+1) as FormStep); }}>
                    <Text style={[fm.navBtnText,{color:"#000"}]}>التالي</Text>
                    <Ionicons name="chevron-back" size={16} color="#000" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[fm.navBtn,{backgroundColor:Colors.accent,flex:1,opacity:submitting?0.7:1}]}
                    onPress={()=>{ const e=validateStep(); if(e){Alert.alert("تنبيه",e);return;} submit(); }} disabled={submitting}>
                    <Ionicons name="send" size={16} color="#000" />
                    <Text style={[fm.navBtnText,{color:"#000"}]}>{submitting?"جارٍ الإرسال...":"إرسال طلب النقل"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <Animated.View entering={ZoomIn.springify()} style={fm.successBox}>
              <LinearGradient colors={[Colors.accent+"20", Colors.cardBg]} style={fm.successInner}>
                <View style={[fm.successIcon, { backgroundColor:Colors.accent+"25" }]}>
                  <Ionicons name="checkmark-circle" size={60} color={Colors.accent} />
                </View>
                <Text style={fm.successTitle}>تم تقديم طلب النقل!</Text>
                <Text style={fm.successSub}>سيتم مراجعة طلب نقل الطالب {data.student_name} من {data.from_institution_name} إلى {data.to_institution_name}</Text>
                <View style={fm.refBox}>
                  <Text style={fm.refLabel}>رقم طلب النقل</Text>
                  <Text style={fm.refNum}>{result.transfer_number}</Text>
                  <Text style={fm.refHint}>احتفظ بهذا الرقم للاستعلام عن حالة طلبك</Text>
                </View>
                <TouchableOpacity style={[fm.navBtn, fm.navBtnOutline, { marginTop:12 }]} onPress={close}>
                  <Text style={[fm.navBtnText,{color:Colors.textSecondary}]}>إغلاق</Text>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          )}
        </LinearGradient>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── مودال الاستعلام عن الطلبات ──
type InquiryResult = {
  type: "registration" | "transfer";
  id: number;
  ref: string;
  student_name: string;
  institution: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

function InquiryModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [mode, setMode]     = useState<"phone"|"ref">("phone");
  const [query2, setQuery2] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InquiryResult[]>([]);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query2.trim()) return;
    setLoading(true); setSearched(false);
    try {
      const param = mode === "phone" ? `phone=${encodeURIComponent(query2.trim())}` : `reg_number=${encodeURIComponent(query2.trim())}`;
      const param2 = mode === "phone" ? `phone=${encodeURIComponent(query2.trim())}` : `transfer_number=${encodeURIComponent(query2.trim())}`;
      const [r1, r2] = await Promise.all([
        fetchWithTimeout(`${getApiUrl()}/api/education/my-registrations?${param}`),
        fetchWithTimeout(`${getApiUrl()}/api/education/my-transfers?${param2}`),
      ]);
      const all: InquiryResult[] = [];
      if (r1.ok) {
        const d = await r1.json();
        (d.registrations || []).forEach((r: any) => all.push({
          type:"registration", id:r.id, ref:r.reg_number,
          student_name:r.student_name, institution:r.institution_name,
          status:r.status, admin_notes:r.admin_notes, created_at:r.created_at,
        }));
      }
      if (r2.ok) {
        const d = await r2.json();
        (d.transfers || []).forEach((r: any) => all.push({
          type:"transfer", id:r.id, ref:r.transfer_number,
          student_name:r.student_name, institution:`${r.from_institution_name} → ${r.to_institution_name}`,
          status:r.status, admin_notes:r.admin_notes, created_at:r.created_at,
        }));
      }
      all.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setResults(all);
    } catch {} finally { setLoading(false); setSearched(true); }
  };

  const close = () => { setQuery2(""); setResults([]); setSearched(false); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <LinearGradient colors={[Colors.cardBgElevated, Colors.bg]} style={{ flex:1 }}>
        <View style={[fm.header, { paddingTop: Platform.OS==="ios"?52:24 }]}>
          <TouchableOpacity onPress={close} style={fm.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={fm.headerTitle}>الاستعلام عن طلب</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding:20, gap:16 }}>
          <View style={iq.modeRow}>
            {([["phone","البحث برقم الهاتف"],["ref","البحث برقم الطلب"]] as const).map(([k,l]) => (
              <TouchableOpacity key={k} style={[iq.modeBtn, mode===k && iq.modeBtnActive]} onPress={()=>setMode(k)}>
                <Text style={[iq.modeBtnText, mode===k && { color: Colors.primary, fontFamily:"Cairo_600SemiBold" }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={iq.searchRow}>
            <TouchableOpacity style={iq.searchBtn} onPress={search} disabled={loading}>
              <Ionicons name="search" size={18} color="#000" />
            </TouchableOpacity>
            <TextInput
              style={iq.searchInput}
              value={query2} onChangeText={setQuery2}
              placeholder={mode==="phone" ? "أدخل رقم هاتف ولي الأمر" : "أدخل رقم الطلب (REG-... أو TRF-...)"}
              placeholderTextColor={Colors.textMuted}
              keyboardType={mode==="phone"?"phone-pad":"default"}
              textAlign="right"
              onSubmitEditing={search}
              returnKeyType="search"
            />
          </View>

          {loading && <Text style={iq.hint}>جارٍ البحث...</Text>}
          {searched && results.length === 0 && !loading && (
            <View style={iq.emptyBox}>
              <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
              <Text style={iq.emptyText}>لا توجد طلبات مرتبطة بهذا {mode==="phone"?"الرقم":"الكود"}</Text>
            </View>
          )}

          {results.map(r => (
            <Animated.View key={`${r.type}-${r.id}`} entering={FadeInDown.springify()} style={iq.resultCard}>
              <View style={iq.resultHeader}>
                <View style={[iq.typeBadge, { backgroundColor: r.type==="registration" ? Colors.primary+"20" : Colors.accent+"20" }]}>
                  <Ionicons name={r.type==="registration"?"person-add-outline":"swap-horizontal-outline"} size={13}
                    color={r.type==="registration" ? Colors.primary : Colors.accent} />
                  <Text style={[iq.typeBadgeText, { color: r.type==="registration"?Colors.primary:Colors.accent }]}>
                    {r.type==="registration" ? "تسجيل طالب" : "نقل طالب"}
                  </Text>
                </View>
                <View style={[iq.statusBadge, { backgroundColor: (STATUS_COLORS[r.status]||"#888")+"20" }]}>
                  <Text style={[iq.statusText, { color: STATUS_COLORS[r.status]||"#888" }]}>{STATUS_LABELS[r.status]||r.status}</Text>
                </View>
              </View>
              <Text style={iq.studentName}>{r.student_name}</Text>
              <Text style={iq.instText}>{r.institution}</Text>
              <View style={iq.refRow}>
                <Text style={iq.refText}>{r.ref}</Text>
                <Text style={iq.dateText}>{new Date(r.created_at).toLocaleDateString("ar-EG")}</Text>
              </View>
              {r.admin_notes ? (
                <View style={iq.noteBox}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
                  <Text style={iq.noteText}>{r.admin_notes}</Text>
                </View>
              ) : null}
            </Animated.View>
          ))}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const ff = StyleSheet.create({
  label:       { fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:6 },
  input:       { backgroundColor:Colors.cardBg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  chip:        { paddingHorizontal:12, paddingVertical:7, borderRadius:20, backgroundColor:Colors.cardBg, borderWidth:1, borderColor:Colors.divider },
  chipText:    { fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textSecondary },
  instRow:     { flexDirection:"row-reverse", alignItems:"center", gap:10, padding:10, borderRadius:12, borderWidth:1, borderColor:Colors.divider, marginBottom:6, backgroundColor:Colors.bg },
  instRowActive:{ borderColor:Colors.primary+"70", backgroundColor:Colors.primary+"10" },
  instDot:     { width:10, height:10, borderRadius:5 },
  instName:    { fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textPrimary, flex:1, textAlign:"right" },
  instSub:     { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, textAlign:"right" },
  switchRow:   { flexDirection:"row-reverse", alignItems:"center", gap:10, marginBottom:14 },
  toggle:      { width:26, height:26, borderRadius:8, borderWidth:1.5, borderColor:Colors.divider, backgroundColor:Colors.bg, alignItems:"center", justifyContent:"center" },
  switchLabel: { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textPrimary },
});
const fm = StyleSheet.create({
  header:      { flexDirection:"row-reverse", alignItems:"center", paddingHorizontal:16, paddingBottom:14, borderBottomWidth:1, borderBottomColor:Colors.divider, gap:10 },
  closeBtn:    { width:36, height:36, borderRadius:12, backgroundColor:Colors.cardBg, alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:Colors.divider },
  headerTitle: { fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textPrimary, textAlign:"right" },
  headerSub:   { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right" },
  stepBadge:   { borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  stepText:    { fontFamily:"Cairo_700Bold", fontSize:13 },
  progressRow: { flexDirection:"row-reverse", gap:6, paddingHorizontal:20, paddingVertical:12 },
  progressDot: { height:4, flex:1, borderRadius:2, backgroundColor:Colors.divider },
  navRow:      { flexDirection:"row-reverse", gap:10, padding:16, borderTopWidth:1, borderTopColor:Colors.divider },
  navBtn:      { flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:8, borderRadius:16, paddingVertical:14, paddingHorizontal:18 },
  navBtnOutline:{ borderWidth:1, borderColor:Colors.divider, backgroundColor:Colors.cardBg },
  navBtnText:  { fontFamily:"Cairo_700Bold", fontSize:14 },
  successBox:  { flex:1, justifyContent:"center", padding:24 },
  successInner:{ borderRadius:24, padding:24, alignItems:"center", gap:12, borderWidth:1, borderColor:Colors.divider },
  successIcon: { width:100, height:100, borderRadius:30, alignItems:"center", justifyContent:"center" },
  successTitle:{ fontFamily:"Cairo_700Bold", fontSize:22, color:Colors.textPrimary, textAlign:"center" },
  successSub:  { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"center", lineHeight:20 },
  refBox:      { width:"100%", backgroundColor:Colors.bg, borderRadius:14, padding:16, alignItems:"center", gap:4, borderWidth:1, borderColor:Colors.divider },
  refLabel:    { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted },
  refNum:      { fontFamily:"Cairo_700Bold", fontSize:20, color:Colors.primary, letterSpacing:1 },
  refHint:     { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted, textAlign:"center" },
  arrowSep:    { flexDirection:"row", alignItems:"center", gap:8, marginVertical:10 },
  arrowLine:   { flex:1, height:1, backgroundColor:Colors.divider },
  arrowIcon:   { width:32, height:32, borderRadius:16, backgroundColor:Colors.accent+"15", alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:Colors.accent+"40" },
});
const iq = StyleSheet.create({
  modeRow:     { flexDirection:"row-reverse", gap:8 },
  modeBtn:     { flex:1, paddingVertical:10, borderRadius:12, backgroundColor:Colors.cardBg, borderWidth:1, borderColor:Colors.divider, alignItems:"center" },
  modeBtnActive:{ borderColor:Colors.primary+"60", backgroundColor:Colors.primary+"12" },
  modeBtnText: { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textSecondary },
  searchRow:   { flexDirection:"row-reverse", gap:8 },
  searchInput: { flex:1, backgroundColor:Colors.cardBg, borderRadius:12, paddingHorizontal:14, paddingVertical:11, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider },
  searchBtn:   { width:44, height:44, borderRadius:12, backgroundColor:Colors.primary, alignItems:"center", justifyContent:"center" },
  hint:        { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textMuted, textAlign:"center" },
  emptyBox:    { alignItems:"center", gap:10, paddingVertical:30 },
  emptyText:   { fontFamily:"Cairo_500Medium", fontSize:14, color:Colors.textMuted, textAlign:"center" },
  resultCard:  { backgroundColor:Colors.cardBg, borderRadius:16, padding:14, borderWidth:1, borderColor:Colors.divider, gap:6 },
  resultHeader:{ flexDirection:"row-reverse", alignItems:"center", justifyContent:"space-between" },
  typeBadge:   { flexDirection:"row-reverse", alignItems:"center", gap:5, borderRadius:10, paddingHorizontal:8, paddingVertical:4 },
  typeBadgeText:{ fontFamily:"Cairo_500Medium", fontSize:11 },
  statusBadge: { borderRadius:10, paddingHorizontal:8, paddingVertical:4 },
  statusText:  { fontFamily:"Cairo_700Bold", fontSize:11 },
  studentName: { fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"right" },
  instText:    { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right" },
  refRow:      { flexDirection:"row-reverse", justifyContent:"space-between", alignItems:"center" },
  refText:     { fontFamily:"Cairo_600SemiBold", fontSize:11, color:Colors.textMuted, letterSpacing:0.5 },
  dateText:    { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textMuted },
  noteBox:     { flexDirection:"row-reverse", alignItems:"flex-start", gap:6, backgroundColor:Colors.bg, borderRadius:10, padding:10, borderWidth:1, borderColor:Colors.divider },
  noteText:    { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, flex:1, textAlign:"right" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Tab = "services" | "institutions" | "libraries" | "forms" | "join" | "union" | "admin";

// ─── Library Types ────────────────────────────────────────────────────────────
type LibraryCat = "books" | "stationery" | "printing" | "uniforms" | "tutoring" | "other";

type StudentLibrary = {
  id: number;
  name: string;
  owner_name?: string;
  category: LibraryCat;
  description?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  services: string[];
  is_featured: boolean;
  created_at: string;
};

const LIB_CATS: { key: "all" | LibraryCat; label: string; icon: string; color: string }[] = [
  { key:"all",        label:"الكل",           icon:"apps-outline",         color:"#6366F1" },
  { key:"books",      label:"كتب ومراجع",     icon:"book-outline",          color:"#3B82F6" },
  { key:"stationery", label:"قرطاسية",         icon:"pencil-outline",        color:"#F59E0B" },
  { key:"printing",   label:"طباعة وتصوير",   icon:"print-outline",         color:"#10B981" },
  { key:"uniforms",   label:"مستلزمات مدرسية",icon:"shirt-outline",          color:"#8B5CF6" },
  { key:"tutoring",   label:"دروس خصوصية",    icon:"people-outline",         color:"#EF4444" },
  { key:"other",      label:"أخرى",            icon:"ellipsis-horizontal-outline", color:"#6B7280" },
];

const LIB_CAT_LABELS: Record<string, string> = {
  books:"كتب ومراجع", stationery:"قرطاسية", printing:"طباعة وتصوير",
  uniforms:"مستلزمات مدرسية", tutoring:"دروس خصوصية", other:"أخرى",
};

const LIB_SERVICES = [
  "بيع الكتب المدرسية","بيع المراجع الجامعية","تصوير وطباعة","تجليد الكتب",
  "قرطاسية متنوعة","ملابس مدرسية","مستلزمات رياضية","حقائب وأدوات",
  "دروس خصوصية","طباعة رسائل وبحوث","بطاقات طلابية","أخرى",
];

export default function StudentScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const nav = useRouter();

  const [activeTab, setActiveTab]         = useState<Tab>("services");
  const [instFilter, setInstFilter]       = useState<"all" | InstType>("all");
  const [institutions, setInstitutions]   = useState<Institution[]>([]);
  const [requests, setRequests]           = useState<JoinRequest[]>([]);
  const [selectedTool, setSelectedTool]       = useState<StudentTool | null>(null);
  const [toolModalVisible, setToolModalVisible] = useState(false);

  // Admin
  const [isAdmin, setIsAdmin]             = useState(false);
  const [pinModal, setPinModal]           = useState(false);
  const [pinInput, setPinInput]           = useState("");
  const [pinError, setPinError]           = useState("");
  const [adminSubTab, setAdminSubTab]     = useState<"requests" | "manage" | "add" | "registrations" | "transfers">("requests");

  // Admin forms
  type AdminReg = { id:number; reg_number:string; institution_name:string; grade:string; student_name:string; parent_name:string; parent_phone:string; status:string; admin_notes:string|null; created_at:string };
  type AdminTrf = { id:number; transfer_number:string; from_institution_name:string; to_institution_name:string; student_name:string; parent_phone:string; transfer_reason:string; status:string; admin_notes:string|null; created_at:string };
  const [adminRegs, setAdminRegs] = useState<AdminReg[]>([]);
  const [adminTrfs, setAdminTrfs] = useState<AdminTrf[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsRegStatus, setFormsRegStatus] = useState("all");
  const [formsTrfStatus, setFormsTrfStatus] = useState("all");

  const loadAdminForms = async () => {
    setFormsLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetchWithTimeout(`${getApiUrl()}/api/admin/education/registrations?status=${formsRegStatus}`, { headers:{ "x-admin-pin": DEFAULT_PIN } }),
        fetchWithTimeout(`${getApiUrl()}/api/admin/education/transfers?status=${formsTrfStatus}`, { headers:{ "x-admin-pin": DEFAULT_PIN } }),
      ]);
      if (r1.ok) { const d = await r1.json(); setAdminRegs(d.registrations || []); }
      if (r2.ok) { const d = await r2.json(); setAdminTrfs(d.transfers || []); }
    } catch {} finally { setFormsLoading(false); }
  };

  const updateRegStatus = async (id: number, status: string, admin_notes?: string) => {
    try {
      await fetchWithTimeout(`${getApiUrl()}/api/admin/education/registrations/${id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json","x-admin-pin":DEFAULT_PIN},
        body:JSON.stringify({ status, admin_notes }),
      });
      setAdminRegs(prev => prev.map(r => r.id===id ? { ...r, status, admin_notes: admin_notes||r.admin_notes } : r));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("خطأ","تعذّر تحديث الحالة"); }
  };

  const updateTrfStatus = async (id: number, status: string, admin_notes?: string) => {
    try {
      await fetchWithTimeout(`${getApiUrl()}/api/admin/education/transfers/${id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json","x-admin-pin":DEFAULT_PIN},
        body:JSON.stringify({ status, admin_notes }),
      });
      setAdminTrfs(prev => prev.map(t => t.id===id ? { ...t, status, admin_notes: admin_notes||t.admin_notes } : t));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("خطأ","تعذّر تحديث الحالة"); }
  };
  const [editInst, setEditInst]           = useState<Institution | undefined>(undefined);
  const [formVisible, setFormVisible]     = useState(false);

  // Join success
  const [joinSuccess, setJoinSuccess]     = useState(false);

  // Forms state
  const [regModalVisible, setRegModal]    = useState(false);
  const [trfModalVisible, setTrfModal]    = useState(false);
  const [iqModalVisible, setIqModal]      = useState(false);

  // Libraries state
  const [libraries, setLibraries]         = useState<StudentLibrary[]>([]);
  const [libCat, setLibCat]               = useState<"all" | LibraryCat>("all");
  const [libSearch, setLibSearch]         = useState("");
  const [libLoading, setLibLoading]       = useState(false);
  const [libRegModal, setLibRegModal]     = useState(false);
  const [libRegSuccess, setLibRegSuccess] = useState(false);
  const [libForm, setLibForm]             = useState({
    name:"", owner_name:"", category:"books" as LibraryCat,
    description:"", address:"", phone:"", whatsapp:"", services:[] as string[],
  });
  const [libSubmitting, setLibSubmitting] = useState(false);

  const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

  const loadLibraries = async () => {
    setLibLoading(true);
    try {
      const params = new URLSearchParams();
      if (libCat !== "all") params.set("category", libCat);
      if (libSearch.trim()) params.set("q", libSearch.trim());
      const res = await fetchWithTimeout(`${BASE_URL}/api/student-libraries?${params}`);
      if (res.ok) { const data = await res.json(); setLibraries(data.libraries ?? []); }
    } catch {} finally { setLibLoading(false); }
  };

  const submitLibraryReg = async () => {
    if (!libForm.name.trim()) { Alert.alert("خطأ", "اسم المكتبة مطلوب"); return; }
    if (!libForm.phone.trim() && !libForm.whatsapp.trim()) { Alert.alert("خطأ", "رقم التواصل مطلوب"); return; }
    setLibSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/api/student-libraries`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...libForm }),
      });
      if (res.ok) {
        setLibRegSuccess(true);
        setLibForm({ name:"", owner_name:"", category:"books", description:"", address:"", phone:"", whatsapp:"", services:[] });
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("خطأ", err.error ?? "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); } finally { setLibSubmitting(false); }
  };

  const load = async () => {
    const [insts, reqs] = await Promise.all([loadInstitutions(), loadRequests()]);
    setInstitutions(insts);
    setRequests(reqs);
    const adminStatus = await AsyncStorage.getItem(ADMIN_KEY);
    setIsAdmin(adminStatus === "true");
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));
  useEffect(() => { if (activeTab === "libraries") loadLibraries(); }, [activeTab, libCat, libSearch]);
  useEffect(() => { if (activeTab === "admin" && isAdmin && (adminSubTab === "registrations" || adminSubTab === "transfers")) loadAdminForms(); }, [adminSubTab, activeTab, isAdmin, formsRegStatus, formsTrfStatus]);

  // ── Stats ──
  const activeInsts = institutions.filter(i => i.status === "active");
  const pendingReqs = requests.filter(r => r.status === "pending");

  const filteredInsts = activeInsts.filter(i => instFilter === "all" || i.type === instFilter);

  // ── Admin Login ──
  const handleAdminLogin = async () => {
    const correct = await getAdminPin();
    if (pinInput === correct) {
      await AsyncStorage.setItem(ADMIN_KEY, "true");
      setIsAdmin(true); setPinModal(false); setPinInput(""); setPinError("");
      setActiveTab("admin");
    } else {
      setPinError("رمز PIN غير صحيح");
    }
  };

  // ── Approve Request ──
  const approveRequest = async (req: JoinRequest) => {
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/admin/educational-institutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pin": DEFAULT_PIN },
        body: JSON.stringify({
          name: req.institutionName, type: req.instType,
          address: req.address, phone: req.phone,
          description: req.description || "",
          services: req.requestedServices, status: "active",
        }),
      });
      if (res.ok) {
        const newInst = mapInstitution(await res.json());
        setInstitutions(prev => [...prev, newInst]);
      }
    } catch { Alert.alert("خطأ", "تعذّر إضافة المؤسسة"); }
    const updatedReqs = requests.map(r => r.id === req.id ? { ...r, status: "approved" as const } : r);
    await saveRequests(updatedReqs);
    setRequests(updatedReqs);
  };

  const rejectRequest = async (reqId: string) => {
    const updatedReqs = requests.map(r => r.id === reqId ? { ...r, status: "rejected" as const } : r);
    await saveRequests(updatedReqs);
    setRequests(updatedReqs);
  };

  const saveInst = async (inst: Institution) => {
    try {
      const isNew = !institutions.find(i => i.id === inst.id);
      const url = isNew
        ? `${getApiUrl()}/api/admin/educational-institutions`
        : `${getApiUrl()}/api/admin/educational-institutions/${inst.id}`;
      const res = await fetchWithTimeout(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-pin": DEFAULT_PIN },
        body: JSON.stringify({
          name: inst.name, type: inst.type, address: inst.address,
          phone: inst.phone, principal: inst.principal,
          grades: inst.grades, shifts: inst.shifts,
          description: inst.description, services: inst.services, status: inst.status,
        }),
      });
      if (res.ok) {
        const saved = mapInstitution(await res.json());
        setInstitutions(prev =>
          isNew ? [...prev, saved] : prev.map(i => i.id === saved.id ? saved : i)
        );
      }
    } catch { Alert.alert("خطأ", "تعذّر حفظ المؤسسة"); }
    setFormVisible(false);
    setEditInst(undefined);
  };

  const deleteInst = async (id: string) => {
    try {
      await fetchWithTimeout(`${getApiUrl()}/api/admin/educational-institutions/${id}`, {
        method: "DELETE",
        headers: { "x-admin-pin": DEFAULT_PIN },
      });
      setInstitutions(prev => prev.filter(i => i.id !== id));
    } catch { Alert.alert("خطأ", "تعذّر الحذف"); }
  };

  const handleJoinSubmit = async (req: JoinRequest) => {
    const updated = [...requests, req];
    await saveRequests(updated);
    setRequests(updated);
    setJoinSuccess(true);
  };

  const TAB_OPTIONS: { key: Tab; label: string; icon: string }[] = [
    { key:"services",     label:"الخدمات",   icon:"grid-outline" },
    { key:"institutions", label:"المؤسسات",  icon:"school-outline" },
    { key:"forms",        label:"الاستمارات",icon:"document-text-outline" },
    { key:"libraries",    label:"المكتبات",  icon:"book-outline" },
    { key:"join",         label:"انضمام",    icon:"add-circle-outline" },
    { key:"union",        label:"إتحاد الطلاب", icon:"people-circle-outline" },
    { key:"admin",        label:"الإدارة",   icon:"shield-checkmark-outline" },
  ];

  return (
    <View style={s.container}>
      {/* PIN Modal */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={()=>{setPinModal(false);setPinInput("");setPinError("");}}>
        <View style={s.pinBackdrop}>
          <Animated.View entering={ZoomIn.springify()} style={s.pinSheet}>
            <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]} style={s.pinInner}>
              <View style={s.pinIconCircle}>
                <Ionicons name="shield-checkmark" size={36} color={Colors.primary} />
              </View>
              <Text style={s.pinTitle}>لوحة إدارة التعليم</Text>
              <Text style={s.pinSub}>أدخل رمز PIN للمشرف للوصول إلى صلاحيات الإدارة</Text>
              <TextInput
                style={s.pinInput} value={pinInput} onChangeText={setPinInput}
                placeholder="••••" placeholderTextColor={Colors.textMuted}
                keyboardType="numeric" secureTextEntry textAlign="center"
                maxLength={8} onSubmitEditing={handleAdminLogin}
              />
              {pinError ? <Text style={s.pinError}>{pinError}</Text> : null}
              <View style={s.pinBtns}>
                <AnimatedPress style={[s.pinBtn, { backgroundColor: Colors.bg, borderWidth:1, borderColor:Colors.divider }]}
                  onPress={()=>{setPinModal(false);setPinInput("");setPinError("");}}>
                  <Text style={[s.pinBtnText, { color: Colors.textSecondary }]}>إلغاء</Text>
                </AnimatedPress>
                <AnimatedPress style={[s.pinBtn, { overflow:"hidden" }]} onPress={handleAdminLogin}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.pinBtnGrad}>
                    <Text style={[s.pinBtnText, { color:"#000" }]}>دخول</Text>
                  </LinearGradient>
                </AnimatedPress>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      {/* Institution Form Modal */}
      <InstFormModal visible={formVisible} initial={editInst} onClose={()=>{setFormVisible(false);setEditInst(undefined);}} onSave={saveInst} />

      {/* Tool Modal */}
      <ToolModal tool={selectedTool} visible={toolModalVisible} onClose={()=>setToolModalVisible(false)} />

      {/* استمارة تسجيل */}
      <RegistrationModal visible={regModalVisible} onClose={()=>setRegModal(false)} institutions={institutions} />
      {/* طلب نقل */}
      <TransferModal visible={trfModalVisible} onClose={()=>setTrfModal(false)} institutions={institutions} />
      {/* الاستعلام */}
      <InquiryModal visible={iqModalVisible} onClose={()=>setIqModal(false)} />

      {/* Header */}
      <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={s.headerTop}>
          <View style={s.statsRow}>
            <View style={s.statPill}>
              <MaterialCommunityIcons name="office-building" size={13} color={Colors.primary} />
              <Text style={s.statText}>{activeInsts.length} مؤسسة</Text>
            </View>
            {pendingReqs.length > 0 && isAdmin && (
              <View style={[s.statPill, { backgroundColor: Colors.accent+"20", borderColor: Colors.accent+"40" }]}>
                <Ionicons name="time-outline" size={13} color={Colors.accent} />
                <Text style={[s.statText, { color: Colors.accent }]}>{pendingReqs.length} طلب معلق</Text>
              </View>
            )}
          </View>
          <View style={s.headerTitleRow}>
            <AnimatedPress onPress={()=>{ if (!isAdmin) { setPinModal(true); } else { setActiveTab("admin"); } }}>
              <View style={[s.adminBtn, isAdmin && { backgroundColor: Colors.primary+"20", borderColor: Colors.primary+"50" }]}>
                <Ionicons name={isAdmin ? "shield-checkmark" : "shield-checkmark-outline"} size={18} color={isAdmin ? Colors.primary : Colors.textMuted} />
              </View>
            </AnimatedPress>
            <View>
              <Text style={s.headerTitle}>الخدمات الطلابية</Text>
              <Text style={s.headerSub}>الحصاحيصا التعليمية</Text>
            </View>
            <View style={s.headerIcon}>
              <Ionicons name="school" size={24} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsContent}>
          {TAB_OPTIONS.map(tab => (
            <AnimatedPress key={tab.key} style={[s.tabBtn, activeTab===tab.key && s.tabBtnActive]}
              onPress={() => {
                if (tab.key === "admin" && !isAdmin) { setPinModal(true); return; }
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
              }}>
              {activeTab===tab.key && <View style={[s.tabActiveLine, { backgroundColor: Colors.primary }]} />}
              <Ionicons name={tab.icon as any} size={16} color={activeTab===tab.key ? Colors.primary : Colors.textMuted} />
              <Text style={[s.tabBtnText, activeTab===tab.key && s.tabBtnTextActive]}>{tab.label}</Text>
              {tab.key==="admin" && !isAdmin && <Ionicons name="lock-closed" size={10} color={Colors.textMuted} />}
              {tab.key==="admin" && pendingReqs.length>0 && isAdmin && (
                <View style={s.tabBadge}><Text style={s.tabBadgeText}>{pendingReqs.length}</Text></View>
              )}
            </AnimatedPress>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* ── TAB: SERVICES ── */}
      {activeTab === "services" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionTitle}>أدوات الطالب التفاعلية</Text>
          <View style={s.svcsGrid}>
            {STUDENT_TOOLS.map((tool, i) => (
              <Animated.View key={tool.id} entering={FadeInDown.delay(i*50).springify().damping(18)} style={s.svcCardWrap}>
                <AnimatedPress style={s.svcCard} onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTool(tool); setToolModalVisible(true);
                }}>
                  <LinearGradient colors={[tool.color+"18", Colors.cardBg]} style={s.svcCardInner}>
                    <View style={[s.svcIconCircle, { backgroundColor: tool.color+"22" }]}>
                      <Ionicons name={tool.icon as any} size={28} color={tool.color} />
                    </View>
                    <Text style={s.svcTitle}>{tool.title}</Text>
                    <View style={{ flex:1 }} />
                    <View style={[s.svcTag, { backgroundColor: tool.color+"22" }]}>
                      <Text style={[s.svcTagText, { color: tool.color }]}>{tool.tag}</Text>
                    </View>
                  </LinearGradient>
                </AnimatedPress>
              </Animated.View>
            ))}
          </View>

          {/* Quick Tips */}
          <LinearGradient colors={[Colors.accent+"15", Colors.cardBg]} style={s.tipCard}>
            <View style={s.tipHeader}>
              <Ionicons name="bulb-outline" size={20} color={Colors.accent} />
              <Text style={s.tipTitle}>نصيحة مهمة للطلاب</Text>
            </View>
            <Text style={s.tipText}>تذكر أن التسجيل في مكتب التربية والتعليم يكون في بداية العام الدراسي. تأكد من استيفاء جميع المستندات المطلوبة مسبقاً لتجنب أي تأخير في القيد.</Text>
          </LinearGradient>

          <LinearGradient colors={[Colors.primary+"15", Colors.cardBg]} style={s.tipCard}>
            <View style={s.tipHeader}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
              <Text style={[s.tipTitle, { color: Colors.primary }]}>للتواصل مع مكتب التربية</Text>
            </View>
            <Text style={s.tipText}>يعمل مكتب التربية والتعليم بالحصاحيصا من الأحد إلى الخميس، من 8 صباحاً حتى 2 ظهراً. للحالات الطارئة تواصل عبر الأرقام المخصصة.</Text>
          </LinearGradient>
        </ScrollView>
      )}

      {/* ── TAB: INSTITUTIONS ── */}
      {activeTab === "institutions" && (
        <View style={s.flex1}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.filtersRow} contentContainerStyle={s.filtersContent}>
            {INST_TYPE_FILTERS.map(f => (
              <AnimatedPress key={f.key} style={[s.filterChip, instFilter===f.key && s.filterChipActive]} onPress={()=>setInstFilter(f.key as any)}>
                <Text style={[s.filterChipText, instFilter===f.key && s.filterChipTextActive]}>{f.label}</Text>
              </AnimatedPress>
            ))}
          </ScrollView>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {filteredInsts.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="school-outline" size={52} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>لا توجد مؤسسات في هذه الفئة</Text>
                <Text style={s.emptySub}>يمكنك إضافة مؤسستك عبر تبويب "انضمام"</Text>
              </View>
            ) : filteredInsts.map((inst, i) => (
              <Animated.View key={inst.id} entering={FadeInDown.delay(i*60).springify().damping(18)}>
                <InstCard item={inst}
                  onCall={p => Linking.openURL(`tel:${p}`)}
                  isAdmin={isAdmin}
                  onApprove={isAdmin ? async ()=>{
                    const updated = institutions.map(x=>x.id===inst.id?{...x,status:"active" as const}:x);
                    await saveInstitutions(updated); setInstitutions(updated);
                  } : undefined}
                  onReject={isAdmin ? async ()=>{
                    const updated = institutions.map(x=>x.id===inst.id?{...x,status:"pending" as const}:x);
                    await saveInstitutions(updated); setInstitutions(updated);
                  } : undefined}
                />
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── TAB: FORMS ── */}
      {activeTab === "forms" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* بانر الخدمات */}
          <Animated.View entering={FadeInDown.springify()}>
            <LinearGradient colors={[Colors.primary+"18", Colors.cardBg]} style={fo.banner}>
              <View style={fo.bannerIcon}>
                <Ionicons name="document-text" size={28} color={Colors.primary} />
              </View>
              <View style={{ flex:1 }}>
                <Text style={fo.bannerTitle}>الخدمات التعليمية الإلكترونية</Text>
                <Text style={fo.bannerSub}>قدّم طلباتك التعليمية إلكترونياً دون الحاجة للانتظار في الطوابير</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* البطاقات الرئيسية */}
          {[
            {
              icon:"person-add-outline", color:Colors.primary, bg:Colors.primary+"18",
              title:"استمارة تسجيل طالب جديد",
              desc:"سجّل طفلك في أي مؤسسة تعليمية بالحصاحيصا — روضة، مدرسة أساسية أو ثانوية أو معهد أو جامعة",
              tag:"للطلاب وأولياء الأمور",
              onPress:()=>setRegModal(true),
              steps:["اختيار المؤسسة والصف","بيانات الطالب","بيانات ولي الأمر"],
            },
            {
              icon:"swap-horizontal-outline", color:Colors.accent, bg:Colors.accent+"18",
              title:"طلب نقل طالب",
              desc:"انقل طفلك من مدرسة إلى أخرى بسهولة — حدّد المدرسة الحالية والجديدة وسبب النقل",
              tag:"نقل بين المدارس",
              onPress:()=>setTrfModal(true),
              steps:["المدارس (من/إلى)","بيانات الطالب","ولي الأمر وسبب النقل"],
            },
            {
              icon:"search-outline", color:"#6366F1", bg:"#6366F120",
              title:"الاستعلام عن طلب",
              desc:"تتبّع حالة طلب التسجيل أو النقل الخاص بك عبر رقم هاتفك أو الرقم المرجعي للطلب",
              tag:"تتبّع الطلبات",
              onPress:()=>setIqModal(true),
              steps:[],
            },
          ].map((c, i) => (
            <Animated.View key={c.title} entering={FadeInDown.delay(i*80).springify().damping(18)}>
              <TouchableOpacity style={[fo.card, { borderColor: c.color+"30" }]} onPress={c.onPress}
                activeOpacity={0.85}>
                <LinearGradient colors={[c.bg, Colors.cardBg]} style={fo.cardInner}>
                  <View style={fo.cardTop}>
                    <View style={[fo.cardIcon, { backgroundColor: c.bg }]}>
                      <Ionicons name={c.icon as any} size={28} color={c.color} />
                    </View>
                    <View style={{ flex:1 }}>
                      <View style={[fo.tagBadge, { backgroundColor: c.bg }]}>
                        <Text style={[fo.tagText, { color: c.color }]}>{c.tag}</Text>
                      </View>
                      <Text style={fo.cardTitle}>{c.title}</Text>
                    </View>
                  </View>
                  <Text style={fo.cardDesc}>{c.desc}</Text>
                  {c.steps.length > 0 && (
                    <View style={fo.stepsRow}>
                      {c.steps.map((step, si) => (
                        <View key={si} style={fo.stepItem}>
                          <View style={[fo.stepNum, { backgroundColor: c.color+"20", borderColor: c.color+"40" }]}>
                            <Text style={[fo.stepNumText, { color: c.color }]}>{si+1}</Text>
                          </View>
                          <Text style={fo.stepText}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={[fo.cta, { backgroundColor: c.color, borderColor: c.color }]}>
                    <Ionicons name="arrow-back" size={16} color="#000" />
                    <Text style={fo.ctaText}>{c.icon==="search-outline" ? "استعلام الآن" : "ابدأ الآن"}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* ارشادات مهمة */}
          <Animated.View entering={FadeInDown.delay(320).springify()}>
            <View style={fo.guideBox}>
              <Text style={fo.guideTitle}>إرشادات مهمة</Text>
              {[
                { icon:"time-outline",           text:"يتم مراجعة الطلبات خلال 2-3 أيام عمل" },
                { icon:"call-outline",           text:"ستتلقى مكالمة من إدارة المؤسسة لتأكيد الطلب" },
                { icon:"document-outline",       text:"احتفظ بالرقم المرجعي للطلب للاستعلام عن حالته" },
                { icon:"shield-checkmark-outline",text:"بياناتك محمية ولا تُشارَك مع أطراف خارجية" },
                { icon:"information-circle-outline",text:"القبول النهائي يتم حسب الطاقة الاستيعابية للمؤسسة" },
              ].map((g, gi) => (
                <View key={gi} style={fo.guideRow}>
                  <Ionicons name={g.icon as any} size={16} color={Colors.primary} />
                  <Text style={fo.guideText}>{g.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* المستندات المطلوبة */}
          <Animated.View entering={FadeInDown.delay(380).springify()}>
            <View style={fo.docsBox}>
              <View style={fo.docsHeader}>
                <Ionicons name="folder-open-outline" size={18} color={Colors.accent} />
                <Text style={fo.docsTitle}>المستندات المطلوبة عند المراجعة</Text>
              </View>
              {[
                { title:"للتسجيل الجديد", docs:["شهادة الميلاد للطالب","صورة شخصية للطالب","بطاقة هوية ولي الأمر","شهادة انتقال من المدرسة السابقة (إن وجدت)"] },
                { title:"لطلب النقل", docs:["شهادة انتقال من المدرسة الحالية","آخر شهادة دراسية","بطاقة هوية ولي الأمر","رقم قيد الطالب الحالي"] },
              ].map(section => (
                <View key={section.title} style={{ marginBottom:12 }}>
                  <Text style={fo.docsSectionTitle}>{section.title}</Text>
                  {section.docs.map((d, di) => (
                    <View key={di} style={fo.docRow}>
                      <View style={fo.docDot} />
                      <Text style={fo.docText}>{d}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Animated.View>

        </ScrollView>
      )}

      {/* ══ TAB: LIBRARIES ══ */}
      {activeTab === "libraries" && (
        <View style={{ flex:1 }}>
          {/* Registration modal */}
          <Modal visible={libRegModal} transparent animationType="slide" onRequestClose={()=>setLibRegModal(false)}>
            <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":"height"} style={{ flex:1 }}>
              <View style={{ flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"flex-end" }}>
                <Animated.View entering={FadeIn.duration(200)}>
                  <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]}
                    style={{ borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, maxHeight:"90%" }}>
                    <View style={{ flexDirection:"row-reverse", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                      <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:10 }}>
                        <View style={{ width:40,height:40,borderRadius:12,backgroundColor:"#3B82F620",justifyContent:"center",alignItems:"center" }}>
                          <Ionicons name="book" size={20} color="#3B82F6" />
                        </View>
                        <Text style={{ fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textPrimary }}>
                          {libRegSuccess ? "تم الإرسال!" : "تسجيل مكتبة أو محل"}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={()=>{ setLibRegModal(false); setLibRegSuccess(false); }}>
                        <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    {libRegSuccess ? (
                      <View style={{ alignItems:"center", paddingVertical:30, gap:14 }}>
                        <View style={{ width:72,height:72,borderRadius:22,backgroundColor:Colors.primary+"20",justifyContent:"center",alignItems:"center" }}>
                          <Ionicons name="checkmark-circle" size={44} color={Colors.primary} />
                        </View>
                        <Text style={{ fontFamily:"Cairo_700Bold", fontSize:18, color:Colors.textPrimary, textAlign:"center" }}>تم استلام طلبك بنجاح!</Text>
                        <Text style={{ fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textSecondary, textAlign:"center", lineHeight:22 }}>
                          سيتم مراجعة طلبك من قِبل الإدارة وإضافة مكتبتك قريباً.
                        </Text>
                        <TouchableOpacity onPress={()=>{ setLibRegModal(false); setLibRegSuccess(false); }}
                          style={{ backgroundColor:Colors.primary, borderRadius:14, paddingVertical:12, paddingHorizontal:32, marginTop:8 }}>
                          <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#000" }}>حسناً</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <ScrollView showsVerticalScrollIndicator={false}>
                        {([ 
                          { label:"اسم المكتبة / المحل *", key:"name", ph:"مكتبة النور الطلابية" },
                          { label:"اسم المالك",              key:"owner_name", ph:"اسم صاحب المحل" },
                          { label:"العنوان",                 key:"address", ph:"الحي أو الشارع" },
                          { label:"رقم الهاتف *",            key:"phone", ph:"+249XXXXXXXXX" },
                          { label:"واتساب",                  key:"whatsapp", ph:"+249XXXXXXXXX" },
                        ] as {label:string;key:keyof typeof libForm;ph:string}[]).map(field => (
                          <View key={field.key} style={{ marginBottom:12 }}>
                            <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:5 }}>{field.label}</Text>
                            <TextInput
                              value={libForm[field.key] as string}
                              onChangeText={v=>setLibForm(f=>({...f,[field.key]:v}))}
                              placeholder={field.ph} placeholderTextColor={Colors.textMuted}
                              style={{ backgroundColor:Colors.bg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider, textAlign:"right" }}
                            />
                          </View>
                        ))}
                        <View style={{ marginBottom:12 }}>
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:5 }}>نوع النشاط *</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row-reverse" }}>
                            {LIB_CATS.filter(c=>c.key!=="all").map(c=>(
                              <TouchableOpacity key={c.key} onPress={()=>setLibForm(f=>({...f,category:c.key as LibraryCat}))}
                                style={{ paddingHorizontal:12, paddingVertical:7, borderRadius:10,
                                  backgroundColor: libForm.category===c.key ? c.color+"25" : Colors.cardBg,
                                  borderWidth:1, borderColor: libForm.category===c.key ? c.color : Colors.divider }}>
                                <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color: libForm.category===c.key ? c.color : Colors.textMuted }}>{c.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        <View style={{ marginBottom:12 }}>
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:8 }}>الخدمات المقدمة</Text>
                          <View style={{ flexDirection:"row-reverse", flexWrap:"wrap", gap:8 }}>
                            {LIB_SERVICES.map(svc=>{
                              const active = libForm.services.includes(svc);
                              return (
                                <TouchableOpacity key={svc} onPress={()=>setLibForm(f=>({
                                  ...f, services: active ? f.services.filter(s=>s!==svc) : [...f.services, svc]
                                }))}
                                  style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                                    backgroundColor: active ? Colors.primary+"20" : Colors.cardBg,
                                    borderWidth:1, borderColor: active ? Colors.primary+"50" : Colors.divider }}>
                                  <Text style={{ fontFamily:"Cairo_500Medium", fontSize:11, color: active ? Colors.primary : Colors.textMuted }}>{svc}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                        <View style={{ marginBottom:20 }}>
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textSecondary, textAlign:"right", marginBottom:5 }}>وصف إضافي</Text>
                          <TextInput
                            value={libForm.description} multiline numberOfLines={3}
                            onChangeText={v=>setLibForm(f=>({...f,description:v}))}
                            placeholder="اذكر أي معلومات إضافية..." placeholderTextColor={Colors.textMuted}
                            style={{ backgroundColor:Colors.bg, borderRadius:12, padding:12, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, borderWidth:1, borderColor:Colors.divider, textAlign:"right", minHeight:80, textAlignVertical:"top" }}
                          />
                        </View>
                        <TouchableOpacity onPress={submitLibraryReg} disabled={libSubmitting}
                          style={{ borderRadius:14, overflow:"hidden", marginBottom:8 }}>
                          <LinearGradient colors={[Colors.primary, Colors.primary+"CC"]} style={{ paddingVertical:14, alignItems:"center" }}>
                            <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#000" }}>
                              {libSubmitting ? "جارٍ الإرسال..." : "إرسال طلب التسجيل"}
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </ScrollView>
                    )}
                  </LinearGradient>
                </Animated.View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Search + register button */}
          <View style={{ paddingHorizontal:16, paddingVertical:12, backgroundColor:Colors.cardBg, borderBottomWidth:1, borderBottomColor:Colors.divider }}>
            <View style={{ flexDirection:"row-reverse", gap:10, alignItems:"center", marginBottom:10 }}>
              <View style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", gap:8, backgroundColor:Colors.bg, borderRadius:12, borderWidth:1, borderColor:Colors.divider, paddingHorizontal:12, paddingVertical:8 }}>
                <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
                <TextInput value={libSearch} onChangeText={setLibSearch} placeholder="ابحث عن مكتبة..." placeholderTextColor={Colors.textMuted}
                  style={{ flex:1, fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textPrimary, textAlign:"right" }} />
                {libSearch.length>0 && <TouchableOpacity onPress={()=>setLibSearch("")}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity>}
              </View>
              <TouchableOpacity onPress={()=>{ setLibRegSuccess(false); setLibRegModal(true); }}
                style={{ backgroundColor:Colors.primary, borderRadius:12, paddingHorizontal:14, paddingVertical:10, flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                <Ionicons name="add" size={18} color="#000" />
                <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color:"#000" }}>تسجيل</Text>
              </TouchableOpacity>
            </View>
            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row-reverse" }}>
              {LIB_CATS.map(cat=>(
                <TouchableOpacity key={cat.key} onPress={()=>setLibCat(cat.key)}
                  style={{ flexDirection:"row-reverse", alignItems:"center", gap:5, paddingHorizontal:12, paddingVertical:7, borderRadius:20,
                    backgroundColor: libCat===cat.key ? cat.color+"20" : Colors.cardBg,
                    borderWidth:1, borderColor: libCat===cat.key ? cat.color+"60" : Colors.divider }}>
                  <Ionicons name={cat.icon as any} size={13} color={libCat===cat.key ? cat.color : Colors.textMuted} />
                  <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:12, color: libCat===cat.key ? cat.color : Colors.textMuted }}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Library list */}
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:120, gap:12 }} showsVerticalScrollIndicator={false}>
            {libLoading ? (
              <View style={{ alignItems:"center", paddingVertical:60 }}>
                <MaterialCommunityIcons name="book-open-page-variant" size={48} color={Colors.textMuted} style={{ marginBottom:10, opacity:0.3 }} />
                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:14, color:Colors.textMuted }}>جارٍ التحميل...</Text>
              </View>
            ) : libraries.length === 0 ? (
              <View style={{ alignItems:"center", paddingVertical:60 }}>
                <Animated.View entering={ZoomIn.springify()}>
                  <View style={{ width:88,height:88,borderRadius:28,backgroundColor:"#3B82F620",justifyContent:"center",alignItems:"center",marginBottom:16 }}>
                    <Ionicons name="book-outline" size={44} color="#3B82F6" />
                  </View>
                </Animated.View>
                <Text style={{ fontFamily:"Cairo_700Bold", fontSize:17, color:Colors.textSecondary, marginBottom:8, textAlign:"center" }}>
                  لا توجد مكتبات مسجّلة بعد
                </Text>
                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textMuted, textAlign:"center", lineHeight:20, maxWidth:260 }}>
                  كن أول من يسجّل مكتبته أو محله في دليل الخدمات الطلابية
                </Text>
                <TouchableOpacity onPress={()=>{ setLibRegSuccess(false); setLibRegModal(true); }}
                  style={{ marginTop:20, backgroundColor:Colors.primary, borderRadius:14, paddingVertical:12, paddingHorizontal:28 }}>
                  <Text style={{ fontFamily:"Cairo_700Bold", fontSize:14, color:"#000" }}>سجّل مكتبتك الآن</Text>
                </TouchableOpacity>
              </View>
            ) : (
              libraries.map((lib, i) => {
                const cat = LIB_CATS.find(c=>c.key===lib.category) ?? LIB_CATS[1];
                return (
                  <Animated.View key={lib.id} entering={FadeInDown.delay(i*60).springify().damping(18)}>
                    <View style={{ backgroundColor:Colors.cardBg, borderRadius:18, borderWidth:1,
                      borderColor: lib.is_featured ? cat.color+"40" : Colors.divider, overflow:"hidden" }}>
                      {lib.is_featured && (
                        <LinearGradient colors={[cat.color+"30", "transparent"]}
                          style={{ paddingHorizontal:14, paddingVertical:6, flexDirection:"row-reverse", alignItems:"center", gap:6 }}>
                          <MaterialCommunityIcons name="star-circle" size={14} color={cat.color} />
                          <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:11, color:cat.color }}>مميّزة</Text>
                        </LinearGradient>
                      )}
                      <View style={{ padding:16 }}>
                        <View style={{ flexDirection:"row-reverse", alignItems:"flex-start", gap:12, marginBottom:10 }}>
                          <View style={{ width:52,height:52,borderRadius:16,backgroundColor:cat.color+"20",justifyContent:"center",alignItems:"center" }}>
                            <Ionicons name={cat.icon as any} size={26} color={cat.color} />
                          </View>
                          <View style={{ flex:1 }}>
                            <Text style={{ fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"right" }}>{lib.name}</Text>
                            {lib.owner_name && <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", marginTop:2 }}>{lib.owner_name}</Text>}
                            <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6, marginTop:4 }}>
                              <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor:cat.color+"15", borderWidth:1, borderColor:cat.color+"30" }}>
                                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:cat.color }}>{LIB_CAT_LABELS[lib.category]??lib.category}</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                        {lib.description ? <Text style={{ fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"right", lineHeight:20, marginBottom:10 }}>{lib.description}</Text> : null}
                        {lib.address ? (
                          <View style={{ flexDirection:"row-reverse", alignItems:"center", gap:6, marginBottom:8 }}>
                            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                            <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, flex:1, textAlign:"right" }}>{lib.address}</Text>
                          </View>
                        ) : null}
                        {lib.services?.length > 0 && (
                          <View style={{ flexDirection:"row-reverse", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                            {lib.services.slice(0,5).map((svc:string) => (
                              <View key={svc} style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider }}>
                                <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:Colors.textSecondary }}>{svc}</Text>
                              </View>
                            ))}
                            {lib.services.length > 5 && <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:6, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider }}>
                              <Text style={{ fontFamily:"Cairo_500Medium", fontSize:10, color:Colors.textMuted }}>+{lib.services.length-5}</Text>
                            </View>}
                          </View>
                        )}
                        <View style={{ flexDirection:"row-reverse", gap:8 }}>
                          {lib.phone ? (
                            <TouchableOpacity onPress={()=>Linking.openURL(`tel:${lib.phone}`)}
                              style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:"#10B98120", borderRadius:12, paddingVertical:10, borderWidth:1, borderColor:"#10B98140" }}>
                              <Ionicons name="call-outline" size={15} color="#10B981" />
                              <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:"#10B981" }}>اتصال</Text>
                            </TouchableOpacity>
                          ) : null}
                          {lib.whatsapp ? (
                            <TouchableOpacity onPress={()=>Linking.openURL(`https://wa.me/${lib.whatsapp?.replace(/\D/g,"")??""}`)  }
                              style={{ flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, backgroundColor:"#25D36620", borderRadius:12, paddingVertical:10, borderWidth:1, borderColor:"#25D36640" }}>
                              <MaterialCommunityIcons name="whatsapp" size={15} color="#25D366" />
                              <Text style={{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:"#25D366" }}>واتساب</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ── TAB: JOIN ── */}
      {activeTab === "join" && (
        joinSuccess ? (
          <View style={s.successState}>
            <Animated.View entering={ZoomIn.springify()}>
              <LinearGradient colors={[Colors.primary+"20", Colors.cardBg]} style={s.successCard}>
                <View style={s.successIcon}>
                  <Ionicons name="checkmark-circle" size={56} color={Colors.primary} />
                </View>
                <Text style={s.successTitle}>تم إرسال طلبك بنجاح!</Text>
                <Text style={s.successSub}>سيتم مراجعة طلب انضمام مؤسستك من قِبل الإدارة وإخطارك بالنتيجة قريباً.</Text>
                <AnimatedPress style={s.successBtn} onPress={()=>{ setJoinSuccess(false); setActiveTab("institutions"); }}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.successBtnInner}>
                    <Text style={s.successBtnText}>تصفح المؤسسات</Text>
                  </LinearGradient>
                </AnimatedPress>
              </LinearGradient>
            </Animated.View>
          </View>
        ) : (
          <JoinRequestForm onSubmit={handleJoinSubmit} onCancel={()=>setActiveTab("institutions")} />
        )
      )}

      {/* ── TAB: UNION ── */}
      {activeTab === "union" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify()}>
            <LinearGradient colors={["#6366F118", Colors.cardBg]} style={{ flexDirection:"row-reverse", alignItems:"center", gap:12, padding:16, borderRadius:18, marginBottom:20, borderWidth:1, borderColor:"#6366F130" }}>
              <View style={{ width:52, height:52, borderRadius:16, backgroundColor:"#6366F120", alignItems:"center", justifyContent:"center" }}>
                <Ionicons name="people-circle" size={32} color="#6366F1" />
              </View>
              <View style={{ flex:1 }}>
                <Text style={{ fontFamily:"Cairo_700Bold", fontSize:16, color:Colors.textPrimary, textAlign:"right" }}>إتحاد الطلاب</Text>
                <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", lineHeight:18 }}>صوت الطالب في الحصاحيصا — انضم وتفاعل وشارك</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {[
            { title:"انضم للإتحاد",        sub:"قدّم طلب عضوية وكن جزءاً من الحركة الطلابية",  icon:"person-add-outline",     color:"#6366F1", route:"/student-union-join" },
            { title:"تواصل مع الإتحاد",   sub:"راسل الإتحاد واستفسر عن الأنشطة والعضوية",      icon:"chatbubble-ellipses-outline", color:"#3B82F6", route:"/student-union-contact" },
            { title:"إدارة الإتحاد",       sub:"لوحة مشرفي الإتحاد لمراجعة طلبات الانضمام",    icon:"shield-checkmark-outline", color:"#8B5CF6", route:"/student-union-admin" },
          ].map((item, i) => (
            <Animated.View key={item.route} entering={FadeInDown.delay(i*80).springify()}>
              <AnimatedPress onPress={() => { if(Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); nav.push(item.route as any); }}>
                <LinearGradient colors={[item.color+"18", item.color+"06"]} style={{ borderRadius:20, borderWidth:1, borderColor:item.color+"40", padding:18, flexDirection:"row-reverse", alignItems:"center", gap:14, marginBottom:14 }}>
                  <View style={{ width:54, height:54, borderRadius:16, backgroundColor:item.color+"25", alignItems:"center", justifyContent:"center" }}>
                    <Ionicons name={item.icon as any} size={28} color={item.color} />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontFamily:"Cairo_700Bold", fontSize:16, color:Colors.textPrimary, textAlign:"right" }}>{item.title}</Text>
                    <Text style={{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textMuted, textAlign:"right", marginTop:3 }}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={20} color={item.color} />
                </LinearGradient>
              </AnimatedPress>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* ── TAB: ADMIN ── */}
      {activeTab === "admin" && isAdmin && (
        <View style={s.flex1}>
          {/* Admin Sub Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ borderBottomWidth:1, borderBottomColor:Colors.divider, backgroundColor:Colors.cardBg }}
            contentContainerStyle={{ flexDirection:"row-reverse", gap:4, paddingHorizontal:12, paddingVertical:8 }}>
            {([
              { key:"requests"      as const, label:"طلبات الانضمام",  icon:"time-outline",            badge: pendingReqs.length },
              { key:"registrations" as const, label:"طلبات التسجيل",   icon:"person-add-outline",       badge: adminRegs.filter(r=>r.status==="pending").length },
              { key:"transfers"     as const, label:"طلبات النقل",      icon:"swap-horizontal-outline",  badge: adminTrfs.filter(t=>t.status==="pending").length },
              { key:"manage"        as const, label:"المؤسسات",         icon:"list-outline",             badge: 0 },
              { key:"add"           as const, label:"إضافة",            icon:"add-circle-outline",       badge: 0 },
            ]).map(t => (
              <AnimatedPress key={t.key} style={[s.adminSubTab, adminSubTab===t.key && s.adminSubTabActive]}
                onPress={()=>{ if(Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAdminSubTab(t.key as any); }}>
                <Ionicons name={t.icon as any} size={14} color={adminSubTab===t.key?Colors.primary:Colors.textMuted} />
                <Text style={[s.adminSubTabText, adminSubTab===t.key && { color: Colors.primary }]}>{t.label}</Text>
                {t.badge>0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{t.badge}</Text></View>}
              </AnimatedPress>
            ))}
          </ScrollView>

          {/* Requests */}
          {adminSubTab === "requests" && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
              {requests.length === 0 ? (
                <View style={s.emptyState}>
                  <Ionicons name="mail-open-outline" size={52} color={Colors.textMuted} />
                  <Text style={s.emptyTitle}>لا توجد طلبات انضمام</Text>
                </View>
              ) : requests.map((req, i) => (
                <Animated.View key={req.id} entering={FadeInDown.delay(i*60).springify()}>
                  <RequestCard req={req}
                    onApprove={()=>approveRequest(req)}
                    onReject={()=>rejectRequest(req.id)} />
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {/* Registrations */}
          {adminSubTab === "registrations" && (
            <View style={s.flex1}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth:1, borderBottomColor:Colors.divider }}
                contentContainerStyle={{ flexDirection:"row-reverse", gap:6, padding:10 }}>
                {(["all","pending","approved","rejected"] as const).map(st => (
                  <AnimatedPress key={st} onPress={()=>setFormsRegStatus(st)}
                    style={[s.filterChip, formsRegStatus===st && s.filterChipActive]}>
                    <Text style={[s.filterChipText, formsRegStatus===st && s.filterChipTextActive]}>
                      {st==="all"?"الكل":st==="pending"?"قيد المراجعة":st==="approved"?"مقبول":"مرفوض"}
                    </Text>
                  </AnimatedPress>
                ))}
              </ScrollView>
              <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {formsLoading ? (
                  <View style={s.emptyState}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                  </View>
                ) : adminRegs.length === 0 ? (
                  <View style={s.emptyState}>
                    <Ionicons name="person-add-outline" size={52} color={Colors.textMuted} />
                    <Text style={s.emptyTitle}>لا توجد طلبات تسجيل</Text>
                  </View>
                ) : adminRegs.map((reg, i) => (
                  <Animated.View key={reg.id} entering={FadeInDown.delay(i*40).springify()}>
                    <View style={s.manageCard}>
                      <View style={s.manageCardTop}>
                        <View style={s.manageCardActions}>
                          {reg.status === "pending" && (
                            <>
                              <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.danger+"20" }]}
                                onPress={()=>Alert.alert("رفض الطلب","هل تريد رفض هذا الطلب؟",[{text:"إلغاء",style:"cancel"},{text:"رفض",style:"destructive",onPress:()=>updateRegStatus(reg.id,"rejected")}])}>
                                <Ionicons name="close-outline" size={18} color={Colors.danger} />
                              </AnimatedPress>
                              <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.primary+"20" }]}
                                onPress={()=>updateRegStatus(reg.id,"approved")}>
                                <Ionicons name="checkmark-outline" size={18} color={Colors.primary} />
                              </AnimatedPress>
                            </>
                          )}
                        </View>
                        <View style={s.manageCardInfo}>
                          <Text style={s.manageCardName}>{reg.student_name}</Text>
                          <Text style={s.manageCardType}>{reg.institution_name} · {reg.grade}</Text>
                          <Text style={[s.manageCardType, { fontSize:11, marginTop:2, color:Colors.textMuted }]}>
                            {reg.parent_name} · {reg.parent_phone}
                          </Text>
                          <Text style={[s.manageCardType, { fontSize:10, marginTop:2, color:Colors.textMuted }]}>
                            {reg.reg_number}
                          </Text>
                        </View>
                        <View style={[s.manageIconBox, { backgroundColor: Colors.primary+"20" }]}>
                          <Ionicons name="person-add-outline" size={22} color={Colors.primary} />
                        </View>
                      </View>
                      <View style={[s.statusRow, { justifyContent:"space-between" }]}>
                        <Text style={[s.statusLabel, { fontSize:10 }]}>
                          {new Date(reg.created_at).toLocaleDateString("ar-EG")}
                        </Text>
                        <View style={s.statusRow}>
                          <View style={[s.statusDot, { backgroundColor:
                            reg.status==="approved"?Colors.primary:
                            reg.status==="pending"?Colors.accent:Colors.danger }]} />
                          <Text style={s.statusLabel}>
                            {reg.status==="approved"?"مقبول":reg.status==="pending"?"قيد المراجعة":"مرفوض"}
                          </Text>
                        </View>
                      </View>
                      {reg.admin_notes ? (
                        <Text style={[s.manageCardType, { fontSize:11, marginTop:6, color:Colors.textMuted, textAlign:"right" }]}>
                          ملاحظة: {reg.admin_notes}
                        </Text>
                      ) : null}
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Transfers */}
          {adminSubTab === "transfers" && (
            <View style={s.flex1}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth:1, borderBottomColor:Colors.divider }}
                contentContainerStyle={{ flexDirection:"row-reverse", gap:6, padding:10 }}>
                {(["all","pending","approved","rejected"] as const).map(st => (
                  <AnimatedPress key={st} onPress={()=>setFormsTrfStatus(st)}
                    style={[s.filterChip, formsTrfStatus===st && s.filterChipActive]}>
                    <Text style={[s.filterChipText, formsTrfStatus===st && s.filterChipTextActive]}>
                      {st==="all"?"الكل":st==="pending"?"قيد المراجعة":st==="approved"?"مقبول":"مرفوض"}
                    </Text>
                  </AnimatedPress>
                ))}
              </ScrollView>
              <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {formsLoading ? (
                  <View style={s.emptyState}>
                    <ActivityIndicator color={Colors.primary} size="large" />
                  </View>
                ) : adminTrfs.length === 0 ? (
                  <View style={s.emptyState}>
                    <Ionicons name="swap-horizontal-outline" size={52} color={Colors.textMuted} />
                    <Text style={s.emptyTitle}>لا توجد طلبات نقل</Text>
                  </View>
                ) : adminTrfs.map((trf, i) => (
                  <Animated.View key={trf.id} entering={FadeInDown.delay(i*40).springify()}>
                    <View style={s.manageCard}>
                      <View style={s.manageCardTop}>
                        <View style={s.manageCardActions}>
                          {trf.status === "pending" && (
                            <>
                              <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.danger+"20" }]}
                                onPress={()=>Alert.alert("رفض طلب النقل","هل تريد رفض هذا الطلب؟",[{text:"إلغاء",style:"cancel"},{text:"رفض",style:"destructive",onPress:()=>updateTrfStatus(trf.id,"rejected")}])}>
                                <Ionicons name="close-outline" size={18} color={Colors.danger} />
                              </AnimatedPress>
                              <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.primary+"20" }]}
                                onPress={()=>updateTrfStatus(trf.id,"approved")}>
                                <Ionicons name="checkmark-outline" size={18} color={Colors.primary} />
                              </AnimatedPress>
                            </>
                          )}
                        </View>
                        <View style={s.manageCardInfo}>
                          <Text style={s.manageCardName}>{trf.student_name}</Text>
                          <Text style={s.manageCardType}>{trf.from_institution_name} → {trf.to_institution_name}</Text>
                          <Text style={[s.manageCardType, { fontSize:11, marginTop:2, color:Colors.textMuted }]}>
                            {trf.parent_phone} · {trf.transfer_reason}
                          </Text>
                          <Text style={[s.manageCardType, { fontSize:10, marginTop:2, color:Colors.textMuted }]}>
                            {trf.transfer_number}
                          </Text>
                        </View>
                        <View style={[s.manageIconBox, { backgroundColor: Colors.accent+"20" }]}>
                          <Ionicons name="swap-horizontal-outline" size={22} color={Colors.accent} />
                        </View>
                      </View>
                      <View style={[s.statusRow, { justifyContent:"space-between" }]}>
                        <Text style={[s.statusLabel, { fontSize:10 }]}>
                          {new Date(trf.created_at).toLocaleDateString("ar-EG")}
                        </Text>
                        <View style={s.statusRow}>
                          <View style={[s.statusDot, { backgroundColor:
                            trf.status==="approved"?Colors.primary:
                            trf.status==="pending"?Colors.accent:Colors.danger }]} />
                          <Text style={s.statusLabel}>
                            {trf.status==="approved"?"مقبول":trf.status==="pending"?"قيد المراجعة":"مرفوض"}
                          </Text>
                        </View>
                      </View>
                      {trf.admin_notes ? (
                        <Text style={[s.manageCardType, { fontSize:11, marginTop:6, color:Colors.textMuted, textAlign:"right" }]}>
                          ملاحظة: {trf.admin_notes}
                        </Text>
                      ) : null}
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Manage */}
          {adminSubTab === "manage" && (
            <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
              {institutions.map((inst, i) => (
                <Animated.View key={inst.id} entering={FadeInDown.delay(i*50).springify()}>
                  <View style={s.manageCard}>
                    <View style={s.manageCardTop}>
                      <View style={s.manageCardActions}>
                        <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.danger+"20" }]}
                          onPress={()=>deleteInst(inst.id)}>
                          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                        </AnimatedPress>
                        <AnimatedPress style={[s.manageActionBtn, { backgroundColor: Colors.accent+"20" }]}
                          onPress={()=>{ setEditInst(inst); setFormVisible(true); }}>
                          <Ionicons name="create-outline" size={16} color={Colors.accent} />
                        </AnimatedPress>
                      </View>
                      <View style={s.manageCardInfo}>
                        <Text style={s.manageCardName}>{inst.name}</Text>
                        <Text style={s.manageCardType}>{INST_LABELS[inst.type]} · {inst.address}</Text>
                      </View>
                      <View style={[s.manageIconBox, { backgroundColor: INST_COLORS[inst.type]+"20" }]}>
                        <Ionicons name={INST_ICONS[inst.type] as any} size={22} color={INST_COLORS[inst.type]} />
                      </View>
                    </View>
                    <View style={s.statusRow}>
                      <View style={[s.statusDot, { backgroundColor: inst.status==="active"?Colors.primary:inst.status==="pending"?Colors.accent:Colors.danger }]} />
                      <Text style={s.statusLabel}>{inst.status==="active"?"نشط":inst.status==="pending"?"معلق":"مرفوض"}</Text>
                    </View>
                  </View>
                </Animated.View>
              ))}
            </ScrollView>
          )}

          {/* Add */}
          {adminSubTab === "add" && (
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingTop: 8 }]} showsVerticalScrollIndicator={false}>
              <Animated.View entering={FadeInDown.springify()}>
                <LinearGradient colors={[Colors.primary+"12", Colors.cardBg]} style={s.addBanner}>
                  <Ionicons name="add-circle" size={28} color={Colors.primary} />
                  <Text style={s.addBannerText}>إضافة مؤسسة تعليمية مباشرةً إلى الدليل</Text>
                </LinearGradient>
              </Animated.View>
              <AnimatedPress style={s.addBtn} onPress={()=>{ setEditInst(undefined); setFormVisible(true); }}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={s.addBtnInner}>
                  <Ionicons name="add-circle-outline" size={22} color="#000" />
                  <Text style={s.addBtnText}>إضافة مؤسسة جديدة</Text>
                </LinearGradient>
              </AnimatedPress>
              <View style={s.statsGrid}>
                {([
                  { label:"مؤسسات نشطة",   value: activeInsts.length,                      color: Colors.primary },
                  { label:"طلبات معلقة",    value: pendingReqs.length,                      color: Colors.accent  },
                  { label:"مدارس أساسية",   value: activeInsts.filter(i=>i.type==="primary").length, color:"#27AE60" },
                  { label:"ثانويات",         value: activeInsts.filter(i=>i.type==="secondary").length, color:"#2E7D9A" },
                  { label:"معاهد وجامعات", value: activeInsts.filter(i=>i.type==="institute"||i.type==="university").length, color:"#6A5ACD" },
                  { label:"قرآن ورياض",    value: activeInsts.filter(i=>i.type==="quran"||i.type==="kindergarten").length, color:Colors.accent },
                ] as const).map((stat, i) => (
                  <Animated.View key={stat.label} entering={FadeInDown.delay(i*60).springify()} style={s.statCard}>
                    <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </Animated.View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Forms Tab Styles ─────────────────────────────────────────────────────────
const fo = StyleSheet.create({
  banner:      { flexDirection:"row-reverse", alignItems:"center", gap:12, padding:16, borderRadius:18, marginBottom:16, borderWidth:1, borderColor:Colors.primary+"30" },
  bannerIcon:  { width:52, height:52, borderRadius:16, backgroundColor:Colors.primary+"20", alignItems:"center", justifyContent:"center" },
  bannerTitle: { fontFamily:"Cairo_700Bold", fontSize:15, color:Colors.textPrimary, textAlign:"right", marginBottom:2 },
  bannerSub:   { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", lineHeight:18 },

  card:        { borderRadius:20, overflow:"hidden", marginBottom:16, borderWidth:1.5 },
  cardInner:   { padding:18 },
  cardTop:     { flexDirection:"row-reverse", alignItems:"flex-start", gap:12, marginBottom:12 },
  cardIcon:    { width:58, height:58, borderRadius:18, alignItems:"center", justifyContent:"center" },
  tagBadge:    { borderRadius:8, paddingHorizontal:8, paddingVertical:3, alignSelf:"flex-end", marginBottom:4 },
  tagText:     { fontFamily:"Cairo_600SemiBold", fontSize:10 },
  cardTitle:   { fontFamily:"Cairo_700Bold", fontSize:16, color:Colors.textPrimary, textAlign:"right" },
  cardDesc:    { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"right", lineHeight:20, marginBottom:14 },

  stepsRow:    { flexDirection:"row-reverse", gap:8, marginBottom:14, flexWrap:"wrap" },
  stepItem:    { flexDirection:"row-reverse", alignItems:"center", gap:6 },
  stepNum:     { width:22, height:22, borderRadius:11, alignItems:"center", justifyContent:"center", borderWidth:1 },
  stepNumText: { fontFamily:"Cairo_700Bold", fontSize:11 },
  stepText:    { fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.textSecondary },

  cta:         { flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:8, borderRadius:14, paddingVertical:12 },
  ctaText:     { fontFamily:"Cairo_700Bold", fontSize:14, color:"#000" },

  guideBox:    { backgroundColor:Colors.cardBg, borderRadius:16, padding:16, marginBottom:16, borderWidth:1, borderColor:Colors.divider },
  guideTitle:  { fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.textPrimary, textAlign:"right", marginBottom:10 },
  guideRow:    { flexDirection:"row-reverse", alignItems:"flex-start", gap:8, marginBottom:8 },
  guideText:   { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, flex:1, textAlign:"right", lineHeight:19 },

  docsBox:     { backgroundColor:Colors.cardBg, borderRadius:16, padding:16, marginBottom:20, borderWidth:1, borderColor:Colors.accent+"30" },
  docsHeader:  { flexDirection:"row-reverse", alignItems:"center", gap:8, marginBottom:12 },
  docsTitle:   { fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.accent },
  docsSectionTitle:{ fontFamily:"Cairo_600SemiBold", fontSize:13, color:Colors.textPrimary, textAlign:"right", marginBottom:6 },
  docRow:      { flexDirection:"row-reverse", alignItems:"center", gap:8, marginBottom:5 },
  docDot:      { width:6, height:6, borderRadius:3, backgroundColor:Colors.accent },
  docText:     { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, flex:1, textAlign:"right" },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex:1, backgroundColor:Colors.bg },
  flex1:       { flex:1 },
  scroll:      { flex:1 },
  scrollContent:{ padding:16, paddingBottom:140 },
  header:      { paddingHorizontal:16, paddingBottom:12, borderBottomWidth:1, borderBottomColor:Colors.divider },
  headerTop:   { marginBottom:12 },
  headerTitleRow:{ flexDirection:"row-reverse", alignItems:"center", gap:10, marginBottom:8 },
  headerIcon:  { width:44, height:44, borderRadius:14, backgroundColor:Colors.primary+"15", justifyContent:"center", alignItems:"center" },
  headerTitle: { fontFamily:"Cairo_700Bold", fontSize:20, color:Colors.textPrimary, flex:1, textAlign:"right" },
  headerSub:   { fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right" },
  adminBtn:    { width:40, height:40, borderRadius:12, backgroundColor:Colors.cardBg, justifyContent:"center", alignItems:"center", borderWidth:1, borderColor:Colors.divider },
  statsRow:    { flexDirection:"row-reverse", gap:8, marginBottom:4 },
  statPill:    { flexDirection:"row-reverse", alignItems:"center", gap:4, backgroundColor:Colors.primary+"15", borderRadius:8, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:Colors.primary+"30" },
  statText:    { fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.primary },

  tabsContent: { flexDirection:"row-reverse", paddingHorizontal:0, gap:4, paddingBottom:2 },
  tabBtn:      { flexDirection:"row-reverse", alignItems:"center", gap:5, paddingHorizontal:14, paddingVertical:8, borderRadius:12, backgroundColor:"transparent", position:"relative" },
  tabBtnActive:{ backgroundColor:Colors.primary+"10" },
  tabBtnText:  { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textMuted },
  tabBtnTextActive:{ color:Colors.primary, fontFamily:"Cairo_600SemiBold" },
  tabActiveLine:{ position:"absolute", bottom:0, left:8, right:8, height:2, borderRadius:1 },
  tabBadge:    { backgroundColor:Colors.danger, borderRadius:10, paddingHorizontal:5, paddingVertical:1, minWidth:16, alignItems:"center" },
  tabBadgeText:{ fontFamily:"Cairo_700Bold", fontSize:9, color:"#fff" },

  sectionTitle:{ fontFamily:"Cairo_700Bold", fontSize:16, color:Colors.textPrimary, textAlign:"right", marginBottom:14 },
  svcsGrid:    { flexDirection:"row-reverse", flexWrap:"wrap", gap:12, marginBottom:16 },
  svcCardWrap: { width:"47%" },
  svcCard:     { borderRadius:16, overflow:"hidden", borderWidth:1, borderColor:Colors.divider },
  svcCardInner:{ padding:16, alignItems:"flex-end", minHeight:150 },
  svcIconCircle:{ width:50, height:50, borderRadius:14, justifyContent:"center", alignItems:"center", marginBottom:10 },
  svcTitle:    { fontFamily:"Cairo_700Bold", fontSize:13, color:Colors.textPrimary, textAlign:"right", marginBottom:4 },
  svcDesc:     { fontFamily:"Cairo_400Regular", fontSize:11, color:Colors.textSecondary, textAlign:"right", lineHeight:17, flex:1 },
  svcTag:      { borderRadius:6, paddingHorizontal:8, paddingVertical:3, marginTop:8 },
  svcTagText:  { fontFamily:"Cairo_500Medium", fontSize:10 },

  tipCard:     { borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:Colors.accent+"30" },
  tipHeader:   { flexDirection:"row-reverse", alignItems:"center", gap:8, marginBottom:8 },
  tipTitle:    { fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.accent },
  tipText:     { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"right", lineHeight:20 },

  filtersRow:   { maxHeight:52, borderBottomWidth:1, borderBottomColor:Colors.divider },
  filtersContent:{ flexDirection:"row-reverse", paddingHorizontal:16, alignItems:"center", gap:8, paddingVertical:8 },
  filterChip:   { paddingHorizontal:14, paddingVertical:6, borderRadius:10, backgroundColor:Colors.cardBg, borderWidth:1, borderColor:Colors.divider },
  filterChipActive:{ backgroundColor:Colors.primary+"20", borderColor:Colors.primary+"60" },
  filterChipText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textMuted },
  filterChipTextActive:{ color:Colors.primary, fontFamily:"Cairo_600SemiBold" },

  emptyState:  { alignItems:"center", paddingVertical:60, gap:10 },
  emptyTitle:  { fontFamily:"Cairo_700Bold", fontSize:16, color:Colors.textSecondary, textAlign:"center" },
  emptySub:    { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textMuted, textAlign:"center" },

  successState:{ flex:1, justifyContent:"center", padding:24 },
  successCard: { borderRadius:24, padding:28, alignItems:"center", borderWidth:1, borderColor:Colors.primary+"30" },
  successIcon: { width:80, height:80, borderRadius:22, backgroundColor:Colors.primary+"20", justifyContent:"center", alignItems:"center", marginBottom:16 },
  successTitle:{ fontFamily:"Cairo_700Bold", fontSize:20, color:Colors.textPrimary, textAlign:"center", marginBottom:8 },
  successSub:  { fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textSecondary, textAlign:"center", lineHeight:22, marginBottom:20 },
  successBtn:  { width:"100%", borderRadius:14, overflow:"hidden" },
  successBtnInner:{ paddingVertical:14, alignItems:"center" },
  successBtnText:{ fontFamily:"Cairo_700Bold", fontSize:15, color:"#000" },

  adminSubTabs:{ flexDirection:"row-reverse", gap:4, paddingHorizontal:16, paddingVertical:10, borderBottomWidth:1, borderBottomColor:Colors.divider, backgroundColor:Colors.cardBg },
  adminSubTab: { flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:5, paddingVertical:8, borderRadius:10 },
  adminSubTabActive:{ backgroundColor:Colors.primary+"15" },
  adminSubTabText:{ fontFamily:"Cairo_500Medium", fontSize:12, color:Colors.textMuted },

  manageCard:  { backgroundColor:Colors.cardBg, borderRadius:14, padding:14, marginBottom:10, borderWidth:1, borderColor:Colors.divider },
  manageCardTop:{ flexDirection:"row-reverse", alignItems:"center", gap:10, marginBottom:8 },
  manageIconBox:{ width:42, height:42, borderRadius:12, justifyContent:"center", alignItems:"center" },
  manageCardInfo:{ flex:1 },
  manageCardName:{ fontFamily:"Cairo_700Bold", fontSize:14, color:Colors.textPrimary, textAlign:"right" },
  manageCardType:{ fontFamily:"Cairo_400Regular", fontSize:12, color:Colors.textSecondary, textAlign:"right", marginTop:2 },
  manageCardActions:{ flexDirection:"row", gap:8 },
  manageActionBtn:{ width:34, height:34, borderRadius:10, justifyContent:"center", alignItems:"center" },
  statusRow:   { flexDirection:"row-reverse", alignItems:"center", gap:6 },
  statusDot:   { width:7, height:7, borderRadius:4 },
  statusLabel: { fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.textMuted },

  addBanner:   { flexDirection:"row-reverse", alignItems:"center", gap:12, padding:16, borderRadius:16, marginBottom:16, borderWidth:1, borderColor:Colors.primary+"30" },
  addBannerText:{ fontFamily:"Cairo_600SemiBold", fontSize:14, color:Colors.textPrimary, textAlign:"right", flex:1 },
  addBtn:      { borderRadius:16, overflow:"hidden", marginBottom:20 },
  addBtnInner: { flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:16 },
  addBtnText:  { fontFamily:"Cairo_700Bold", fontSize:16, color:"#000" },
  statsGrid:   { flexDirection:"row-reverse", flexWrap:"wrap", gap:12 },
  statCard:    { width:"30%", backgroundColor:Colors.cardBg, borderRadius:14, padding:14, alignItems:"center", borderWidth:1, borderColor:Colors.divider },
  statValue:   { fontFamily:"Cairo_700Bold", fontSize:24 },
  statLabel:   { fontFamily:"Cairo_500Medium", fontSize:11, color:Colors.textSecondary, textAlign:"center", marginTop:4 },

  pinBackdrop: { flex:1, backgroundColor:"rgba(0,0,0,0.8)", justifyContent:"center", alignItems:"center", padding:24 },
  pinSheet:    { width:"100%", borderRadius:24, overflow:"hidden" },
  pinInner:    { padding:28, alignItems:"center", borderRadius:24, borderWidth:1, borderColor:Colors.divider },
  pinIconCircle:{ width:68, height:68, borderRadius:20, backgroundColor:Colors.primary+"20", justifyContent:"center", alignItems:"center", marginBottom:16 },
  pinTitle:    { fontFamily:"Cairo_700Bold", fontSize:18, color:Colors.textPrimary, textAlign:"center", marginBottom:6 },
  pinSub:      { fontFamily:"Cairo_400Regular", fontSize:13, color:Colors.textSecondary, textAlign:"center", marginBottom:16, lineHeight:20 },
  pinInput:    { width:"100%", backgroundColor:Colors.bg, borderRadius:14, padding:14, fontFamily:"Cairo_700Bold", fontSize:22, color:Colors.textPrimary, borderWidth:2, borderColor:Colors.divider, letterSpacing:8, textAlign:"center", marginBottom:8 },
  pinError:    { fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.danger, marginBottom:8 },
  pinBtns:     { flexDirection:"row-reverse", gap:10, width:"100%", marginTop:8 },
  pinBtn:      { flex:1, borderRadius:12, overflow:"hidden" },
  pinBtnGrad:  { paddingVertical:13, alignItems:"center" },
  pinBtnText:  { fontFamily:"Cairo_700Bold", fontSize:15 },
});
