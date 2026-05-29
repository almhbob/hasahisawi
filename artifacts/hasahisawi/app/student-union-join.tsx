import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";
const TOTAL_SECTIONS = 7;

// ── قوائم الخيارات ─────────────────────────────────────────────────
const SKILLS_LIST = [
  "القيادة والإدارة", "الإعلام والصحافة", "الكتابة والتحرير",
  "تنظيم الفعاليات", "التدريب وتطوير الكفاءات", "العمل التطوعي",
  "الحاسوب والتقنية", "العلاقات العامة والتواصل", "الخطابة والتقديم",
  "الفنون والإبداع", "الرياضة والأنشطة البدنية",
];

const COMMITTEES_LIST = [
  "الأمانة العامة", "أمانة الإعلام والثقافة", "أمانة التدريب والتطوير",
  "أمانة الشؤون الأكاديمية", "أمانة الأنشطة والفعاليات",
  "أمانة المرأة والأسرة", "أمانة الخدمات والرفاه الطلابي",
  "أمانة العلاقات الخارجية", "أمانة الصحة والبيئة",
  "أمانة المال والإدارة",
];

const STUDY_STAGES = ["المرحلة الثانوية", "الجامعي", "دراسات عليا", "خريج", "أخرى"];
const GENDERS      = ["ذكر", "أنثى"];

// ── مكوّن خانة اختيار ──────────────────────────────────────────────
function Checkbox({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={cb.row} activeOpacity={0.7}>
      <View style={[cb.box, checked && cb.boxChecked]}>
        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
      </View>
      <Text style={cb.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const cb = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  boxChecked: { backgroundColor: UC, borderColor: UC },
  label: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, flex: 1, textAlign: "right" },
});

// ── مكوّن اختيار من أزرار (chip) ────────────────────────────────────
function ChipSelect({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {options.map(o => (
        <TouchableOpacity
          key={o}
          onPress={() => onSelect(o)}
          style={[chip.btn, value === o && chip.btnActive]}
        >
          <Text style={[chip.text, value === o && chip.textActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const chip = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle },
  btnActive: { backgroundColor: UC, borderColor: UC },
  text: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  textActive: { color: "#fff" },
});

// ── مكوّنات مساعدة للحقول ────────────────────────────────────────────
function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={s.label}>
      {text}{required && <Text style={{ color: "#EF4444" }}> *</Text>}
    </Text>
  );
}

function Input({ value, onChange, placeholder, keyboardType, multiline, numberOfLines }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[s.input, multiline && { height: (numberOfLines || 3) * 40, textAlignVertical: "top", paddingTop: 12 }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={Colors.textMuted} keyboardType={keyboardType || "default"}
      textAlign="right" multiline={multiline} numberOfLines={numberOfLines}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
export default function StudentUnionJoinScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [section, setSection] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // القسم 1
  const [fullName, setFullName]     = useState("");
  const [birthDate, setBirthDate]   = useState("");
  const [age, setAge]               = useState("");
  const [gender, setGender]         = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone]           = useState("");
  const [email, setEmail]           = useState("");
  const [address, setAddress]       = useState("");

  // حساب العمر تلقائياً من تاريخ الميلاد
  const handleBirthDateChange = useCallback((val: string) => {
    setBirthDate(val);
    if (val.length >= 8) {
      const parts = val.replace(/\//g, "-").split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0].length === 4 ? parts[0] : parts[2], 10);
        if (!isNaN(y) && y > 1900 && y <= new Date().getFullYear()) {
          const calculated = new Date().getFullYear() - y;
          if (calculated > 5 && calculated < 100) setAge(String(calculated));
        }
      }
    }
  }, []);

  // القسم 2
  const [institution, setInstitution] = useState("");
  const [studyStage, setStudyStage]   = useState("");
  const [year, setYear]               = useState("");
  const [major, setMajor]             = useState("");

  // القسم 3
  const [skills, setSkills]                   = useState<string[]>([]);
  const [prevExp, setPrevExp]                 = useState<boolean | null>(null);
  const [experienceDetails, setExpDetails]    = useState("");

  // القسم 4
  const [committees, setCommittees] = useState<string[]>([]);

  // القسم 5
  const [motivation, setMotivation]     = useState("");
  const [contribution, setContribution] = useState("");
  const [vision, setVision]             = useState("");

  // القسم 6
  const [canAttend, setCanAttend]           = useState<boolean | null>(null);
  const [weeklyHours, setWeeklyHours]       = useState("");
  const [otherCommitments, setOtherCommit]  = useState("");

  // القسم 7 — تاريخ اليوم كقيمة افتراضية للتعهد
  const todayStr = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  const [pledgeName, setPledgeName] = useState("");
  const [pledgeDate, setPledgeDate] = useState(todayStr);
  const [pledgeAgreed, setPledgeAgreed] = useState(false);

  const toggleSkill = (s: string) =>
    setSkills(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleCommittee = (c: string) =>
    setCommittees(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const validateSection = (): string | null => {
    if (section === 1) {
      if (!fullName.trim())   return "الاسم الرباعي مطلوب";
      if (!nationalId.trim()) return "الرقم الوطني مطلوب";
      if (!phone.trim())      return "رقم الهاتف مطلوب";
      if (!gender)            return "يرجى تحديد الجنس";
    }
    if (section === 2) {
      if (!institution.trim()) return "اسم المؤسسة التعليمية مطلوب";
      if (!studyStage)         return "يرجى تحديد المرحلة الدراسية";
      if (!year.trim())        return "السنة/المستوى مطلوب";
      if (!major.trim())       return "التخصص مطلوب";
    }
    if (section === 3) {
      if (skills.length === 0) return "يرجى اختيار مهارة واحدة على الأقل";
    }
    if (section === 4) {
      if (committees.length === 0) return "يرجى اختيار أمانة أو مجال اهتمام واحد على الأقل";
    }
    if (section === 5) {
      if (!motivation.trim())    return "يرجى كتابة دوافع الانضمام";
      if (!contribution.trim())  return "يرجى كتابة ما يمكنك تقديمه";
    }
    if (section === 7) {
      if (!pledgeName.trim()) return "يرجى كتابة اسمك في التعهد";
      if (!pledgeAgreed)      return "يجب الموافقة على بنود التعهد للمتابعة";
    }
    return null;
  };

  const goNext = () => {
    const err = validateSection();
    if (err) { Alert.alert("تنبيه", err); return; }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSection(p => p + 1);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  const goBack = () => {
    setSection(p => p - 1);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSubmit = async () => {
    const err = validateSection();
    if (err) {
      if (Platform.OS === "web") { setSubmitError(err); return; }
      Alert.alert("تنبيه", err); return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        full_name: fullName.trim(), birth_date: birthDate.trim(), age: age.trim(),
        gender, national_id: nationalId.trim(), phone: phone.trim(),
        email: email.trim() || null, address: address.trim() || null,
        institution: institution.trim(), study_stage: studyStage, year: year.trim(), major: major.trim(),
        skills, previous_experience: prevExp, experience_details: experienceDetails.trim() || null,
        committees,
        motivation: motivation.trim(), contribution: contribution.trim(), vision: vision.trim() || null,
        can_attend_meetings: canAttend, weekly_hours: weeklyHours.trim() || null,
        other_commitments: otherCommitments.trim() || null,
        pledge_name: pledgeName.trim(), pledge_date: pledgeDate.trim() || null,
      };

      const res = await fetchWithTimeout(
        `${getApiUrl()}/api/student-union/apply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        },
        45000,
      );

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (Platform.OS === "web") {
          setSubmitSuccess(true);
        } else {
          Alert.alert(
            "تم الإرسال بنجاح",
            "تم تقديم استمارة عضوية اتحاد الطلاب بنجاح.\nسيتم مراجعتها والرد عليك خلال 48 ساعة.",
            [{ text: "حسناً", onPress: () => router.back() }]
          );
        }
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "فشل إرسال الاستمارة");
      }
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e.message || "تعذر إرسال الاستمارة، يرجى المحاولة مرة أخرى";
      if (Platform.OS === "web") {
        setSubmitError(msg);
      } else {
        Alert.alert("خطأ", msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sectionTitles = [
    "البيانات الشخصية",
    "البيانات الأكاديمية",
    "الخبرات والمهارات",
    "مجالات الاهتمام",
    "الدوافع والرؤية",
    "الالتزام والتفرغ",
    "التعهد والإقرار",
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* الهيدر */}
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => section > 1 ? goBack() : router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>استمارة عضوية اتحاد الطلاب</Text>
          <Text style={s.headerSub}>الاتحاد العام للطلاب السودانيين — محلية الحصاحيصا 2026م</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* شريط التقدم */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${(section / TOTAL_SECTIONS) * 100}%` as any }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* رأس القسم */}
        <Animated.View entering={FadeInDown.springify()} style={s.sectionHeader}>
          <View style={s.sectionBadge}>
            <Text style={s.sectionNum}>{section}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>{sectionTitles[section - 1]}</Text>
            <Text style={s.sectionProgress}>القسم {section} من {TOTAL_SECTIONS}</Text>
          </View>
        </Animated.View>

        {/* ── القسم 1: البيانات الشخصية ── */}
        {section === 1 && (
          <Animated.View entering={FadeInRight.springify()}>
            <FieldLabel text="الاسم الرباعي" required />
            <Input value={fullName} onChange={setFullName} placeholder="أدخل اسمك الرباعي كاملاً" />

            <FieldLabel text="تاريخ الميلاد" />
            <Input value={birthDate} onChange={handleBirthDateChange} placeholder="مثال: 2000/01/15" />

            <FieldLabel text="العمر" />
            <Input value={age} onChange={setAge} placeholder="مثال: 22" keyboardType="numeric" />

            <FieldLabel text="الجنس" required />
            <ChipSelect options={GENDERS} value={gender} onSelect={setGender} />

            <FieldLabel text="الرقم الوطني" required />
            <Input value={nationalId} onChange={setNationalId} placeholder="أدخل رقمك الوطني" keyboardType="numeric" />

            <FieldLabel text="رقم الهاتف" required />
            <Input value={phone} onChange={setPhone} placeholder="09XXXXXXXX" keyboardType="phone-pad" />

            <FieldLabel text="البريد الإلكتروني" />
            <Input value={email} onChange={setEmail} placeholder="example@email.com" keyboardType="email-address" />

            <FieldLabel text="العنوان / الحي" />
            <Input value={address} onChange={setAddress} placeholder="الحي ومنطقة السكن في الحصاحيصا" />
          </Animated.View>
        )}

        {/* ── القسم 2: البيانات الأكاديمية ── */}
        {section === 2 && (
          <Animated.View entering={FadeInRight.springify()}>
            <FieldLabel text="اسم المدرسة / الجامعة / المؤسسة التعليمية" required />
            <Input value={institution} onChange={setInstitution} placeholder="أدخل اسم المؤسسة التعليمية" />

            <FieldLabel text="المرحلة الدراسية" required />
            <ChipSelect options={STUDY_STAGES} value={studyStage} onSelect={setStudyStage} />

            <FieldLabel text="الصف / السنة / المستوى" required />
            <Input value={year} onChange={setYear} placeholder="مثال: السنة الثالثة، الصف الثاني" />

            <FieldLabel text="التخصص / القسم" required />
            <Input value={major} onChange={setMajor} placeholder="مثال: هندسة حاسوب، أدب عربي" />
          </Animated.View>
        )}

        {/* ── القسم 3: الخبرات والمهارات ── */}
        {section === 3 && (
          <Animated.View entering={FadeInRight.springify()}>
            <Text style={s.hint}>اختر المهارات التي تمتلكها (واحدة أو أكثر) *</Text>
            {SKILLS_LIST.map(sk => (
              <Checkbox key={sk} label={sk} checked={skills.includes(sk)} onPress={() => toggleSkill(sk)} />
            ))}

            <View style={s.divider} />
            <FieldLabel text="هل سبق لك العمل في نشاط طلابي أو تطوعي من قبل؟" />
            <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 6 }}>
              {[true, false].map(v => (
                <TouchableOpacity
                  key={String(v)}
                  onPress={() => setPrevExp(v)}
                  style={[chip.btn, prevExp === v && chip.btnActive, { flex: 1 }]}
                >
                  <Text style={[chip.text, prevExp === v && chip.textActive, { textAlign: "center" }]}>
                    {v ? "نعم" : "لا"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {prevExp === true && (
              <>
                <FieldLabel text="اذكر تجربتك السابقة بإيجاز" />
                <Input value={experienceDetails} onChange={setExpDetails}
                  placeholder="اذكر اسم المنظمة أو الاتحاد ودورك فيه والمدة" multiline numberOfLines={4} />
              </>
            )}
          </Animated.View>
        )}

        {/* ── القسم 4: مجالات الاهتمام ── */}
        {section === 4 && (
          <Animated.View entering={FadeInRight.springify()}>
            <Text style={s.hint}>اختر الأمانات أو المجالات التي تودّ العمل فيها (يمكن اختيار أكثر من واحد) *</Text>
            {COMMITTEES_LIST.map((c, i) => (
              <Checkbox key={c} label={`${i + 1}. ${c}`} checked={committees.includes(c)} onPress={() => toggleCommittee(c)} />
            ))}
          </Animated.View>
        )}

        {/* ── القسم 5: الدوافع والرؤية ── */}
        {section === 5 && (
          <Animated.View entering={FadeInRight.springify()}>
            <FieldLabel text="لماذا تريد الانضمام إلى اتحاد الطلاب؟" required />
            <Input value={motivation} onChange={setMotivation}
              placeholder="اشرح دوافعك وأهدافك من الانضمام..." multiline numberOfLines={4} />

            <FieldLabel text="ما الذي يمكنك تقديمه للاتحاد؟" required />
            <Input value={contribution} onChange={setContribution}
              placeholder="اذكر المهارات أو الأعمال التي يمكنك المساهمة بها..." multiline numberOfLines={4} />

            <FieldLabel text="ما رؤيتك لتطوير العمل الطلابي في المحلية؟" />
            <Input value={vision} onChange={setVision}
              placeholder="شاركنا أفكارك وطموحاتك لتطوير العمل الطلابي..." multiline numberOfLines={4} />
          </Animated.View>
        )}

        {/* ── القسم 6: الالتزام والتفرغ ── */}
        {section === 6 && (
          <Animated.View entering={FadeInRight.springify()}>
            <FieldLabel text="هل يمكنك الالتزام بحضور اجتماعات ونشاطات الاتحاد؟" />
            <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 6 }}>
              {[true, false].map(v => (
                <TouchableOpacity
                  key={String(v)}
                  onPress={() => setCanAttend(v)}
                  style={[chip.btn, canAttend === v && chip.btnActive, { flex: 1 }]}
                >
                  <Text style={[chip.text, canAttend === v && chip.textActive, { textAlign: "center" }]}>
                    {v ? "نعم" : "لا"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FieldLabel text="كم ساعة أسبوعياً يمكنك تخصيصها للعمل الطلابي؟" />
            <ChipSelect
              options={["أقل من ساعة", "1-3 ساعات", "3-5 ساعات", "أكثر من 5 ساعات"]}
              value={weeklyHours}
              onSelect={setWeeklyHours}
            />

            <FieldLabel text="هل لديك التزامات أخرى قد تؤثر على مشاركتك؟" />
            <Input value={otherCommitments} onChange={setOtherCommit}
              placeholder="اذكر أي التزامات دراسية أو عملية أو عائلية..." multiline numberOfLines={3} />
          </Animated.View>
        )}

        {/* ── القسم 7: التعهد والإقرار ── */}
        {section === 7 && (
          <Animated.View entering={FadeInRight.springify()}>
            <View style={s.pledgeBox}>
              <Text style={s.pledgeTitle}>نص التعهد والإقرار</Text>
              <Text style={s.pledgeText}>
                أنا الموقع أدناه، أتعهد بصدق وأمانة بأن المعلومات الواردة في هذه الاستمارة صحيحة
                ودقيقة، وأن أعمل بإخلاص وتفانٍ من أجل خدمة أهداف وتطلعات اتحاد طلاب محلية الحصاحيصا،
                وأن أحترم لوائح وأنظمة الاتحاد وتعليمات القيادة، وأن أسعى دائماً لرفع مستوى العمل
                الطلابي وتحقيق مصلحة الطلاب في المحلية.
              </Text>
              <Text style={s.pledgeText}>
                كما أقرّ بأن الانضمام إلى الاتحاد يُلزمني بالمشاركة الفعّالة في الأنشطة والفعاليات،
                والتعاون مع زملائي الأعضاء، والحضور المنتظم، والتمثيل اللائق لصورة الاتحاد.
              </Text>
            </View>

            <FieldLabel text="الاسم كاملاً (للتوقيع)" required />
            <Input value={pledgeName} onChange={setPledgeName} placeholder="اكتب اسمك الرباعي كاملاً" />

            <FieldLabel text="التاريخ" />
            <Input value={pledgeDate} onChange={setPledgeDate} placeholder="مثال: 2026/01/20" />

            <TouchableOpacity
              onPress={() => setPledgeAgreed(p => !p)}
              style={[s.agreeRow, pledgeAgreed && s.agreeRowActive]}
              activeOpacity={0.8}
            >
              <View style={[cb.box, pledgeAgreed && cb.boxChecked]}>
                {pledgeAgreed && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <Text style={[s.agreeText, pledgeAgreed && { color: UC2 }]}>
                أوافق على جميع بنود التعهد وأُقرّ بصحة المعلومات المدخلة
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* نجاح على الويب */}
        {submitSuccess && (
          <View style={s.webSuccessBox}>
            <Ionicons name="checkmark-circle" size={48} color="#059669" />
            <Text style={s.webSuccessTitle}>تم الإرسال بنجاح!</Text>
            <Text style={s.webSuccessMsg}>
              تم تقديم استمارة عضوية اتحاد الطلاب بنجاح.{"\n"}سيتم مراجعتها والرد عليك خلال 48 ساعة.
            </Text>
            <TouchableOpacity onPress={() => router.back()} style={s.webSuccessBtn}>
              <Text style={s.webSuccessBtnText}>حسناً</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* خطأ على الويب */}
        {submitError ? (
          <View style={s.webErrBox}>
            <Ionicons name="alert-circle-outline" size={20} color="#DC2626" />
            <Text style={s.webErrText}>{submitError}</Text>
          </View>
        ) : null}

        {/* أزرار التنقل */}
        {!submitSuccess && (
          <View style={s.navRow}>
            {section > 1 && (
              <TouchableOpacity onPress={goBack} style={s.backNavBtn}>
                <Ionicons name="chevron-forward" size={18} color={UC2} />
                <Text style={s.backNavText}>السابق</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {section < TOTAL_SECTIONS ? (
              <TouchableOpacity onPress={goNext} style={s.nextBtn}>
                <LinearGradient colors={[UC, "#4338CA"]} style={s.nextGrad}>
                  <Text style={s.nextText}>التالي</Text>
                  <Ionicons name="chevron-back" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting}
                style={[s.nextBtn, submitting && { opacity: 0.6 }]}
              >
                <LinearGradient colors={["#059669", "#047857"]} style={s.nextGrad}>
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Text style={s.nextText}>إرسال الاستمارة</Text>
                        <Ionicons name="paper-plane-outline" size={17} color="#fff" />
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── الأنماط ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: UC2, textAlign: "center", marginTop: 2 },
  progressBar: { height: 4, backgroundColor: Colors.borderSubtle },
  progressFill: { height: 4, backgroundColor: UC, borderRadius: 2 },
  sectionHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: UC + "40", padding: 14, marginBottom: 20,
  },
  sectionBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: UC, alignItems: "center", justifyContent: "center",
  },
  sectionNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  sectionProgress: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: Colors.cardBg, borderRadius: 12, padding: 13,
    color: Colors.text, fontSize: 14, fontFamily: "Cairo_400Regular",
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 10, lineHeight: 20 },
  divider: { height: 1, backgroundColor: Colors.borderSubtle, marginVertical: 18 },
  pledgeBox: {
    backgroundColor: "#0B1224", borderRadius: 16, borderWidth: 1,
    borderColor: "#6366F140", padding: 16, gap: 12, marginBottom: 4,
  },
  pledgeTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: UC2, textAlign: "right" },
  pledgeText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", lineHeight: 22 },
  agreeRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    marginTop: 16, backgroundColor: Colors.cardBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14,
  },
  agreeRowActive: { borderColor: UC, backgroundColor: UC + "10" },
  agreeText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right", lineHeight: 20 },
  navRow: { flexDirection: "row-reverse", alignItems: "center", marginTop: 28 },
  backNavBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  backNavText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: UC2 },
  nextBtn: { borderRadius: 14, overflow: "hidden", minWidth: 140 },
  nextGrad: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, paddingHorizontal: 20,
  },
  nextText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  webErrBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: "#FECACA",
  },
  webErrText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#DC2626", flex: 1, textAlign: "right" },
  webSuccessBox: {
    alignItems: "center", justifyContent: "center", gap: 12,
    padding: 32, margin: 16,
    backgroundColor: "#F0FDF4", borderRadius: 16, borderWidth: 1, borderColor: "#BBF7D0",
  },
  webSuccessTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#059669", textAlign: "center" },
  webSuccessMsg: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#065F46", textAlign: "center", lineHeight: 22 },
  webSuccessBtn: {
    backgroundColor: "#059669", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 8,
  },
  webSuccessBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
