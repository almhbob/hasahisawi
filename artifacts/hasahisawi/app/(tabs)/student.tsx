import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Linking, TextInput, Modal, Alert, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
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
    id:"i1", name:"مدرسة حصاحيصا الأساسية الأولى", type:"primary",
    address:"حي الضحى، حصاحيصا", phone:"+249912345700",
    principal:"الأستاذ/ أحمد محمد علي",
    grades:"الصف الأول – الثامن", shifts:"صباحية",
    services:["enrollment","transfer","textbooks","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i2", name:"مدرسة البنات الأساسية", type:"primary",
    address:"حي السلام، حصاحيصا", phone:"+249912345701",
    principal:"الأستاذة/ فاطمة إبراهيم",
    grades:"الصف الأول – الثامن", shifts:"صباحية",
    services:["enrollment","transfer","textbooks"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i3", name:"ثانوية حصاحيصا الكبرى", type:"secondary",
    address:"المنطقة المركزية، حصاحيصا", phone:"+249912345702",
    principal:"الأستاذ/ محمد الأمين",
    grades:"الصف التاسع – الثاني عشر", shifts:"صباحية ومسائية",
    services:["results","enrollment","transfer","activity","guidance","exam","textbooks"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i4", name:"ثانوية البنات بحصاحيصا", type:"secondary",
    address:"شارع المدارس، حصاحيصا", phone:"+249912345703",
    principal:"الأستاذة/ آمنة عبدالله",
    grades:"الصف التاسع – الثاني عشر", shifts:"صباحية",
    services:["results","enrollment","transfer","activity","exam"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i5", name:"معهد التقنية والحاسوب", type:"institute",
    address:"شارع السوق، حصاحيصا", phone:"+249912345704",
    principal:"الأستاذ/ عمر محمد",
    grades:"شهادة تقنية ومهنية", shifts:"صباحية ومسائية",
    services:["enrollment","scholarship","tutoring","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i6", name:"كلية حصاحيصا الجامعية", type:"university",
    address:"جنوب حصاحيصا", phone:"+249912345705",
    principal:"الدكتور/ يوسف الحسن",
    grades:"بكالوريوس", shifts:"صباحية",
    services:["enrollment","scholarship","library","activity","guidance"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i7", name:"روضة الزهور", type:"kindergarten",
    address:"حي الأزهار، حصاحيصا", phone:"+249912345706",
    grades:"3 – 6 سنوات", shifts:"صباحية",
    services:["enrollment","activity"],
    status:"active", createdAt: new Date().toISOString(),
  },
  {
    id:"i8", name:"خلوة الشيخ عبدالرحمن", type:"quran",
    address:"حي الإسلامي، حصاحيصا", phone:"+249912345707",
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

// ─── Storage Helpers ─────────────────────────────────────────────────────────
export async function loadInstitutions(): Promise<Institution[]> {
  const init = await AsyncStorage.getItem(INST_INIT_KEY);
  if (!init) {
    await AsyncStorage.setItem(INST_KEY, JSON.stringify(SEED_INSTITUTIONS));
    await AsyncStorage.setItem(INST_INIT_KEY, "1");
    return SEED_INSTITUTIONS;
  }
  const raw = await AsyncStorage.getItem(INST_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveInstitutions(list: Institution[]) {
  await AsyncStorage.setItem(INST_KEY, JSON.stringify(list));
}
async function loadRequests(): Promise<JoinRequest[]> {
  const raw = await AsyncStorage.getItem(REQ_KEY);
  return raw ? JSON.parse(raw) : [];
}
async function saveRequests(list: JoinRequest[]) {
  await AsyncStorage.setItem(REQ_KEY, JSON.stringify(list));
}
async function getAdminPin(): Promise<string> {
  const stored = await AsyncStorage.getItem(ADMIN_PIN_KEY);
  return stored || DEFAULT_PIN;
}

// ─── Student Services Data ───────────────────────────────────────────────────
const STUDENT_SERVICES = [
  { id:"ss1",  type:"results"    as ServiceType, icon:"ribbon-outline",        color:"#2E7D9A",  title:"نتائج الشهادة السودانية",    desc:"الاستعلام عن نتائج امتحانات الشهادة الثانوية والأساسية",       contact:"وزارة التربية والتعليم – الجزيرة", phone:"+249151234567" },
  { id:"ss2",  type:"office"     as ServiceType, icon:"document-text-outline", color:Colors.primary, title:"مكتب التربية والتعليم", desc:"التسجيل، النقل، الشهادات الرسمية، وتصحيح الأخطاء",       contact:"مكتب التربية – حصاحيصا",         phone:"+249152345678" },
  { id:"ss3",  type:"enrollment" as ServiceType, icon:"person-add-outline",    color:"#27AE60",  title:"قيد وتسجيل التلاميذ",        desc:"قيد التلاميذ الجدد وإجراءات تسجيلهم في المدارس",              contact:"إدارة التعليم الأساسي",          phone:"+249153456789" },
  { id:"ss4",  type:"transfer"   as ServiceType, icon:"swap-horizontal-outline",color:"#8E44AD", title:"نقل وثائق الطلاب",           desc:"إجراءات نقل الوثائق المدرسية والانتساب بين المدارس",           contact:"مكتب التربية – حصاحيصا",         phone:"+249154567890" },
  { id:"ss5",  type:"library"    as ServiceType, icon:"library-outline",       color:"#6A5ACD",  title:"المكتبة العامة",              desc:"استعارة الكتب والمراجع الدراسية والبحثية",                     contact:"المكتبة العامة – حصاحيصا",       phone:"+249155678901" },
  { id:"ss6",  type:"tutoring"   as ServiceType, icon:"people-outline",        color:Colors.accent, title:"الدروس الخصوصية والمراكز",desc:"دليل المدرسين والمراكز التعليمية الخاصة في المنطقة",           contact:"اتحاد المدرسين – حصاحيصا",      phone:"+249156789012" },
  { id:"ss7",  type:"scholarship",               icon:"medal-outline",         color:"#E67E22",  title:"المنح والبعثات الدراسية",     desc:"فرص المنح المحلية والخارجية، وبرامج البعثات للطلاب المتفوقين", contact:"إدارة المنح – ولاية الجزيرة",    phone:"+249157890123" },
  { id:"ss8",  type:"activity"   as ServiceType, icon:"trophy-outline",        color:"#C0392B",  title:"النشاط الطلابي",              desc:"الأندية الطلابية، والمسابقات العلمية والثقافية والرياضية",      contact:"مكتب النشاط المدرسي",           phone:"+249158901234" },
  { id:"ss9",  type:"textbooks"  as ServiceType, icon:"book-outline",          color:"#1E6E8A",  title:"الكتب المدرسية المجانية",     desc:"توزيع الكتب المدرسية المجانية والمقررات الدراسية",              contact:"مخزن الكتب – مكتب التربية",      phone:"+249159012345" },
  { id:"ss10", type:"guidance"   as ServiceType, icon:"heart-outline",         color:"#FF6B35",  title:"التوجيه والإرشاد الطلابي",   desc:"الإرشاد النفسي والاجتماعي ودعم الطلاب ذوي الاحتياجات الخاصة", contact:"قسم التوجيه – مكتب التربية",    phone:"+249150123456" },
  { id:"ss11", type:"exam"       as ServiceType, icon:"create-outline",        color:"#E74C3C",  title:"الاستعداد للامتحانات",        desc:"جداول الامتحانات وبنوك الأسئلة ونصائح الاستذكار للطلاب",       contact:"لجنة الامتحانات – حصاحيصا",     phone:"+249151234560" },
  { id:"ss12", type:"transport"  as ServiceType, icon:"bus-outline",           color:"#16A085",  title:"المواصلات المدرسية",          desc:"خطوط المواصلات وأسعار الحافلات المدرسية في المنطقة",           contact:"اتحاد المواصلات – حصاحيصا",     phone:"+249152345670" },
];

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

// ─── Service Detail Modal ─────────────────────────────────────────────────────
function ServiceDetailModal({ svc, visible, onClose }: { svc: typeof STUDENT_SERVICES[0] | null; visible: boolean; onClose: () => void }) {
  if (!svc) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={md.backdrop}>
        <Animated.View entering={ZoomIn.springify().damping(18)} style={md.sheet}>
          <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]} style={md.sheetInner}>
            <View style={[md.iconCircle, { backgroundColor: svc.color + "20" }]}>
              <Ionicons name={svc.icon as any} size={36} color={svc.color} />
            </View>
            <Text style={md.title}>{svc.title}</Text>
            <Text style={md.desc}>{svc.desc}</Text>
            <View style={md.contactBox}>
              <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
              <Text style={md.contactText}>{svc.contact}</Text>
            </View>
            <View style={md.actions}>
              <AnimatedPress style={[md.callBtn, { backgroundColor: svc.color }]}
                onPress={() => { Linking.openURL(`tel:${svc.phone}`); }}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={md.callBtnText}>اتصل الآن</Text>
              </AnimatedPress>
              <AnimatedPress style={md.closeBtn} onPress={onClose}>
                <Text style={md.closeBtnText}>إغلاق</Text>
              </AnimatedPress>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}
const md = StyleSheet.create({
  backdrop:   { flex:1, backgroundColor:"rgba(0,0,0,0.75)", justifyContent:"center", alignItems:"center", padding:24 },
  sheet:      { width:"100%", borderRadius:24, overflow:"hidden" },
  sheetInner: { padding:28, alignItems:"center", borderRadius:24, borderWidth:1, borderColor:Colors.divider },
  iconCircle: { width:72, height:72, borderRadius:20, justifyContent:"center", alignItems:"center", marginBottom:16 },
  title:      { fontFamily:"Cairo_700Bold", fontSize:18, color:Colors.textPrimary, textAlign:"center", marginBottom:8 },
  desc:       { fontFamily:"Cairo_400Regular", fontSize:14, color:Colors.textSecondary, textAlign:"center", lineHeight:22, marginBottom:16 },
  contactBox: { flexDirection:"row-reverse", alignItems:"center", gap:6, backgroundColor:Colors.bg, borderRadius:10, padding:10, marginBottom:20, width:"100%" },
  contactText:{ fontFamily:"Cairo_500Medium", fontSize:13, color:Colors.textSecondary, textAlign:"right", flex:1 },
  actions:    { flexDirection:"row-reverse", gap:10, width:"100%" },
  callBtn:    { flex:1, flexDirection:"row-reverse", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:12, borderRadius:12 },
  callBtnText:{ fontFamily:"Cairo_700Bold", fontSize:14, color:"#fff" },
  closeBtn:   { flex:1, alignItems:"center", justifyContent:"center", paddingVertical:12, borderRadius:12, backgroundColor:Colors.bg, borderWidth:1, borderColor:Colors.divider },
  closeBtnText:{ fontFamily:"Cairo_600SemiBold", fontSize:14, color:Colors.textSecondary },
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
        <View style={fm.backdrop}>
          <View style={fm.sheet}>
            <LinearGradient colors={[Colors.cardBgElevated, Colors.cardBg]} style={fm.inner}>
              <View style={fm.titleRow}>
                <AnimatedPress onPress={onClose}><Ionicons name="close-circle" size={26} color={Colors.textMuted} /></AnimatedPress>
                <Text style={fm.title}>{initial?.id ? "تعديل المؤسسة" : "إضافة مؤسسة جديدة"}</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={fm.label}>اسم المؤسسة *</Text>
                <TextInput style={fm.input} value={name} onChangeText={setName} placeholder="اسم المؤسسة التعليمية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={fm.label}>نوع المؤسسة *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingBottom:4 }}>
                  {(Object.keys(INST_LABELS) as InstType[]).map(k => (
                    <AnimatedPress key={k} style={[fm.typeChip, type===k && { backgroundColor: INST_COLORS[k]+"30", borderColor: INST_COLORS[k]+"80" }]} onPress={()=>setType(k)}>
                      <Text style={[fm.typeChipText, type===k && { color: INST_COLORS[k] }]}>{INST_LABELS[k]}</Text>
                    </AnimatedPress>
                  ))}
                </ScrollView>

                <Text style={fm.label}>العنوان *</Text>
                <TextInput style={fm.input} value={address} onChangeText={setAddress} placeholder="الحي والشارع" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={fm.label}>رقم الهاتف *</Text>
                <TextInput style={fm.input} value={phone} onChangeText={setPhone} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />

                <Text style={fm.label}>اسم المدير / الناظر</Text>
                <TextInput style={fm.input} value={principal} onChangeText={setPrincipal} placeholder="الاسم الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={fm.label}>الصفوف الدراسية</Text>
                <TextInput style={fm.input} value={grades} onChangeText={setGrades} placeholder="مثال: الصف الأول – الثامن" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={fm.label}>الفترة الزمنية</Text>
                <TextInput style={fm.input} value={shifts} onChangeText={setShifts} placeholder="صباحية / مسائية / صباحية ومسائية" placeholderTextColor={Colors.textMuted} textAlign="right" />

                <Text style={fm.label}>وصف إضافي</Text>
                <TextInput style={[fm.input, { height:80, textAlignVertical:"top", paddingTop:10 }]} value={desc} onChangeText={setDesc} placeholder="نبذة عن المؤسسة..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />

                <Text style={fm.label}>الخدمات المتاحة</Text>
                <View style={fm.svcsGrid}>
                  {ALL_SVC_TYPES.map(s => (
                    <AnimatedPress key={s} style={[fm.svcCheck, svcs.includes(s) && fm.svcCheckActive]} onPress={()=>toggleSvc(s)}>
                      <Ionicons name={svcs.includes(s)?"checkmark-circle":"ellipse-outline"} size={14} color={svcs.includes(s)?Colors.primary:Colors.textMuted} />
                      <Text style={[fm.svcCheckText, svcs.includes(s) && { color: Colors.primary }]}>{SVC_LABELS[s]}</Text>
                    </AnimatedPress>
                  ))}
                </View>

                <AnimatedPress style={fm.saveBtn} onPress={handleSave}>
                  <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={fm.saveBtnInner}>
                    <Ionicons name="save-outline" size={18} color="#000" />
                    <Text style={fm.saveBtnText}>حفظ</Text>
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
const fm = StyleSheet.create({
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Tab = "services" | "institutions" | "join" | "admin";

export default function StudentScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [activeTab, setActiveTab]         = useState<Tab>("services");
  const [instFilter, setInstFilter]       = useState<"all" | InstType>("all");
  const [institutions, setInstitutions]   = useState<Institution[]>([]);
  const [requests, setRequests]           = useState<JoinRequest[]>([]);
  const [selectedSvc, setSelectedSvc]     = useState<typeof STUDENT_SERVICES[0] | null>(null);
  const [svcModalVisible, setSvcModalVisible] = useState(false);

  // Admin
  const [isAdmin, setIsAdmin]             = useState(false);
  const [pinModal, setPinModal]           = useState(false);
  const [pinInput, setPinInput]           = useState("");
  const [pinError, setPinError]           = useState("");
  const [adminSubTab, setAdminSubTab]     = useState<"requests" | "manage" | "add">("requests");
  const [editInst, setEditInst]           = useState<Institution | undefined>(undefined);
  const [formVisible, setFormVisible]     = useState(false);

  // Join success
  const [joinSuccess, setJoinSuccess]     = useState(false);

  const load = async () => {
    const [insts, reqs] = await Promise.all([loadInstitutions(), loadRequests()]);
    setInstitutions(insts);
    setRequests(reqs);
    const adminStatus = await AsyncStorage.getItem(ADMIN_KEY);
    setIsAdmin(adminStatus === "true");
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

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
    const newInst: Institution = {
      id: `inst_${Date.now()}`,
      name: req.institutionName, type: req.instType,
      address: req.address, phone: req.phone,
      description: req.description,
      services: req.requestedServices,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    const updatedInsts = [...institutions, newInst];
    const updatedReqs  = requests.map(r => r.id === req.id ? { ...r, status: "approved" as const } : r);
    await Promise.all([saveInstitutions(updatedInsts), saveRequests(updatedReqs)]);
    setInstitutions(updatedInsts);
    setRequests(updatedReqs);
  };

  const rejectRequest = async (reqId: string) => {
    const updatedReqs = requests.map(r => r.id === reqId ? { ...r, status: "rejected" as const } : r);
    await saveRequests(updatedReqs);
    setRequests(updatedReqs);
  };

  const saveInst = async (inst: Institution) => {
    const idx = institutions.findIndex(i => i.id === inst.id);
    const updated = idx >= 0
      ? institutions.map(i => i.id === inst.id ? inst : i)
      : [...institutions, inst];
    await saveInstitutions(updated);
    setInstitutions(updated);
    setFormVisible(false);
    setEditInst(undefined);
  };

  const deleteInst = async (id: string) => {
    Alert.alert("حذف المؤسسة", "هل أنت متأكد؟", [
      { text:"إلغاء", style:"cancel" },
      { text:"حذف", style:"destructive", onPress: async () => {
        const updated = institutions.filter(i => i.id !== id);
        await saveInstitutions(updated);
        setInstitutions(updated);
      }},
    ]);
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
    { key:"join",         label:"انضمام",    icon:"add-circle-outline" },
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

      {/* Service Detail Modal */}
      <ServiceDetailModal svc={selectedSvc} visible={svcModalVisible} onClose={()=>setSvcModalVisible(false)} />

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
              <Text style={s.headerSub}>حصاحيصا التعليمية</Text>
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
          <Text style={s.sectionTitle}>اختر الخدمة التي تحتاجها</Text>
          <View style={s.svcsGrid}>
            {STUDENT_SERVICES.map((svc, i) => (
              <Animated.View key={svc.id} entering={FadeInDown.delay(i*50).springify().damping(18)} style={s.svcCardWrap}>
                <AnimatedPress style={s.svcCard} onPress={()=>{ setSelectedSvc(svc); setSvcModalVisible(true); }}>
                  <LinearGradient colors={[svc.color+"15", Colors.cardBg]} style={s.svcCardInner}>
                    <View style={[s.svcIconCircle, { backgroundColor: svc.color+"20" }]}>
                      <Ionicons name={svc.icon as any} size={28} color={svc.color} />
                    </View>
                    <Text style={s.svcTitle}>{svc.title}</Text>
                    <Text style={s.svcDesc} numberOfLines={2}>{svc.desc}</Text>
                    <View style={[s.svcTag, { backgroundColor: svc.color+"20" }]}>
                      <Text style={[s.svcTagText, { color: svc.color }]}>{SVC_LABELS[svc.type as ServiceType] || ""}</Text>
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
            <Text style={s.tipText}>يعمل مكتب التربية والتعليم بحصاحيصا من الأحد إلى الخميس، من 8 صباحاً حتى 2 ظهراً. للحالات الطارئة تواصل عبر الأرقام المخصصة.</Text>
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

      {/* ── TAB: ADMIN ── */}
      {activeTab === "admin" && isAdmin && (
        <View style={s.flex1}>
          {/* Admin Sub Tabs */}
          <View style={s.adminSubTabs}>
            {([
              { key:"requests" as const, label:"الطلبات",   icon:"time-outline",           badge: pendingReqs.length },
              { key:"manage"   as const, label:"المؤسسات",  icon:"list-outline",           badge: 0 },
              { key:"add"      as const, label:"إضافة",     icon:"add-circle-outline",     badge: 0 },
            ] as const).map(t => (
              <AnimatedPress key={t.key} style={[s.adminSubTab, adminSubTab===t.key && s.adminSubTabActive]}
                onPress={()=>{ if(Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAdminSubTab(t.key); }}>
                <Ionicons name={t.icon as any} size={16} color={adminSubTab===t.key?Colors.primary:Colors.textMuted} />
                <Text style={[s.adminSubTabText, adminSubTab===t.key && { color: Colors.primary }]}>{t.label}</Text>
                {t.badge>0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{t.badge}</Text></View>}
              </AnimatedPress>
            ))}
          </View>

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
