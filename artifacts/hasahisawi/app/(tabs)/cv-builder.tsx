import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Platform, Dimensions, Share, KeyboardAvoidingView, Image, Switch,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import ModernHeader from "@/components/ui/ModernHeader";
import AsyncStorage from "@react-native-async-storage/async-storage";
import CVFrame from "@/components/CVFrame";
import { CV_TEMPLATES, SAMPLE_CV, buildCVHtml, type CVData, type CVTemplateMeta } from "@/lib/cv-templates";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { useAuth } from "@/lib/auth-context";
import { profileApi } from "@/lib/profile-api";
import { volunteerApi } from "@/lib/volunteer";
import { cvFromProfile } from "@/lib/cv-from-profile";

const CV_STEPS = [
  { id: 0, label: "النموذج", icon: "albums-outline" as const },
  { id: 1, label: "البيانات", icon: "person-outline" as const },
  { id: 2, label: "الخبرات", icon: "briefcase-outline" as const },
  { id: 3, label: "المهارات", icon: "star-outline" as const },
  { id: 4, label: "المعاينة", icon: "eye-outline" as const },
];
const STEPS = CV_STEPS;
type EducationItem = CVData["education"][number];
type ExperienceItem = CVData["experience"][number];

const EMPTY_CV: CVData = {
  name: "", title: "", phone: "", email: "", address: "", website: "", summary: "",
  education: [{ degree: "", institution: "", year: "" }],
  experience: [{ position: "", company: "", period: "", desc: "" }],
  skills: [""], languages: ["العربية"], courses: [""], photoUri: "", showPhoto: false,
};
const DRAFT_KEY = "hsh_cv_draft_v2";

// عبارات جاهزة تُضاف للنبذة بضغطة
const SUMMARY_HINTS = [
  "أعمل بدقة والتزام وأحب تطوير مهاراتي باستمرار.",
  "قادر على العمل ضمن فريق وتحت ضغط مع الالتزام بالمواعيد.",
  "أمتلك مهارات تواصل جيدة وخبرة في خدمة العملاء.",
  "أبحث عن فرصة أضيف فيها قيمة حقيقية وأنمو مهنياً.",
  "أجيد استخدام الحاسوب وبرامج Office والإنترنت.",
];

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

export default function CVBuilderScreen() {
  const [step, setStep] = useState(0);
  const [tmpl, setTmpl] = useState<CVTemplateMeta>(CV_TEMPLATES[0]);
  const [color, setColor] = useState(CV_TEMPLATES[0].colors[0]);
  const [cv, setCv] = useState<CVData>({ ...EMPTY_CV });
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const { user, token, isGuest } = useAuth();
  const canFill = !!user && !isGuest && user.role !== "guest";
  const [filling, setFilling] = useState(false);
  const [fillMsg, setFillMsg] = useState("");
  const autoTried = useRef(false);
  const cvRef = useRef(cv);
  cvRef.current = cv;

  /** يجلب ملف العضو في حصاحيصاوي ويملأ الفارغ فقط — لا يكتب فوق ما كتبه. */
  async function fillFromProfile(silent = false) {
    if (!canFill || !user) return;
    setFilling(true);
    try {
      const [p, vol] = await Promise.all([
        profileApi.full(user.id, token).catch(() => null),
        volunteerApi.summary(user.id).catch(() => null),
      ]);
      const { cv: next, filled } = cvFromProfile(cvRef.current, p, user, vol);
      if (filled > 0) setCv(next);
      setFillMsg(filled > 0
        ? "عُبِّئت بياناتك من ملفك في حصاحيصاوي — راجعها وأكمل أو عدّل ما تريد."
        : silent ? "" : "لا توجد بيانات جديدة في ملفك لإضافتها — أكمل ملفك الشخصي لتُعبّأ سيرتك أسرع.");
    } finally { setFilling(false); }
  }
  const scrollRef = useRef<ScrollView>(null);
  const previewW = Math.min(width - 32, 420);

  // استعادة المسودة المحفوظة
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d?.cv) setCv({ ...EMPTY_CV, ...d.cv });
          const t = CV_TEMPLATES.find((x) => x.id === d?.template);
          if (t) { setTmpl(t); setColor(d?.color || t.colors[0]); }
        }
      } catch {}
      setRestored(true);
    })();
  }, []);
  // أول مرة بلا مسودة: نعبّئ السيرة تلقائياً من ملف العضو
  useEffect(() => {
    if (!restored || autoTried.current || !canFill) return;
    autoTried.current = true;
    const empty = !(cv.name.trim() || cv.title.trim() || cv.experience.some((x) => x.position));
    if (empty) fillFromProfile(true);
  }, [restored, canFill]);
  // حفظ تلقائي
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => { AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ cv, template: tmpl.id, color })).catch(() => {}); }, 600);
    return () => clearTimeout(t);
  }, [cv, tmpl, color, restored]);

  const hasData = !!(cv.name.trim() || cv.title.trim() || cv.experience.some((x) => x.position));
  const previewHtml = useMemo(() => buildCVHtml(hasData ? cv : { ...SAMPLE_CV, showPhoto: tmpl.photo }, tmpl.id, color), [cv, tmpl, color, hasData]);

  function updateCv(field: keyof CVData, value: any) { setCv(prev => ({ ...prev, [field]: value })); }
  function updateEducation(index: number, field: keyof EducationItem, value: string) { const arr = [...cv.education]; arr[index] = { ...arr[index], [field]: value }; updateCv("education", arr); }
  function updateExperience(index: number, field: keyof ExperienceItem, value: string) { const arr = [...cv.experience]; arr[index] = { ...arr[index], [field]: value }; updateCv("experience", arr); }
  function updateListItem(field: "skills" | "languages" | "courses", index: number, value: string) { const arr = [...cv[field]]; arr[index] = value; updateCv(field, arr); }
  function addListItem(field: "skills" | "languages" | "courses") { updateCv(field, [...cv[field], ""]); }
  function removeAt<K extends "experience" | "education" | "skills" | "languages" | "courses">(field: K, i: number) {
    const arr = [...(cv[field] as any[])]; arr.splice(i, 1); updateCv(field, arr.length ? arr : (field === "experience" ? [{ position: "", company: "", period: "", desc: "" }] : field === "education" ? [{ degree: "", institution: "", year: "" }] : [""]));
  }
  function chooseTemplate(t: CVTemplateMeta) { setTmpl(t); setColor(t.colors[0]); }

  async function pickCvPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return Alert.alert("إذن مطلوب", "اسمح للتطبيق بالوصول للصور");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled && result.assets[0]) { updateCv("photoUri", result.assets[0].uri); updateCv("showPhoto", true); }
  }

  async function photoDataUri(): Promise<string | undefined> {
    if (!cv.showPhoto || !cv.photoUri) return undefined;
    if (cv.photoUri.startsWith("data:") || cv.photoUri.startsWith("http")) return cv.photoUri;
    try {
      const FS = require("expo-file-system/legacy");
      const b64 = await FS.readAsStringAsync(cv.photoUri, { encoding: "base64" });
      return `data:image/jpeg;base64,${b64}`;
    } catch { return undefined; }
  }

  async function handleDownload() {
    if (!cv.name.trim()) { setStep(1); return Alert.alert("تنبيه", "اكتب الاسم الكامل أولاً"); }
    setLoading(true);
    try {
      const html = buildCVHtml(cv, tmpl.id, color, await photoDataUri());
      if (Platform.OS === "web") {
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 800); }
      } else {
        const Print = require("expo-print");
        const Sharing = require("expo-sharing");
        const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "مشاركة السيرة الذاتية", UTI: "com.adobe.pdf" });
        else Alert.alert("تم الحفظ", "تم إنشاء ملف PDF");
      }
    } catch { Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الملف"); }
    finally { setLoading(false); }
  }

  async function handleShare() {
    await Share.share({ title: "سيرتي الذاتية", message: `${cv.name || "سيرتي الذاتية"}${cv.title ? ` — ${cv.title}` : ""}\nأنشئ سيرتك مجاناً عبر تطبيق حصاحيصاوي` });
  }
  function resetDraft() {
    const go = () => { setCv({ ...EMPTY_CV }); AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); setStep(0); };
    if (Platform.OS === "web") { if ((globalThis as any).confirm?.("مسح كل البيانات والبدء من جديد؟")) go(); return; }
    Alert.alert("بدء سيرة جديدة", "سيتم مسح كل البيانات المكتوبة.", [{ text: "إلغاء", style: "cancel" }, { text: "مسح", style: "destructive", onPress: go }]);
  }

  function nextStep() { if (step < STEPS.length - 1) { setStep(x => x + 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }
  function prevStep() { if (step > 0) { setStep(x => x - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); } }

  return (
    <View style={s.container}>
      <Animated.View entering={FadeInDown.duration(350)}>
        <ModernHeader
          title="السيرة الذاتية"
          subtitle="6 نماذج عصرية · مجانية · PDF مطابق للمعاينة"
          showBack
          onBack={() => router.back()}
          rightSlot={
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity onPress={handleShare} style={s.shareBtn} hitSlop={12} accessibilityLabel="مشاركة"><Ionicons name="share-outline" size={20} color="#fff" /></TouchableOpacity>
              {hasData ? <TouchableOpacity onPress={resetDraft} style={s.shareBtn} hitSlop={12} accessibilityLabel="سيرة جديدة"><Ionicons name="refresh" size={19} color="#fff" /></TouchableOpacity> : null}
            </View>
          }
        />
      </Animated.View>

      <View style={s.stepsBar}>{STEPS.map((st, i) => <TouchableOpacity key={st.id} onPress={() => setStep(i)} style={s.stepItem}><View style={[s.stepCircle, step === i && { backgroundColor: Colors.primary, borderColor: Colors.primary }, i < step && { borderColor: Colors.primary }]}><Ionicons name={i < step ? "checkmark" : st.icon} size={14} color={step === i ? "#fff" : i < step ? Colors.primary : Colors.textMuted} /></View><Text style={[s.stepLabel, step === i && { color: Colors.primary }]}>{st.label}</Text></TouchableOpacity>)}</View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          {step === 0 && <Animated.View entering={FadeInDown.delay(60).springify()}>
            <Text style={s.sectionTitle}>اختر النموذج</Text>
            <RtlScrollRow contentContainerStyle={s.tmplRow}>
              {CV_TEMPLATES.map((t) => {
                const on = t.id === tmpl.id;
                return (
                  <TouchableOpacity key={t.id} onPress={() => chooseTemplate(t)} style={[s.tmplChip, on && { borderColor: t.colors[0], backgroundColor: t.colors[0] }]}>
                    <Text style={[s.tmplChipTxt, on && { color: "#fff" }]}>{t.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </RtlScrollRow>
            <View style={s.tmplInfo}>
              <Text style={s.tmplName}>{tmpl.name} <Text style={s.tmplDesc}>— {tmpl.desc}</Text></Text>
              <Text style={s.tmplBest}>مناسب لـ: {tmpl.bestFor}</Text>
            </View>
            <View style={s.colorRow}>
              <Text style={s.fieldLabel}>اللون:</Text>
              {tmpl.colors.map(c => <TouchableOpacity key={c} onPress={() => setColor(c)} accessibilityLabel={`لون ${c}`} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotOn]} />)}
            </View>
            <View style={{ alignItems: "center" }}><CVFrame html={previewHtml} width={previewW} /></View>
            {!hasData ? <Text style={[s.helperText, { textAlign: "center", marginTop: 8 }]}>المعاينة ببيانات مثال — ستظهر بياناتك فور كتابتها</Text> : null}
            {fillMsg && hasData ? <Text style={[s.helperText, { textAlign: "center", marginTop: 8, color: Colors.primary }]}>{fillMsg}</Text> : null}
          </Animated.View>}

          {step === 1 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 6 }}>
            <Text style={s.sectionTitle}>البيانات الأساسية</Text>
            {canFill ? (
              <View style={s.fillCard}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Ionicons name="sparkles-outline" size={18} color={Colors.primary} />
                  <Text style={s.fillTxt}>{fillMsg || "يمكن تعبئة سيرتك من بياناتك في حصاحيصاوي: الاسم، المسمى، النبذة، المؤهلات، الخبرات، الدورات والمهارات."}</Text>
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity style={s.fillBtn} onPress={() => fillFromProfile(false)} disabled={filling} accessibilityRole="button">
                    <Ionicons name="person-circle-outline" size={16} color="#fff" />
                    <Text style={s.fillBtnTxt}>{filling ? "جارٍ التعبئة…" : "تعبئة من ملفي"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.fillBtnGhost} onPress={() => router.push("/profile" as any)} accessibilityRole="button">
                    <Text style={s.fillBtnGhostTxt}>تحديث ملفي</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <InputField label="الاسم الكامل" value={cv.name} onChangeText={v => updateCv("name", v)} />
            <InputField label="المسمى الوظيفي" value={cv.title} onChangeText={v => updateCv("title", v)} placeholder="مثال: محاسب / فنّي كهرباء / معلّم" />
            <InputField label="الهاتف" value={cv.phone} onChangeText={v => updateCv("phone", v)} keyboardType="phone-pad" />
            <InputField label="البريد الإلكتروني" value={cv.email} onChangeText={v => updateCv("email", v)} keyboardType="email-address" />
            <InputField label="الموقع / لينكدإن" value={cv.website} onChangeText={v => updateCv("website", v)} />
            <InputField label="العنوان" value={cv.address} onChangeText={v => updateCv("address", v)} placeholder="الحصاحيصا" />
            <InputField label="نبذة مختصرة" value={cv.summary} onChangeText={v => updateCv("summary", v)} multiline />
            <Text style={s.helperText}>اقتراحات — اضغط لإضافتها:</Text>
            <View style={s.hints}>{SUMMARY_HINTS.map((h) => <TouchableOpacity key={h} onPress={() => updateCv("summary", (cv.summary ? cv.summary.trim() + " " : "") + h)} style={s.hint}><Text style={s.hintTxt}>+ {h}</Text></TouchableOpacity>)}</View>
            {tmpl.photo ? (<>
              <View style={s.photoBox}><View style={{ flex: 1 }}><Text style={s.fieldLabel}>الصورة الشخصية</Text><Text style={s.helperText}>اختيارية — نموذج «{tmpl.name}» يعرضها</Text></View><Switch value={cv.showPhoto} onValueChange={v => updateCv("showPhoto", v)} /></View>
              {cv.showPhoto ? <View style={s.photoActions}>{cv.photoUri ? <Image source={{ uri: cv.photoUri }} style={s.cvPhotoPreview} /> : <View style={s.cvPhotoPlaceholder}><Ionicons name="person" size={26} color={Colors.textMuted} /></View>}<TouchableOpacity onPress={pickCvPhoto} style={s.photoBtn}><Ionicons name="image-outline" size={18} color="#fff"/><Text style={s.photoBtnText}>اختيار الصورة</Text></TouchableOpacity></View> : null}
            </>) : <Text style={s.helperText}>نموذج «{tmpl.name}» بدون صورة — اختر الشريط أو البطاقات أو الجريء لإضافة صورة.</Text>}
          </Animated.View>}

          {step === 2 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 12 }}>
            <Text style={s.sectionTitle}>الخبرات والتعليم</Text>
            <Text style={s.subTitle}>الخبرة العملية</Text>
            {cv.experience.map((e, i) => <View key={i} style={s.groupCard}>
              <View style={s.groupHead}><Text style={s.groupIdx}>خبرة {i + 1}</Text>{cv.experience.length > 1 ? <TouchableOpacity onPress={() => removeAt("experience", i)} accessibilityLabel="حذف"><Ionicons name="trash-outline" size={18} color={Colors.danger} /></TouchableOpacity> : null}</View>
              <InputField label="المسمى" value={e.position} onChangeText={v => updateExperience(i, "position", v)} /><InputField label="الشركة / الجهة" value={e.company} onChangeText={v => updateExperience(i, "company", v)} /><InputField label="الفترة" value={e.period} onChangeText={v => updateExperience(i, "period", v)} placeholder="2022 — الآن" /><InputField label="المهام والإنجازات" value={e.desc} onChangeText={v => updateExperience(i, "desc", v)} multiline placeholder="كل إنجاز في سطر" /></View>)}
            <TouchableOpacity onPress={() => updateCv("experience", [...cv.experience, { position: "", company: "", period: "", desc: "" }])} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة خبرة</Text></TouchableOpacity>
            <Text style={s.subTitle}>التعليم</Text>
            {cv.education.map((e, i) => <View key={i} style={s.groupCard}>
              <View style={s.groupHead}><Text style={s.groupIdx}>مؤهل {i + 1}</Text>{cv.education.length > 1 ? <TouchableOpacity onPress={() => removeAt("education", i)} accessibilityLabel="حذف"><Ionicons name="trash-outline" size={18} color={Colors.danger} /></TouchableOpacity> : null}</View>
              <InputField label="المؤهل" value={e.degree} onChangeText={v => updateEducation(i, "degree", v)} /><InputField label="الجامعة / المؤسسة" value={e.institution} onChangeText={v => updateEducation(i, "institution", v)} /><InputField label="السنة" value={e.year} onChangeText={v => updateEducation(i, "year", v)} /></View>)}
            <TouchableOpacity onPress={() => updateCv("education", [...cv.education, { degree: "", institution: "", year: "" }])} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة تعليم</Text></TouchableOpacity>
          </Animated.View>}

          {step === 3 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 12 }}>
            <ListEditor title="المهارات" field="skills" items={cv.skills} update={updateListItem} add={addListItem} remove={(i) => removeAt("skills", i)} />
            <ListEditor title="اللغات" field="languages" items={cv.languages} update={updateListItem} add={addListItem} remove={(i) => removeAt("languages", i)} />
            <ListEditor title="الدورات والشهادات" field="courses" items={cv.courses} update={updateListItem} add={addListItem} remove={(i) => removeAt("courses", i)} />
          </Animated.View>}

          {step === 4 && <Animated.View entering={FadeInDown.delay(70).springify()} style={{ gap: 12, alignItems: "center" }}>
            <Text style={[s.sectionTitle, { alignSelf: "stretch" }]}>المعاينة النهائية — نموذج {tmpl.name}</Text>
            <CVFrame html={previewHtml} width={previewW} />
            <TouchableOpacity onPress={() => setStep(0)} style={s.addLine}><Ionicons name="albums-outline" size={16} color={Colors.primary} /><Text style={s.addLineText}>تغيير النموذج أو اللون</Text></TouchableOpacity>
            <View style={s.brandNote}><Text style={s.brandNoteText}>يُحفظ عملك تلقائياً على جهازك — يمكنك الخروج والعودة لاحقاً</Text></View>
          </Animated.View>}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={s.footer}>{step > 0 ? <TouchableOpacity onPress={prevStep} style={s.prevBtn}><Text style={s.prevText}>السابق</Text></TouchableOpacity> : <View style={{ flex: 1 }} />}{step < STEPS.length - 1 ? <TouchableOpacity onPress={nextStep} style={s.nextBtn}><Text style={s.nextText}>التالي</Text><Ionicons name="arrow-back" size={18} color="#fff"/></TouchableOpacity> : <TouchableOpacity onPress={handleDownload} disabled={loading} style={[s.nextBtn, loading && { opacity: .65 }]}><Text style={s.nextText}>{loading ? "جاري التصدير..." : "تصدير PDF"}</Text><Ionicons name="download-outline" size={18} color="#fff"/></TouchableOpacity>}</View>
    </View>
  );
}

function ListEditor({ title, field, items, update, add, remove }: { title: string; field: "skills" | "languages" | "courses"; items: string[]; update: (field: any, index: number, value: string) => void; add: (field: any) => void; remove: (i: number) => void }) {
  return <View style={s.groupCard}><Text style={s.subTitle}>{title}</Text>{items.map((item, i) => <View key={i} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><InputField label={`${title} ${i + 1}`} value={item} onChangeText={v => update(field, i, v)} /></View>{items.length > 1 ? <TouchableOpacity onPress={() => remove(i)} accessibilityLabel="حذف" style={{ paddingTop: 14 }}><Ionicons name="close-circle" size={20} color={Colors.textMuted} /></TouchableOpacity> : null}</View>)}<TouchableOpacity onPress={() => add(field)} style={s.addLine}><Ionicons name="add" size={18} color={Colors.primary}/><Text style={s.addLineText}>إضافة</Text></TouchableOpacity></View>;
}

const s = StyleSheet.create({
  fillCard: { gap: 10, padding: 12, marginBottom: 8, borderRadius: 14, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "40" },
  fillTxt: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, lineHeight: 20, color: Colors.text, textAlign: "right" },
  fillBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 14, height: 38, borderRadius: 12 },
  fillBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  fillBtnGhost: { justifyContent: "center", paddingHorizontal: 14, height: 38, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + "60" },
  fillBtnGhostTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  container: { flex: 1, backgroundColor: Colors.bg },
  shareBtn: { width: 36, height: 36, borderRadius: Colors.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  stepsBar: { flexDirection: "row-reverse", paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle || Colors.divider, backgroundColor: Colors.bg },
  stepItem: { flex: 1, alignItems: "center", gap: 4 },
  stepCircle: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  stepLabel: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 11 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 18, textAlign: "right", marginBottom: 12 },
  subTitle: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 14, textAlign: "right", marginBottom: 6 },
  freeNotice: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: "#22C55E40", backgroundColor: "#22C55E18", padding: 10, marginBottom: 14 },
  freeNoticeText: { fontFamily: "Cairo_600SemiBold", color: "#22C55E", fontSize: 13, flex: 1, textAlign: "right" },
  colorRow: { flexDirection: "row-reverse", flexWrap: "wrap", alignItems: "center", gap: 10, marginVertical: 12 },
  tmplRow: { flexDirection: "row-reverse", gap: 8, paddingBottom: 4 },
  tmplChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  tmplChipTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  tmplInfo: { marginTop: 12, gap: 2 },
  tmplName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tmplDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary },
  tmplBest: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primaryDeep, textAlign: "right" },
  hints: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  hint: { borderRadius: 14, backgroundColor: "#E8F5EE", paddingHorizontal: 10, paddingVertical: 6 },
  hintTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.primaryDeep, textAlign: "right" },
  groupHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  groupIdx: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,.25)" },
  colorDotOn: { borderWidth: 3, borderColor: Colors.accent, transform: [{ scale: 1.06 }] },
  templateCard: { minHeight: 112, borderRadius: Colors.radius.xl, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 12, overflow: "hidden", ...Colors.shadow.card },
  templateMock: { width: 82, height: 92, borderRadius: Colors.radius.md, padding: 7, justifyContent: "center" },
  mockPaper: { flex: 1, borderRadius: 8, backgroundColor: "#fff", flexDirection: "row", overflow: "hidden" },
  mockSide: { width: 22 }, mockLines: { flex: 1, padding: 7, gap: 5 }, mockLine: { height: 7, backgroundColor: "#111827", borderRadius: 3 }, mockLineThin: { height: 4, backgroundColor: "#CBD5E1", borderRadius: 3 },
  templateName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 14, textAlign: "right" },
  templateStyle: { fontFamily: "Cairo_600SemiBold", color: Colors.accent, fontSize: 12, textAlign: "right", marginTop: 2 },
  templateDesc: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right", marginTop: 4, lineHeight: 18 },
  freeBadge: { backgroundColor: "#22C55E18", borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#22C55E40" },
  freeBadgeText: { fontFamily: "Cairo_700Bold", color: "#22C55E", fontSize: 9 },
  checkBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  fieldWrap: { marginBottom: 10 }, fieldLabel: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 13, textAlign: "right", marginBottom: 6 },
  input: { minHeight: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.cardBg, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", paddingHorizontal: 12, textAlign: "right" },
  groupCard: { borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, marginBottom: 10, ...Colors.shadow.card },
  addLine: { height: 42, paddingHorizontal: 16, borderRadius: Colors.radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 6, marginTop: 4 },
  addLineText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 13 },
  photoBox: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.glassCard || Colors.cardBg, padding: 12, marginBottom: 10, ...Colors.shadow.card },
  helperText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right", marginTop: 3 },
  photoActions: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 10 },
  cvPhotoPreview: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: Colors.accent },
  cvPhotoPlaceholder: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  photoBtn: { flex: 1, height: 44, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  photoBtnText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 13 },
  previewSheet: { height: Math.min(520, width * 1.28), borderRadius: Colors.radius.lg, overflow: "hidden", backgroundColor: "#F9FAFB", flexDirection: "row", borderWidth: 1, borderColor: Colors.border, ...Colors.shadow.card },
  previewSide: { width: "34%", padding: 12, alignItems: "center" }, previewMain: { flex: 1, padding: 16, backgroundColor: "#fff" },
  previewPhoto: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: "#fff", marginBottom: 12 }, previewPhotoPlaceholder: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  previewSideTitle: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 12, marginTop: 12, marginBottom: 6, alignSelf: "stretch", textAlign: "right" }, previewSideText: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,.86)", fontSize: 11, alignSelf: "stretch", textAlign: "right", marginBottom: 4 },
  previewName: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "right" }, previewRole: { fontFamily: "Cairo_400Regular", color: "#6B7280", fontSize: 13, textAlign: "right", marginTop: 3 }, previewSummary: { fontFamily: "Cairo_400Regular", color: "#374151", fontSize: 11, textAlign: "right", marginTop: 12, lineHeight: 16 }, previewSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, borderBottomWidth: 1, paddingBottom: 4, textAlign: "right" }, previewItem: { fontFamily: "Cairo_400Regular", color: "#374151", fontSize: 11, textAlign: "right", marginTop: 5 },
  brandNote: { borderRadius: Colors.radius.md, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, padding: 10 }, brandNoteText: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 12, textAlign: "center" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row-reverse", gap: 10, padding: 14, backgroundColor: Colors.bgAlt || Colors.bg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle || Colors.divider },
  prevBtn: { flex: 1, height: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg }, prevText: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary },
  nextBtn: { flex: 1.3, height: 48, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 7 }, nextText: { fontFamily: "Cairo_700Bold", color: "#fff" },
});
