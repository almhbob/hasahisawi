import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";
const TOTAL = 7;

const SKILLS_LIST = [
  "القيادة", "الإعلام والتصميم", "الكتابة والتحرير",
  "التنظيم وإدارة الفعاليات", "التدريب والتدريس",
  "العمل الطوعي", "الحاسوب والتقنية",
  "العلاقات العامة", "أخرى",
];

const COMMITTEES_LIST = [
  "أمانة الإعلام", "أمانة الشؤون العلمية والشبكة الطلابية",
  "أمانة التدريب والتأهيل", "أمانة المنظمات الطلابية",
  "أمانة الخدمات والعمل الطوعي", "أمانة الشؤون الاجتماعية",
  "أمانة الثقافة والرياضة", "أمانة الدعوة والتربية",
  "أمانة التقنية والتحول الرقمي", "أمانة العلاقات العامة والشراكات",
];

const STUDY_STAGES = ["ثانوي", "جامعي", "خريج", "أخرى"];
const GENDERS = ["ذكر", "أنثى"];

function Checkbox({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={cb.row} activeOpacity={0.7}>
      <View style={[cb.box, checked && cb.checked]}>
        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={cb.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const cb = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: UC, borderColor: UC },
  label: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" },
});

function ChipSelect({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {options.map(o => (
        <TouchableOpacity key={o} onPress={() => onSelect(o)} style={[chip.btn, value === o && chip.active]}>
          <Text style={[chip.text, value === o && chip.textActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const chip = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle },
  active: { backgroundColor: UC, borderColor: UC },
  text: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  textActive: { color: "#fff" },
});

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return <Text style={s.label}>{text}{required && <Text style={{ color: "#EF4444" }}> *</Text>}</Text>;
}

function Input({ value, onChange, placeholder, keyboardType, multiline, numberOfLines }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[s.input, multiline && { height: (numberOfLines || 3) * 42, textAlignVertical: "top", paddingTop: 12 }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={Colors.textMuted} keyboardType={keyboardType || "default"}
      textAlign="right" multiline={multiline} numberOfLines={numberOfLines}
    />
  );
}

export default function UnionManagerApplyScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [section, setSection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // القسم 1 — البيانات الشخصية
  const [fullName, setFullName]   = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [age, setAge]             = useState("");
  const [gender, setGender]       = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");
  const [state_, setState_]       = useState("");
  const [locality, setLocality]   = useState("");
  const [adminUnit, setAdminUnit] = useState("");

  const handleBirthDateChange = useCallback((val: string) => {
    setBirthDate(val);
    if (val.length >= 4) {
      const y = parseInt(val.substring(0, 4), 10);
      if (!isNaN(y) && y > 1900 && y <= new Date().getFullYear()) {
        const calc = new Date().getFullYear() - y;
        if (calc > 5 && calc < 100) setAge(String(calc));
      }
    }
  }, []);

  // القسم 2 — البيانات الأكاديمية
  const [institution, setInstitution] = useState("");
  const [studyStage, setStudyStage]   = useState("");
  const [gradeLevel, setGradeLevel]   = useState("");
  const [major, setMajor]             = useState("");

  // القسم 3 — الخبرات والمهارات
  const [skills, setSkills]           = useState<string[]>([]);
  const [prevExp, setPrevExp]         = useState<boolean | null>(null);
  const [expDetails, setExpDetails]   = useState("");

  // القسم 4 — مجالات الاهتمام
  const [committees, setCommittees]   = useState<string[]>([]);

  // القسم 5 — الدوافع والرؤية
  const [motivation, setMotivation]       = useState("");
  const [contribution, setContribution]   = useState("");
  const [vision, setVision]               = useState("");

  // القسم 6 — الالتزام
  const [canAttend, setCanAttend]         = useState<boolean | null>(null);
  const [weeklyHours, setWeeklyHours]     = useState("");
  const [otherCommits, setOtherCommits]   = useState("");

  // القسم 7 — التعهد
  const [pledgeName, setPledgeName]       = useState("");
  const [pledgeAgreed, setPledgeAgreed]   = useState(false);

  const toggleSkill = (s: string) => setSkills(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleCommittee = (c: string) => setCommittees(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const validate = (): string | null => {
    if (section === 1) {
      if (!fullName.trim()) return "الاسم الرباعي مطلوب";
      if (!phone.trim()) return "رقم الهاتف مطلوب";
      if (!gender) return "يرجى تحديد الجنس";
    }
    if (section === 2) {
      if (!institution.trim()) return "اسم المؤسسة مطلوب";
      if (!studyStage) return "يرجى تحديد المرحلة الدراسية";
    }
    if (section === 3) {
      if (skills.length === 0) return "يرجى اختيار مهارة واحدة على الأقل";
    }
    if (section === 4) {
      if (committees.length === 0) return "يرجى اختيار أمانة واحدة على الأقل";
    }
    if (section === 5) {
      if (!motivation.trim()) return "يرجى كتابة دوافع الانضمام";
      if (!contribution.trim()) return "يرجى كتابة ما يمكنك تقديمه";
    }
    if (section === 7) {
      if (!pledgeName.trim()) return "يرجى كتابة اسمك في التعهد";
      if (!pledgeAgreed) return "يجب الموافقة على بنود التعهد";
    }
    return null;
  };

  const goNext = () => {
    const err = validate();
    if (err) { Alert.alert("تنبيه", err); return; }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSection(p => p + 1);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  const goBack = () => {
    setSection(p => p - 1);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert("تنبيه", err); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(), birth_date: birthDate.trim(), age: age.trim(),
          gender, national_id: nationalId.trim(), phone: phone.trim(),
          email: email.trim() || null, state: state_.trim() || null,
          locality: locality.trim() || null, admin_unit: adminUnit.trim() || null,
          institution: institution.trim(), study_stage: studyStage,
          grade_level: gradeLevel.trim() || null, major: major.trim() || null,
          skills, prev_experience: prevExp,
          exp_details: expDetails.trim() || null,
          committees, motivation: motivation.trim(),
          contribution: contribution.trim(), vision: vision.trim() || null,
          can_attend: canAttend, weekly_hours: weeklyHours.trim() || null,
          other_commits: otherCommits.trim() || null,
          pledge_name: pledgeName.trim(),
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSubmitted(true);
      } else {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "فشل إرسال الاستمارة");
      }
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "تعذر إرسال الاستمارة");
    } finally {
      setSubmitting(false);
    }
  };

  const titles = [
    "أولاً: البيانات الشخصية",
    "ثانياً: البيانات الأكاديمية",
    "ثالثاً: الخبرات والمهارات",
    "رابعاً: مجالات الاهتمام",
    "خامساً: الدوافع والرؤية",
    "سادساً: الالتزام والتفرغ",
    "سابعاً: التعهد والإقرار",
  ];

  if (submitted) {
    return (
      <View style={[s.center, { backgroundColor: Colors.bg, paddingTop: insets.top }]}>
        <LinearGradient colors={[UC, "#4338CA"]} style={s.successIcon}>
          <Ionicons name="checkmark-circle" size={60} color="#fff" />
        </LinearGradient>
        <Text style={s.successTitle}>تم تقديم الاستمارة بنجاح!</Text>
        <Text style={s.successSub}>
          {"سيتم مراجعة طلبك من قِبل إدارة التطبيق\nوسيتم التواصل معك عند القبول"}
        </Text>
        <TouchableOpacity style={s.successBtn} onPress={() => router.back()}>
          <Text style={s.successBtnText}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* الهيدر */}
      <LinearGradient colors={["#0B1224", "#1E1B4B"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => section > 1 ? goBack() : router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>استمارة طلب انضمام</Text>
          <Text style={s.headerSub}>الاتحاد العام للطلاب السودانيين — الحصاحيصا 2026م</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* شريط التقدم */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${(section / TOTAL) * 100}%` as any }]} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* تنبيه عام */}
        {section === 1 && (
          <Animated.View entering={FadeInDown.delay(60).springify()} style={s.notice}>
            <Ionicons name="information-circle-outline" size={18} color={UC2} />
            <Text style={s.noticeText}>تعبئة هذه الاستمارة لا تعني القبول النهائي. تخضع الطلبات للمراجعة والتقييم واعتماد رئاسة الاتحاد وفقاً للوائح المنظمة.</Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(80).springify()} style={s.sectionHeader}>
          <Text style={s.sectionNum}>{section} / {TOTAL}</Text>
          <Text style={s.sectionTitle}>{titles[section - 1]}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify()} style={s.card}>

          {/* ── القسم 1: البيانات الشخصية ── */}
          {section === 1 && (
            <>
              <FieldLabel text="الاسم الرباعي" required />
              <Input value={fullName} onChange={setFullName} placeholder="الاسم الرباعي كاملاً" />

              <FieldLabel text="تاريخ الميلاد" />
              <Input value={birthDate} onChange={handleBirthDateChange} placeholder="YYYY/MM/DD" keyboardType="numeric" />

              {age ? (
                <Text style={s.ageHint}>العمر: {age} سنة</Text>
              ) : null}

              <FieldLabel text="الجنس" required />
              <ChipSelect options={GENDERS} value={gender} onSelect={setGender} />

              <FieldLabel text="الرقم الوطني أو نوع الإثبات" />
              <Input value={nationalId} onChange={setNationalId} placeholder="الرقم الوطني أو الإثبات ونوعه" />

              <FieldLabel text="رقم الهاتف" required />
              <Input value={phone} onChange={setPhone} placeholder="09XXXXXXXX" keyboardType="phone-pad" />

              <FieldLabel text="البريد الإلكتروني" />
              <Input value={email} onChange={setEmail} placeholder="example@email.com" keyboardType="email-address" />

              <FieldLabel text="الولاية" />
              <Input value={state_} onChange={setState_} placeholder="اسم الولاية" />

              <FieldLabel text="المحلية" />
              <Input value={locality} onChange={setLocality} placeholder="الحصاحيصا" />

              <FieldLabel text="الوحدة الإدارية / الحي" />
              <Input value={adminUnit} onChange={setAdminUnit} placeholder="اسم الحي أو الوحدة الإدارية" />
            </>
          )}

          {/* ── القسم 2: البيانات الأكاديمية ── */}
          {section === 2 && (
            <>
              <FieldLabel text="اسم المدرسة / المؤسسة التعليمية" required />
              <Input value={institution} onChange={setInstitution} placeholder="اسم المؤسسة" />

              <FieldLabel text="المرحلة الدراسية" required />
              <ChipSelect options={STUDY_STAGES} value={studyStage} onSelect={setStudyStage} />

              <FieldLabel text="الصف / المستوى الدراسي" />
              <Input value={gradeLevel} onChange={setGradeLevel} placeholder="مثال: الثالث ثانوي / الفرقة الأولى" />

              <FieldLabel text="التخصص" />
              <Input value={major} onChange={setMajor} placeholder="التخصص الدراسي إن وجد" />
            </>
          )}

          {/* ── القسم 3: الخبرات والمهارات ── */}
          {section === 3 && (
            <>
              <FieldLabel text="أبرز المهارات التي تمتلكها" required />
              <Text style={s.hint}>يمكنك اختيار أكثر من مهارة</Text>
              {SKILLS_LIST.map(sk => (
                <Checkbox key={sk} label={sk} checked={skills.includes(sk)} onPress={() => toggleSkill(sk)} />
              ))}

              <View style={s.divider} />
              <FieldLabel text="هل سبق لك العمل في منظمات أو اتحادات أو لجان؟" />
              <ChipSelect options={["نعم", "لا"]} value={prevExp === null ? "" : prevExp ? "نعم" : "لا"} onSelect={v => setPrevExp(v === "نعم")} />

              {prevExp && (
                <>
                  <FieldLabel text="اذكر التفاصيل" />
                  <Input value={expDetails} onChange={setExpDetails} placeholder="المنظمة، دورك، الفترة..." multiline numberOfLines={3} />
                </>
              )}
            </>
          )}

          {/* ── القسم 4: مجالات الاهتمام ── */}
          {section === 4 && (
            <>
              <FieldLabel text="الأمانات أو المحاور التي ترغب في العمل بها" required />
              <Text style={s.hint}>يمكنك اختيار أكثر من أمانة</Text>
              {COMMITTEES_LIST.map(c => (
                <Checkbox key={c} label={c} checked={committees.includes(c)} onPress={() => toggleCommittee(c)} />
              ))}
            </>
          )}

          {/* ── القسم 5: الدوافع والرؤية ── */}
          {section === 5 && (
            <>
              <FieldLabel text="لماذا ترغب في الانضمام إلى الاتحاد؟" required />
              <Input value={motivation} onChange={setMotivation} placeholder="اكتب دوافعك هنا..." multiline numberOfLines={4} />

              <FieldLabel text="ما الإضافة التي تعتقد أنك ستقدمها؟" required />
              <Input value={contribution} onChange={setContribution} placeholder="اكتب ما يمكنك تقديمه..." multiline numberOfLines={4} />

              <FieldLabel text="ما رؤيتك لتطوير العمل الطلابي؟" />
              <Input value={vision} onChange={setVision} placeholder="رؤيتك المستقبلية..." multiline numberOfLines={3} />
            </>
          )}

          {/* ── القسم 6: الالتزام والتفرغ ── */}
          {section === 6 && (
            <>
              <FieldLabel text="هل تستطيع الالتزام بحضور الاجتماعات والأنشطة؟" />
              <ChipSelect options={["نعم", "لا"]} value={canAttend === null ? "" : canAttend ? "نعم" : "لا"} onSelect={v => setCanAttend(v === "نعم")} />

              <FieldLabel text="عدد الساعات التي يمكنك تخصيصها أسبوعياً" />
              <Input value={weeklyHours} onChange={setWeeklyHours} placeholder="مثال: 5 ساعات" keyboardType="numeric" />

              <FieldLabel text="هل لديك أي التزامات قد تؤثر على مشاركتك؟" />
              <Input value={otherCommits} onChange={setOtherCommits} placeholder="اذكرها إن وجدت..." multiline numberOfLines={2} />
            </>
          )}

          {/* ── القسم 7: التعهد ── */}
          {section === 7 && (
            <>
              <View style={s.pledgeBox}>
                <Text style={s.pledgeText}>
                  {"أتعهد بأن جميع البيانات الواردة في هذه الاستمارة صحيحة، وألتزم باللوائح والأنظمة المنظمة لعمل الاتحاد، والعمل بروح الفريق والمسؤولية لخدمة الطلاب والمجتمع."}
                </Text>
              </View>

              <FieldLabel text="الاسم" required />
              <Input value={pledgeName} onChange={setPledgeName} placeholder="اكتب اسمك للتأكيد" />

              <TouchableOpacity onPress={() => setPledgeAgreed(p => !p)} style={cb.row} activeOpacity={0.7}>
                <View style={[cb.box, pledgeAgreed && cb.checked]}>
                  {pledgeAgreed && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <Text style={[cb.label, { flex: 1 }]}>أوافق على جميع بنود التعهد أعلاه</Text>
              </TouchableOpacity>
            </>
          )}

        </Animated.View>
      </ScrollView>

      {/* أزرار التنقل */}
      <View style={[s.navRow, { paddingBottom: insets.bottom + 16 }]}>
        {section > 1 && (
          <TouchableOpacity style={s.prevBtn} onPress={goBack}>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            <Text style={s.prevBtnText}>السابق</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {section < TOTAL ? (
          <TouchableOpacity style={s.nextBtn} onPress={goNext}>
            <Text style={s.nextBtnText}>التالي</Text>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.nextBtn, s.submitBtn, submitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Text style={s.nextBtnText}>إرسال الاستمارة</Text>
                <Ionicons name="send" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 2 },
  progressBar: { height: 4, backgroundColor: "rgba(99,102,241,0.2)" },
  progressFill: { height: 4, backgroundColor: UC, borderRadius: 2 },
  notice: { flexDirection: "row-reverse", gap: 10, backgroundColor: UC + "18", borderRadius: 12, padding: 14, marginBottom: 16, alignItems: "flex-start" },
  noticeText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, flex: 1, textAlign: "right", lineHeight: 22 },
  sectionHeader: { marginBottom: 12 },
  sectionNum: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC2, textAlign: "right" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 18, gap: 4, borderWidth: 1, borderColor: Colors.borderSubtle },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 6 },
  ageHint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#22C55E", textAlign: "right", marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.borderSubtle, marginVertical: 14 },
  pledgeBox: { backgroundColor: UC + "10", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: UC + "30", marginBottom: 16 },
  pledgeText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", lineHeight: 24 },
  navRow: { flexDirection: "row-reverse", padding: 16, gap: 12, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  prevBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle },
  prevBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: UC },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  submitBtn: { backgroundColor: "#22C55E" },
  successIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.text, textAlign: "center" },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 24 },
  successBtn: { marginTop: 8, backgroundColor: UC, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
