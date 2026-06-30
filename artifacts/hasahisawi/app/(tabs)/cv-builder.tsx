import React, { useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Platform, Dimensions, Share, KeyboardAvoidingView, Image, Switch,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import ModernHeader from "@/components/ui/ModernHeader";

type TemplateId = "sidebar" | "executive" | "classic" | "minimal" | "modern" | "clean" | "ats" | "creative";

type CVTemplate = {
  id: TemplateId;
  name: string;
  style: string;
  desc: string;
  primaryColor: string;
  accentColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  supportsPhoto: boolean;
  status: "free" | "paid" | "hidden";
  price: number;
};

type CVData = {
  name: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  summary: string;
  education: EducationItem[];
  experience: ExperienceItem[];
  skills: string[];
  languages: string[];
  courses: string[];
  photoUri?: string;
  showPhoto: boolean;
};

type EducationItem = { degree: string; institution: string; year: string };
type ExperienceItem = { position: string; company: string; period: string; desc: string };

const CV_TEMPLATES: CVTemplate[] = [
  { id: "sidebar", name: "Hasahisawi Sidebar", style: "Modern Sidebar", desc: "شريط جانبي داكن وصورة اختيارية مثل القوالب العالمية", primaryColor: "#263248", accentColor: "#C9D8C4", icon: "reader-outline", supportsPhoto: true, status: "free", price: 0 },
  { id: "executive", name: "Hasahisawi Executive", style: "Executive", desc: "كحلي وذهبي، مناسب للإدارة والمحاسبة والمبيعات", primaryColor: "#1D2F46", accentColor: "#D6A21E", icon: "ribbon-outline", supportsPhoto: true, status: "free", price: 0 },
  { id: "classic", name: "Hasahisawi Classic", style: "Elegant Classic", desc: "رسمي ومرتب للوظائف التقليدية والجامعية", primaryColor: "#2F3430", accentColor: "#8A8F86", icon: "briefcase-outline", supportsPhoto: true, status: "free", price: 0 },
  { id: "minimal", name: "Hasahisawi Minimal", style: "Minimal", desc: "نظيف وبسيط بدون ازدحام بصري", primaryColor: "#30343B", accentColor: "#BFC5C0", icon: "square-outline", supportsPhoto: false, status: "free", price: 0 },
  { id: "modern", name: "Hasahisawi Modern", style: "Creative Director", desc: "عنوان واضح وصورة بارزة ومساحة خبرات منظمة", primaryColor: "#24364F", accentColor: "#D49A2A", icon: "layers-outline", supportsPhoto: true, status: "free", price: 0 },
  { id: "clean", name: "Hasahisawi Clean", style: "Clean Two Column", desc: "عمود معلومات جانبي وصفحة بيضاء أنيقة", primaryColor: "#46505E", accentColor: "#BFD8C5", icon: "document-text-outline", supportsPhoto: true, status: "free", price: 0 },
  { id: "ats", name: "Hasahisawi ATS", style: "ATS Friendly", desc: "مناسب للتقديم الإلكتروني وأنظمة فرز السير الذاتية", primaryColor: "#111827", accentColor: "#4B5563", icon: "checkmark-done-outline", supportsPhoto: false, status: "free", price: 0 },
  { id: "creative", name: "Hasahisawi Creative", style: "Bold Profile", desc: "تصميم جريء للمجالات الإبداعية والتسويق", primaryColor: "#2F2A35", accentColor: "#C79A43", icon: "color-palette-outline", supportsPhoto: true, status: "free", price: 0 },
];

const CV_COLORS = ["#1D2F46", "#263248", "#2F3430", "#30343B", "#46505E", "#1FA971", "#D49A2A", "#111827"];
const STEPS = [
  { id: 0, label: "النموذج", icon: "albums-outline" as const },
  { id: 1, label: "البيانات", icon: "person-outline" as const },
  { id: 2, label: "الخبرات", icon: "briefcase-outline" as const },
  { id: 3, label: "المهارات", icon: "star-outline" as const },
  { id: 4, label: "المعاينة", icon: "eye-outline" as const },
];

const EMPTY_CV: CVData = {
  name: "", title: "", phone: "", email: "", address: "", website: "", summary: "",
  education: [{ degree: "", institution: "", year: "" }],
  experience: [{ position: "", company: "", period: "", desc: "" }],
  skills: [""], languages: ["العربية"], courses: [""], photoUri: "", showPhoto: false,
};

const { width } = Dimensions.get("window");

function InputField({ label, value, onChangeText, placeholder, multiline = false, keyboardType = "default" }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={Colors.textMuted}
        style={[s.input, multiline && { height: 92, textAlignVertical: "top" }]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function esc(v?: string) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function brandFooter() {
  return `<div class="hsw-footer">◈ Powered by <strong>Hasahisawi</strong></div>`;
}

function buildCVHtml(cv: CVData, template: CVTemplate, color: string): string {
  const p = color || template.primaryColor;
  const a = template.accentColor;
  const skills = cv.skills.filter(Boolean);
  const langs = cv.languages.filter(Boolean);
  const courses = cv.courses.filter(Boolean);
  const education = cv.education.filter(e => e.degree || e.institution);
  const experience = cv.experience.filter(e => e.position || e.company);
  const contact = [cv.phone, cv.email, cv.website, cv.address].filter(Boolean).map(x => `<div class="contact-line">${esc(x)}</div>`).join("");
  const photo = cv.showPhoto && cv.photoUri
    ? `<img class="photo" src="${cv.photoUri}"/>`
    : `<div class="photo no-photo">CV</div>`;
  const photoBlock = cv.showPhoto ? photo : "";
  const skillList = skills.map(x => `<li>${esc(x)}</li>`).join("");
  const langList = langs.map(x => `<li>${esc(x)}</li>`).join("");
  const courseList = courses.map(x => `<li>${esc(x)}</li>`).join("");
  const eduList = education.map(e => `<div class="item"><b>${esc(e.degree)}</b><span>${esc(e.institution)}${e.year ? " · " + esc(e.year) : ""}</span></div>`).join("");
  const expList = experience.map(e => `<div class="item"><b>${esc(e.position)}</b><span>${esc(e.company)}${e.period ? " · " + esc(e.period) : ""}</span>${e.desc ? `<p>${esc(e.desc)}</p>` : ""}</div>`).join("");

  if (template.id === "ats") {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
      body{font-family:Arial,Tahoma,sans-serif;margin:34px;color:#111;background:#fff;line-height:1.55;font-size:12px}.name{font-size:27px;font-weight:900}.title{font-size:14px;margin-top:4px;color:#333}.contact{margin:10px 0 18px;color:#333}.section{margin-top:17px}.section h2{font-size:14px;border-bottom:1px solid #111;padding-bottom:4px;margin:0 0 8px}.item{margin-bottom:9px}.item b{display:block;font-size:13px}.item span{display:block;color:#555;font-size:11px}.item p{margin:4px 0 0;color:#333}ul{margin:0;padding-right:18px}.hsw-footer{position:fixed;bottom:14px;left:0;right:0;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:5px;background:#fff}
    </style></head><body><div class="name">${esc(cv.name) || "الاسم الكامل"}</div><div class="title">${esc(cv.title)}</div><div class="contact">${contact}</div>${cv.summary ? `<div class="section"><h2>الملخص المهني</h2><p>${esc(cv.summary)}</p></div>` : ""}${experience.length ? `<div class="section"><h2>الخبرة العملية</h2>${expList}</div>` : ""}${education.length ? `<div class="section"><h2>التعليم</h2>${eduList}</div>` : ""}${skills.length ? `<div class="section"><h2>المهارات</h2><ul>${skillList}</ul></div>` : ""}${langs.length ? `<div class="section"><h2>اللغات</h2><ul>${langList}</ul></div>` : ""}${courses.length ? `<div class="section"><h2>الدورات</h2><ul>${courseList}</ul></div>` : ""}${brandFooter()}</body></html>`;
  }

  const sidebar = template.id === "sidebar" || template.id === "classic" || template.id === "clean";
  const shape = template.id === "modern" || template.id === "creative" ? "pill" : "box";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;margin:0;background:#fff;color:#1f2937;font-size:11.5px;line-height:1.52}.page{min-height:100vh;display:flex;direction:rtl}.side{width:${sidebar ? "32%" : "0"};background:${p};color:#fff;padding:${sidebar ? "28px 22px" : "0"};display:${sidebar ? "block" : "none"}}.main{flex:1;padding:30px 34px 42px}.top{display:flex;gap:20px;align-items:center;margin-bottom:22px;direction:rtl}.headline{flex:1}.name{font-size:31px;letter-spacing:.5px;font-weight:900;color:${sidebar ? p : p};line-height:1.05}.role{font-size:14px;color:#555;margin-top:7px;letter-spacing:1px}.photo{width:112px;height:112px;border-radius:${shape === "pill" ? "28px" : "56px"};object-fit:cover;border:5px solid ${a};background:#eee}.no-photo{display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:${p};background:${a}35}.side .photo{margin:0 auto 22px;display:flex}.side h3{font-size:13px;letter-spacing:2px;border-bottom:1px solid rgba(255,255,255,.32);padding-bottom:7px;margin:22px 0 10px}.contact-line{font-size:11px;margin-bottom:8px;color:${sidebar ? "rgba(255,255,255,.86)" : "#4b5563"}}.section{margin-bottom:22px}.section-title{font-size:14px;font-weight:900;letter-spacing:1.4px;color:${p};border-bottom:2px solid ${a};padding-bottom:7px;margin-bottom:12px;text-transform:uppercase}.item{margin-bottom:13px;padding-right:14px;border-right:2px solid ${p}55}.item b{display:block;font-size:13px;color:#111}.item span{display:block;color:#6b7280;font-size:10.5px;margin-top:2px}.item p{margin:5px 0 0;color:#374151}.summary{border-right:5px solid ${a};background:${p}09;padding:12px 14px;border-radius:10px;color:#374151}.tags{display:flex;flex-wrap:wrap;gap:7px}.tag{background:${p}12;color:${p};border:1px solid ${p}35;border-radius:999px;padding:5px 10px;font-weight:700;font-size:10.5px}.side .tag{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.2)}ul{margin:0;padding-right:18px}.side ul{padding-right:15px}.side li{color:#fff;margin-bottom:5px}.hsw-footer{position:fixed;bottom:14px;left:0;right:0;text-align:center;font-size:9px;color:#9ca3af;letter-spacing:.5px;border-top:1px solid #e5e7eb;padding-top:5px;background:rgba(255,255,255,.86)}${!sidebar ? `.main{padding:34px 44px}.top{border-bottom:4px solid ${p};padding-bottom:18px}.section-title{display:inline-block;border-bottom:0;background:${p};color:#fff;padding:6px 14px;border-radius:999px;margin-bottom:14px}.item{border-right:0;border-left:1px solid #ddd;padding:0 0 0 16px}` : ""}
  </style></head><body><div class="page">${sidebar ? `<aside class="side">${photoBlock}<h3>CONTACT</h3>${contact || "—"}${skills.length ? `<h3>SKILLS</h3><div class="tags">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>` : ""}${langs.length ? `<h3>LANGUAGE</h3><ul>${langList}</ul>` : ""}${courses.length ? `<h3>COURSES</h3><ul>${courseList}</ul>` : ""}</aside>` : ""}<main class="main"><div class="top">${!sidebar ? photoBlock : ""}<div class="headline"><div class="name">${esc(cv.name) || "YOUR NAME"}</div><div class="role">${esc(cv.title) || "PROFESSIONAL TITLE"}</div>${!sidebar ? `<div class="contact" style="margin-top:12px">${contact}</div>` : ""}</div></div>${cv.summary ? `<section class="section"><div class="section-title">Professional Profile</div><div class="summary">${esc(cv.summary)}</div></section>` : ""}${experience.length ? `<section class="section"><div class="section-title">Work Experience</div>${expList}</section>` : ""}${education.length ? `<section class="section"><div class="section-title">Education</div>${eduList}</section>` : ""}${!sidebar && skills.length ? `<section class="section"><div class="section-title">Skills</div><div class="tags">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div></section>` : ""}${!sidebar && langs.length ? `<section class="section"><div class="section-title">Languages</div><ul>${langList}</ul></section>` : ""}${!sidebar && courses.length ? `<section class="section"><div class="section-title">Courses</div><ul>${courseList}</ul></section>` : ""}</main></div>${brandFooter()}</body></html>`;
}

function CVPreview({ cv, template, color }: { cv: CVData; template: CVTemplate; color: string }) {
  const p = color || template.primaryColor;
  const photo = cv.showPhoto && cv.photoUri;
  return (
    <View style={s.previewSheet}>
      <View style={[s.previewSide, { backgroundColor: p }]}>
        {cv.showPhoto ? photo ? <Image source={{ uri: cv.photoUri }} style={s.previewPhoto} /> : <View style={s.previewPhotoPlaceholder}><Text style={{ color: p, fontWeight: "900" }}>CV</Text></View> : null}
        <Text style={s.previewSideTitle}>CONTACT</Text>
        {[cv.phone, cv.email, cv.address].filter(Boolean).map((x, i) => <Text key={i} style={s.previewSideText}>{x}</Text>)}
        <Text style={s.previewSideTitle}>SKILLS</Text>
        {cv.skills.filter(Boolean).slice(0, 6).map((x, i) => <Text key={i} style={s.previewSideText}>• {x}</Text>)}
      </View>
      <View style={s.previewMain}>
        <Text style={[s.previewName, { color: p }]}>{cv.name || "YOUR NAME"}</Text>
        <Text style={s.previewRole}>{cv.title || "PROFESSIONAL TITLE"}</Text>
        {cv.summary ? <Text style={s.previewSummary}>{cv.summary}</Text> : null}
        <PreviewSection title="Experience" color={p} items={cv.experience.filter(e => e.position).map(e => `${e.position} — ${e.company}`)} />
        <PreviewSection title="Education" color={p} items={cv.education.filter(e => e.degree).map(e => `${e.degree} — ${e.institution}`)} />
      </View>
    </View>
  );
}

function PreviewSection({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (!items.length) return null;
  return <View style={{ marginTop: 14 }}><Text style={[s.previewSectionTitle, { borderColor: color, color }]}>{title}</Text>{items.slice(0, 3).map((x, i) => <Text key={i} style={s.previewItem}>• {x}</Text>)}</View>;
}

export default function CVBuilderScreen() {
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<CVTemplate>(CV_TEMPLATES[0]);
  const [selectedColor, setSelectedColor] = useState(CV_TEMPLATES[0].primaryColor);
  const [cv, setCv] = useState<CVData>({ ...EMPTY_CV });
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const selectedForPreview = useMemo(() => ({ ...selectedTemplate, primaryColor: selectedColor }), [selectedTemplate, selectedColor]);

  function updateCv(field: keyof CVData, value: any) { setCv(prev => ({ ...prev, [field]: value })); }
  function updateEducation(index: number, field: keyof EducationItem, value: string) { const arr = [...cv.education]; arr[index] = { ...arr[index], [field]: value }; updateCv("education", arr); }
  function updateExperience(index: number, field: keyof ExperienceItem, value: string) { const arr = [...cv.experience]; arr[index] = { ...arr[index], [field]: value }; updateCv("experience", arr); }
  function updateListItem(field: "skills" | "languages" | "courses", index: number, value: string) { const arr = [...cv[field]]; arr[index] = value; updateCv(field, arr); }
  function addListItem(field: "skills" | "languages" | "courses") { updateCv(field, [...cv[field], ""]); }

  async function pickCvPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return Alert.alert("إذن مطلوب", "اسمح للتطبيق بالوصول للصور");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (!result.canceled && result.assets[0]) { updateCv("photoUri", result.assets[0].uri); updateCv("showPhoto", true); }
  }

  async function handleDownload() {
    if (!cv.name.trim()) return Alert.alert("تنبيه", "يرجى إدخال الاسم الكامل أولاً");
    setLoading(true);
    try {
      const html = buildCVHtml(cv, selectedForPreview, selectedColor);
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${cv.name || "cv"}.html`; a.click(); URL.revokeObjectURL(url);
        Alert.alert("تم التحميل", "تم تحميل ملف السيرة الذاتية بنجاح");
      } else {
        const Print = require("expo-print");
        const Sharing = require("expo-sharing");
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "مشاركة السيرة الذاتية" });
        else Alert.alert("تم الحفظ", "تم حفظ السيرة الذاتية كـ PDF");
      }
    } catch { Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الملف"); }
    finally { setLoading(false); }
  }

  async function handleShare() {
    await Share.share({ title: "مشاركة السيرة الذاتية", message: `سيرتي الذاتية — ${cv.name}\n${cv.title}\nأُنشئت عبر Hasahisawi` });
  }

  function nextStep() { if (step < STEPS.length - 1) { setStep(x => x + 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }
  function prevStep() { if (step > 0) { setStep(x => x - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }

  return (
    <View style={s.container}>
      <Animated.View entering={FadeInDown.duration(350)}>
        <ModernHeader
          title="قوالب السيرة الذاتية"
          subtitle="مجانية الآن · صورة اختيارية · ألوان قابلة للتعديل"
          showBack
          onBack={() => router.back()}
          rightSlot={
            <TouchableOpacity onPress={handleShare} style={s.shareBtn} hitSlop={12}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </TouchableOpacity>
          }
        />
      </Animated.View>

      <View style={s.stepsBar}>{STEPS.map((st, i) => <TouchableOpacity key={st.id} onPress={() => setStep(i)} style={s.stepItem}><View style={[s.stepCircle, step === i && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}><Ionicons name={st.icon} size={14} color={step === i ? "#001" : Colors.textMuted} /></View><Text style={[s.stepLabel, step === i && { color: Colors.primary }]}>{st.label}</Text></TouchableOpacity>)}</View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {step === 0 && <Animated.View entering={FadeInDown.delay(80).springify()}>
            <Text style={s.sectionTitle}>اختر النموذج الذي يناسبك قبل تعبئة البيانات</Text>
            <View style={s.freeNotice}><Ionicons name="checkmark-circle" size={16} color="#22C55E"/><Text style={s.freeNoticeText}>كل القوالب مجانية حاليًا — يمكن تسعيرها لاحقًا من الإدارة</Text></View>
            <Text style={s.fieldLabel}>لون القالب</Text>
            <View style={s.colorRow}>{CV_COLORS.map(c => <TouchableOpacity key={c} onPress={() => setSelectedColor(c)} style={[s.colorDot, { backgroundColor: c }, selectedColor === c && s.colorDotOn]} />)}</View>
            <View style={{ gap: 12 }}>{CV_TEMPLATES.map((tmpl, i) => <TemplateCard key={tmpl.id} tmpl={tmpl} selected={selectedTemplate.id === tmpl.id} color={selectedColor} index={i} onPress={() => { setSelectedTemplate(tmpl); if (!selectedColor) setSelectedColor(tmpl.primaryColor); }} />)}</View>
          </Animated.View>}

          {step === 1 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 6 }}>
            <Text style={s.sectionTitle}>البيانات الأساسية</Text>
            <InputField label="الاسم الكامل" value={cv.name} onChangeText={v => updateCv("name", v)} />
            <InputField label="المسمى الوظيفي" value={cv.title} onChangeText={v => updateCv("title", v)} placeholder="مثال: محاسب / موظف مبيعات" />
            <InputField label="الهاتف" value={cv.phone} onChangeText={v => updateCv("phone", v)} keyboardType="phone-pad" />
            <InputField label="البريد الإلكتروني" value={cv.email} onChangeText={v => updateCv("email", v)} keyboardType="email-address" />
            <InputField label="الموقع / لينكدإن" value={cv.website} onChangeText={v => updateCv("website", v)} />
            <InputField label="العنوان" value={cv.address} onChangeText={v => updateCv("address", v)} />
            <InputField label="نبذة مختصرة" value={cv.summary} onChangeText={v => updateCv("summary", v)} multiline />
            <View style={s.photoBox}><View style={{ flex: 1 }}><Text style={s.fieldLabel}>الصورة الشخصية</Text><Text style={s.helperText}>يمكن إنشاء السيرة بصورة أو بدون صورة</Text></View><Switch value={cv.showPhoto} onValueChange={v => updateCv("showPhoto", v)} /></View>
            {cv.showPhoto ? <View style={s.photoActions}>{cv.photoUri ? <Image source={{ uri: cv.photoUri }} style={s.cvPhotoPreview} /> : <View style={s.cvPhotoPlaceholder}><Text style={{ color: Colors.textMuted }}>CV</Text></View>}<TouchableOpacity onPress={pickCvPhoto} style={s.photoBtn}><Ionicons name="image-outline" size={18} color="#001"/><Text style={s.photoBtnText}>اختيار الصورة</Text></TouchableOpacity></View> : null}
          </Animated.View>}

          {step === 2 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 12 }}>
            <Text style={s.sectionTitle}>التعليم والخبرات</Text>
            <Text style={s.subTitle}>الخبرة العملية</Text>
            {cv.experience.map((e, i) => <View key={i} style={s.groupCard}><InputField label="المسمى" value={e.position} onChangeText={v => updateExperience(i, "position", v)} /><InputField label="الشركة" value={e.company} onChangeText={v => updateExperience(i, "company", v)} /><InputField label="الفترة" value={e.period} onChangeText={v => updateExperience(i, "period", v)} /><InputField label="الوصف" value={e.desc} onChangeText={v => updateExperience(i, "desc", v)} multiline /></View>)}
            <TouchableOpacity onPress={() => updateCv("experience", [...cv.experience, { position: "", company: "", period: "", desc: "" }])} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة خبرة</Text></TouchableOpacity>
            <Text style={s.subTitle}>التعليم</Text>
            {cv.education.map((e, i) => <View key={i} style={s.groupCard}><InputField label="المؤهل" value={e.degree} onChangeText={v => updateEducation(i, "degree", v)} /><InputField label="الجامعة / المؤسسة" value={e.institution} onChangeText={v => updateEducation(i, "institution", v)} /><InputField label="السنة" value={e.year} onChangeText={v => updateEducation(i, "year", v)} /></View>)}
            <TouchableOpacity onPress={() => updateCv("education", [...cv.education, { degree: "", institution: "", year: "" }])} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة تعليم</Text></TouchableOpacity>
          </Animated.View>}

          {step === 3 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 12 }}>
            <ListEditor title="المهارات" field="skills" items={cv.skills} update={updateListItem} add={addListItem} />
            <ListEditor title="اللغات" field="languages" items={cv.languages} update={updateListItem} add={addListItem} />
            <ListEditor title="الدورات" field="courses" items={cv.courses} update={updateListItem} add={addListItem} />
          </Animated.View>}

          {step === 4 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 14 }}>
            <Text style={s.sectionTitle}>المعاينة النهائية</Text>
            <CVPreview cv={cv} template={selectedForPreview} color={selectedColor} />
            <View style={s.brandNote}><Text style={s.brandNoteText}>سيظهر توقيع صغير أسفل الورقة: Powered by Hasahisawi</Text></View>
          </Animated.View>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={s.footer}>{step > 0 ? <TouchableOpacity onPress={prevStep} style={s.prevBtn}><Text style={s.prevText}>السابق</Text></TouchableOpacity> : <View style={{ flex: 1 }} />}{step < STEPS.length - 1 ? <TouchableOpacity onPress={nextStep} style={s.nextBtn}><Text style={s.nextText}>التالي</Text><Ionicons name="arrow-back" size={18} color="#001"/></TouchableOpacity> : <TouchableOpacity onPress={handleDownload} disabled={loading} style={[s.nextBtn, loading && { opacity: .65 }]}><Text style={s.nextText}>{loading ? "جاري التصدير..." : "تصدير PDF"}</Text><Ionicons name="download-outline" size={18} color="#001"/></TouchableOpacity>}</View>
    </View>
  );
}

function TemplateCard({ tmpl, selected, color, index, onPress }: { tmpl: CVTemplate; selected: boolean; color: string; index: number; onPress: () => void }) {
  return <Animated.View entering={FadeInDown.delay(70 + index * 45).springify()}><AnimatedPress onPress={onPress}><View style={[s.templateCard, selected && { borderColor: Colors.accent, backgroundColor: Colors.glassStrong || Colors.cardBg }]}><LinearGradient colors={[color || tmpl.primaryColor, tmpl.accentColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.templateMock}><View style={s.mockPaper}><View style={[s.mockSide, { backgroundColor: color || tmpl.primaryColor }]} /><View style={s.mockLines}><View style={[s.mockLine, { width: "70%" }]} /><View style={[s.mockLine, { width: "45%" }]} /><View style={[s.mockLineThin, { width: "88%" }]} /><View style={[s.mockLineThin, { width: "76%" }]} /></View></View></LinearGradient><View style={{ flex: 1 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}><Text style={s.templateName}>{tmpl.name}</Text><View style={s.freeBadge}><Text style={s.freeBadgeText}>Free</Text></View></View><Text style={s.templateStyle}>{tmpl.style}</Text><Text style={s.templateDesc}>{tmpl.desc}</Text></View>{selected ? <View style={s.checkBadge}><Ionicons name="checkmark" size={15} color="#001" /></View> : <Ionicons name={tmpl.icon} size={22} color={Colors.textMuted} />}</View></AnimatedPress></Animated.View>;
}

function ListEditor({ title, field, items, update, add }: { title: string; field: "skills" | "languages" | "courses"; items: string[]; update: (field: any, index: number, value: string) => void; add: (field: any) => void }) {
  return <View style={s.groupCard}><Text style={s.subTitle}>{title}</Text>{items.map((item, i) => <InputField key={i} label={`${title} ${i + 1}`} value={item} onChangeText={v => update(field, i, v)} />)}<TouchableOpacity onPress={() => add(field)} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة</Text></TouchableOpacity></View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  shareBtn: { width: 36, height: 36, borderRadius: Colors.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  stepsBar: { flexDirection: "row-reverse", paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle || Colors.divider, backgroundColor: Colors.bg },
  stepItem: { flex: 1, alignItems: "center", gap: 4 },
  stepCircle: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  stepLabel: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 10 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 18, textAlign: "right", marginBottom: 12 },
  subTitle: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 14, textAlign: "right", marginBottom: 6 },
  freeNotice: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: "#22C55E40", backgroundColor: "#22C55E18", padding: 10, marginBottom: 14 },
  freeNoticeText: { fontFamily: "Cairo_600SemiBold", color: "#22C55E", fontSize: 12, flex: 1, textAlign: "right" },
  colorRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginVertical: 10 },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,.25)" },
  colorDotOn: { borderWidth: 3, borderColor: Colors.accent, transform: [{ scale: 1.06 }] },
  templateCard: { minHeight: 112, borderRadius: Colors.radius.xl, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 12, overflow: "hidden", ...Colors.shadow.card },
  templateMock: { width: 82, height: 92, borderRadius: Colors.radius.md, padding: 7, justifyContent: "center" },
  mockPaper: { flex: 1, borderRadius: 8, backgroundColor: "#fff", flexDirection: "row", overflow: "hidden" },
  mockSide: { width: 22 }, mockLines: { flex: 1, padding: 7, gap: 5 }, mockLine: { height: 7, backgroundColor: "#111827", borderRadius: 3 }, mockLineThin: { height: 4, backgroundColor: "#CBD5E1", borderRadius: 3 },
  templateName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 14, textAlign: "right" },
  templateStyle: { fontFamily: "Cairo_600SemiBold", color: Colors.accent, fontSize: 11, textAlign: "right", marginTop: 2 },
  templateDesc: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 4, lineHeight: 18 },
  freeBadge: { backgroundColor: "#22C55E18", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#22C55E40" },
  freeBadgeText: { fontFamily: "Cairo_700Bold", color: "#22C55E", fontSize: 9 },
  checkBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  fieldWrap: { marginBottom: 10 }, fieldLabel: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12, textAlign: "right", marginBottom: 6 },
  input: { minHeight: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.cardBg, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", paddingHorizontal: 12, textAlign: "right" },
  groupCard: { borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, marginBottom: 10, ...Colors.shadow.card },
  addLine: { height: 42, borderRadius: Colors.radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 4 },
  addLineText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 12 },
  photoBox: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, marginBottom: 10, ...Colors.shadow.card },
  helperText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 3 },
  photoActions: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 },
  cvPhotoPreview: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: Colors.accent },
  cvPhotoPlaceholder: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  photoBtn: { flex: 1, height: 44, borderRadius: Colors.radius.md, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  photoBtnText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 },
  previewSheet: { height: Math.min(520, width * 1.28), borderRadius: Colors.radius.lg, overflow: "hidden", backgroundColor: "#F9FAFB", flexDirection: "row", borderWidth: 1, borderColor: Colors.border, ...Colors.shadow.card },
  previewSide: { width: "34%", padding: 12, alignItems: "center" }, previewMain: { flex: 1, padding: 16, backgroundColor: "#fff" },
  previewPhoto: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: "#fff", marginBottom: 12 }, previewPhotoPlaceholder: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  previewSideTitle: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 11, marginTop: 12, marginBottom: 6, alignSelf: "stretch", textAlign: "right" }, previewSideText: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,.86)", fontSize: 9, alignSelf: "stretch", textAlign: "right", marginBottom: 4 },
  previewName: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "right" }, previewRole: { fontFamily: "Cairo_400Regular", color: "#6B7280", fontSize: 12, textAlign: "right", marginTop: 3 }, previewSummary: { fontFamily: "Cairo_400Regular", color: "#374151", fontSize: 10, textAlign: "right", marginTop: 12, lineHeight: 16 }, previewSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 12, borderBottomWidth: 1, paddingBottom: 4, textAlign: "right" }, previewItem: { fontFamily: "Cairo_400Regular", color: "#374151", fontSize: 10, textAlign: "right", marginTop: 5 },
  brandNote: { borderRadius: Colors.radius.md, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, padding: 10 }, brandNoteText: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 11, textAlign: "center" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", gap: 10, padding: 14, backgroundColor: Colors.bgAlt || Colors.bg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle || Colors.divider },
  prevBtn: { flex: 1, height: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg }, prevText: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary },
  nextBtn: { flex: 1.3, height: 48, borderRadius: Colors.radius.md, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, nextText: { fontFamily: "Cairo_700Bold", color: "#001" },
});
