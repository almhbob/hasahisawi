import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Platform, Dimensions, Share, KeyboardAvoidingView, Modal,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeIn, useSharedValue, withRepeat, withSequence, withTiming, Easing, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

const PREMIUM_PRICE = 5000;
const PREMIUM_FEATURES = [
  { icon: "layers-outline",         label: "4 قوالب احترافية مميزة" },
  { icon: "document-text-outline",  label: "تصدير PDF عالي الجودة" },
  { icon: "share-social-outline",   label: "مشاركة فورية عبر التواصل الاجتماعي" },
  { icon: "color-palette-outline",  label: "تخصيص الألوان والتصميم" },
  { icon: "refresh-outline",        label: "تعديل غير محدود مدى الحياة" },
  { icon: "shield-checkmark-outline", label: "سيرة ذاتية احترافية بضغطة واحدة" },
];

// ── شاشة الدفع المميز ─────────────────────────────────────────────
function PremiumGate({ onPay }: { onPay: () => void }) {
  const insets = useSafeAreaInsets();
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [processing, setProcessing] = useState(false);

  // نبضة السعر
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.00, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ), -1, true,
    );
  }, []);
  const priceStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const PAYMENT_METHODS = [
    { id: "mtn", name: "MTN Mobile Money", icon: "phone-portrait-outline", color: "#FFCD00", bg: "#FFCD0015" },
    { id: "zain", name: "Zain Cash",        icon: "phone-portrait-outline", color: "#E30613", bg: "#E3061315" },
    { id: "bank", name: "تحويل بنكي",        icon: "card-outline",           color: "#0EA5E9", bg: "#0EA5E915" },
  ];

  function handlePay() {
    if (!selectedMethod) {
      Alert.alert("تنبيه", "يرجى اختيار طريقة الدفع أولاً");
      return;
    }
    if (!phone.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال رقم الهاتف أو المرجع");
      return;
    }
    setProcessing(true);
    // محاكاة معالجة الدفع
    setTimeout(() => {
      setProcessing(false);
      setShowPayModal(false);
      Alert.alert(
        "تم الدفع بنجاح ✅",
        `شكراً! تم تفعيل خدمة إنشاء السيرة الذاتية المميزة.\nرقم العملية: CV-${Math.floor(Math.random() * 90000) + 10000}`,
        [{ text: "ابدأ الآن", onPress: onPay }],
      );
    }, 2200);
  }

  return (
    <View style={[pg.container, { paddingTop: insets.top }]}>
      {/* خلفية متدرجة */}
      <LinearGradient
        colors={["#06B6D410", "#7C3AED08", Colors.bg]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* رأس الصفحة */}
      <View style={pg.header}>
        <TouchableOpacity onPress={() => router.back()} style={pg.backBtn} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={pg.headerTitle}>منشئ السيرة الذاتية</Text>
          <Text style={pg.headerSub}>خدمة مميزة</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* أيقونة البطل */}
        <Animated.View entering={FadeIn.delay(100)} style={{ alignItems: "center", marginTop: 24, marginBottom: 8 }}>
          <LinearGradient
            colors={["#06B6D4", "#7C3AED"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={pg.heroIcon}
          >
            <Ionicons name="document-text-outline" size={52} color="#fff" />
          </LinearGradient>
          {/* شارة مميز */}
          <View style={pg.premiumBadge}>
            <MaterialCommunityIcons name="crown" size={13} color="#000" />
            <Text style={pg.premiumBadgeText}>مميز</Text>
          </View>
        </Animated.View>

        {/* العنوان */}
        <Animated.View entering={FadeInDown.delay(150).springify()} style={{ alignItems: "center", paddingHorizontal: 24, gap: 8, marginBottom: 28 }}>
          <Text style={pg.title}>سيرتك الذاتية في دقيقتين</Text>
          <Text style={pg.subtitle}>
            أنشئ سيرة ذاتية احترافية بقوالب عالمية وحمّلها PDF فوراً أو شاركها مباشرةً
          </Text>
        </Animated.View>

        {/* السعر */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: "center", marginBottom: 28 }}>
          <Animated.View style={[pg.priceCard, priceStyle]}>
            <LinearGradient
              colors={["#06B6D420", "#7C3AED15"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={pg.priceLabel}>رسوم الخدمة</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, justifyContent: "center" }}>
              <Text style={pg.priceCurrency}>جنيه</Text>
              <Text style={pg.priceAmount}>{PREMIUM_PRICE.toLocaleString()}</Text>
            </View>
            <Text style={pg.priceNote}>دفعة واحدة · بدون اشتراك شهري</Text>
          </Animated.View>
        </Animated.View>

        {/* المزايا */}
        <Animated.View entering={FadeInDown.delay(250).springify()} style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={pg.featuresTitle}>ماذا تحصل؟</Text>
          <View style={pg.featuresList}>
            {PREMIUM_FEATURES.map((f, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(280 + i * 50).springify()} style={pg.featureItem}>
                <View style={pg.featureIconWrap}>
                  <Ionicons name={f.icon as any} size={18} color="#06B6D4" />
                </View>
                <Text style={pg.featureText}>{f.label}</Text>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* زر الدفع */}
        <Animated.View entering={FadeInUp.delay(400).springify()} style={{ paddingHorizontal: 20 }}>
          <AnimatedPress onPress={() => setShowPayModal(true)}>
            <LinearGradient
              colors={["#06B6D4", "#7C3AED"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={pg.payBtn}
            >
              <MaterialCommunityIcons name="crown" size={20} color="#fff" />
              <Text style={pg.payBtnText}>ادفع {PREMIUM_PRICE.toLocaleString()} جنيه وابدأ</Text>
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </LinearGradient>
          </AnimatedPress>

          <Text style={pg.secureNote}>
            🔒 الدفع آمن · يمكنك الاستفادة من الخدمة فور تأكيد الدفع
          </Text>
        </Animated.View>
      </ScrollView>

      {/* مودال الدفع */}
      <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
        <View style={pg.modalOverlay}>
          <Animated.View entering={FadeInUp.springify().damping(18)} style={pg.modalSheet}>
            <LinearGradient colors={["#06B6D4", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pg.modalHeader}>
              <TouchableOpacity onPress={() => setShowPayModal(false)} style={pg.modalClose}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
              <MaterialCommunityIcons name="credit-card-outline" size={28} color="#fff" />
              <Text style={pg.modalTitle}>إتمام الدفع</Text>
              <Text style={pg.modalSubtitle}>{PREMIUM_PRICE.toLocaleString()} جنيه سوداني</Text>
            </LinearGradient>

            <View style={{ padding: 20, gap: 14 }}>
              {/* اختيار طريقة الدفع */}
              <Text style={pg.modalLabel}>اختر طريقة الدفع</Text>
              {PAYMENT_METHODS.map(method => (
                <TouchableOpacity
                  key={method.id}
                  onPress={() => setSelectedMethod(method.id)}
                  style={[pg.methodItem, selectedMethod === method.id && { borderColor: method.color + "80", backgroundColor: method.bg }]}
                >
                  <View style={[pg.methodIcon, { backgroundColor: method.color + "20" }]}>
                    <Ionicons name={method.icon as any} size={22} color={method.color} />
                  </View>
                  <Text style={[pg.methodName, selectedMethod === method.id && { color: method.color }]}>{method.name}</Text>
                  {selectedMethod === method.id && <Ionicons name="checkmark-circle" size={20} color={method.color} />}
                </TouchableOpacity>
              ))}

              {/* رقم الهاتف / المرجع */}
              <Text style={pg.modalLabel}>رقم الهاتف أو مرجع التحويل</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="09xxxxxxxx"
                placeholderTextColor="#3F6B54"
                keyboardType="phone-pad"
                style={pg.phoneInput}
              />

              {/* ملاحظة */}
              <View style={pg.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
                <Text style={pg.infoText}>
                  بعد الدفع، أرسل لقطة شاشة لمبلغ {PREMIUM_PRICE.toLocaleString()} جنيه عبر واتساب لتفعيل خدمتك فوراً.
                </Text>
              </View>

              {/* زر التأكيد */}
              <TouchableOpacity onPress={handlePay} disabled={processing} style={{ marginTop: 4 }}>
                <LinearGradient
                  colors={["#06B6D4", "#7C3AED"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[pg.payBtn, processing && { opacity: 0.7 }]}
                >
                  {processing
                    ? <Text style={pg.payBtnText}>جاري التحقق...</Text>
                    : <>
                        <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                        <Text style={pg.payBtnText}>تأكيد الدفع</Text>
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const { width } = Dimensions.get("window");

// ── أنواع البيانات ────────────────────────────────────────────────
type CVData = {
  name: string;
  title: string;
  phone: string;
  email: string;
  address: string;
  objective: string;
  education: EducationItem[];
  experience: ExperienceItem[];
  skills: string[];
  languages: string[];
  courses: string[];
};

type EducationItem = { degree: string; institution: string; year: string };
type ExperienceItem = { position: string; company: string; period: string; desc: string };

// ── القوالب المتاحة ───────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "classic",
    name: "كلاسيكي",
    desc: "أنيق ومحترف للوظائف الرسمية",
    primaryColor: "#1E3A5F",
    accentColor: "#2563EB",
    icon: "briefcase-outline" as const,
    gradient: ["#1E3A5F", "#2563EB"] as [string, string],
    free: true,
  },
  {
    id: "minimal",
    name: "بسيط",
    desc: "نظيف ومرتّب بأسلوب مينيمال",
    primaryColor: "#374151",
    accentColor: "#6B7280",
    icon: "square-outline" as const,
    gradient: ["#374151", "#6B7280"] as [string, string],
    free: true,
  },
  {
    id: "modern",
    name: "عصري ✦ مميز",
    desc: "تصميم حديث بألوان زاهية — قالب مدفوع",
    primaryColor: "#2563EB",
    accentColor: "#06B6D4",
    icon: "layers-outline" as const,
    gradient: ["#2563EB", "#06B6D4"] as [string, string],
    free: false,
  },
  {
    id: "creative",
    name: "إبداعي ✦ مميز",
    desc: "جريء ومبتكر للمجالات الإبداعية — قالب مدفوع",
    primaryColor: "#7C3AED",
    accentColor: "#EC4899",
    icon: "color-palette-outline" as const,
    gradient: ["#7C3AED", "#EC4899"] as [string, string],
    free: false,
  },
];

// ── الخطوات ───────────────────────────────────────────────────────
const STEPS = [
  { id: 0, label: "القالب",     icon: "layers-outline"      as const },
  { id: 1, label: "معلومات",   icon: "person-outline"       as const },
  { id: 2, label: "تعليم",     icon: "school-outline"       as const },
  { id: 3, label: "خبرة",      icon: "briefcase-outline"    as const },
  { id: 4, label: "مهارات",    icon: "star-outline"         as const },
  { id: 5, label: "معاينة",    icon: "eye-outline"          as const },
];

const EMPTY_CV: CVData = {
  name: "", title: "", phone: "", email: "", address: "", objective: "",
  education: [{ degree: "", institution: "", year: "" }],
  experience: [{ position: "", company: "", period: "", desc: "" }],
  skills: [""],
  languages: ["العربية"],
  courses: [""],
};

// ── مكوّن حقل الإدخال ─────────────────────────────────────────────
function InputField({
  label, value, onChangeText, placeholder, multiline = false, keyboardType = "default",
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#3F6B54"
        style={[s.input, multiline && { height: 90, textAlignVertical: "top" }]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

// ── بناء HTML للسيرة الذاتية ──────────────────────────────────────
function buildCVHtml(cv: CVData, template: typeof TEMPLATES[0]): string {
  const skillsHtml = cv.skills.filter(Boolean).map(s => `<span class="skill">${s}</span>`).join("");
  const langsHtml  = cv.languages.filter(Boolean).map(l => `<span class="skill">${l}</span>`).join("");
  const coursesHtml = cv.courses.filter(Boolean).map(c => `<li>${c}</li>`).join("");

  const educationHtml = cv.education.filter(e => e.degree).map(e => `
    <div class="item">
      <div class="item-title">${e.degree}</div>
      <div class="item-sub">${e.institution} · ${e.year}</div>
    </div>`).join("");

  const experienceHtml = cv.experience.filter(e => e.position).map(e => `
    <div class="item">
      <div class="item-title">${e.position}</div>
      <div class="item-sub">${e.company} · ${e.period}</div>
      ${e.desc ? `<div class="item-desc">${e.desc}</div>` : ""}
    </div>`).join("");

  const p = template.primaryColor;
  const a = template.accentColor;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background:#fff; color:#1a1a1a; font-size:13px; }
  .header { background: linear-gradient(135deg, ${p}, ${a}); color:#fff; padding:28px 30px 20px; }
  .name { font-size:26px; font-weight:800; letter-spacing:0.5px; }
  .job-title { font-size:14px; opacity:0.9; margin-top:4px; }
  .contacts { display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; font-size:12px; opacity:0.92; }
  .contact-item { display:flex; align-items:center; gap:5px; }
  .body { padding:24px 30px; }
  .section { margin-bottom:20px; }
  .section-title {
    font-size:14px; font-weight:700; color:${p};
    border-right:3px solid ${p}; padding-right:8px;
    margin-bottom:10px; text-transform:uppercase; letter-spacing:0.8px;
  }
  .section-line { height:1px; background:${p}22; margin-bottom:12px; }
  .item { margin-bottom:10px; }
  .item-title { font-weight:700; font-size:13px; color:#1a1a1a; }
  .item-sub { font-size:11px; color:#555; margin-top:2px; }
  .item-desc { font-size:12px; color:#444; margin-top:4px; line-height:1.6; }
  .objective { font-size:13px; line-height:1.7; color:#333; }
  .skills-grid { display:flex; flex-wrap:wrap; gap:7px; }
  .skill {
    background:${p}18; color:${p}; border:1px solid ${p}35;
    padding:4px 11px; border-radius:20px; font-size:11px; font-weight:600;
  }
  .courses-list { padding-right:18px; }
  .courses-list li { font-size:12px; color:#333; margin-bottom:4px; line-height:1.5; }
  .two-col { display:flex; gap:24px; }
  .col { flex:1; }
</style>
</head>
<body>
<div class="header">
  <div class="name">${cv.name || "الاسم الكامل"}</div>
  <div class="job-title">${cv.title || "المسمى الوظيفي"}</div>
  <div class="contacts">
    ${cv.phone ? `<div class="contact-item">📞 ${cv.phone}</div>` : ""}
    ${cv.email ? `<div class="contact-item">✉ ${cv.email}</div>` : ""}
    ${cv.address ? `<div class="contact-item">📍 ${cv.address}</div>` : ""}
  </div>
</div>
<div class="body">
  ${cv.objective ? `
  <div class="section">
    <div class="section-title">الهدف الوظيفي</div>
    <div class="section-line"></div>
    <div class="objective">${cv.objective}</div>
  </div>` : ""}

  <div class="two-col">
    <div class="col">
      ${educationHtml ? `
      <div class="section">
        <div class="section-title">المؤهل العلمي</div>
        <div class="section-line"></div>
        ${educationHtml}
      </div>` : ""}

      ${experienceHtml ? `
      <div class="section">
        <div class="section-title">الخبرة العملية</div>
        <div class="section-line"></div>
        ${experienceHtml}
      </div>` : ""}
    </div>

    <div class="col">
      ${skillsHtml ? `
      <div class="section">
        <div class="section-title">المهارات</div>
        <div class="section-line"></div>
        <div class="skills-grid">${skillsHtml}</div>
      </div>` : ""}

      ${langsHtml ? `
      <div class="section">
        <div class="section-title">اللغات</div>
        <div class="section-line"></div>
        <div class="skills-grid">${langsHtml}</div>
      </div>` : ""}

      ${coursesHtml ? `
      <div class="section">
        <div class="section-title">الدورات والشهادات</div>
        <div class="section-line"></div>
        <ul class="courses-list">${coursesHtml}</ul>
      </div>` : ""}
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── معاينة السيرة داخل التطبيق ───────────────────────────────────
function CVPreview({ cv, template }: { cv: CVData; template: typeof TEMPLATES[0] }) {
  const p = template.primaryColor;
  const a = template.accentColor;
  return (
    <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" }}>
      {/* Header */}
      <LinearGradient colors={[p, a]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ padding: 18, gap: 4 }}>
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" }}>{cv.name || "الاسم الكامل"}</Text>
        <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: "#fff", opacity: 0.9 }}>{cv.title || "المسمى الوظيفي"}</Text>
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
          {cv.phone ? <Text style={{ fontSize: 11, color: "#fff", opacity: 0.85 }}>📞 {cv.phone}</Text> : null}
          {cv.email ? <Text style={{ fontSize: 11, color: "#fff", opacity: 0.85 }}>✉ {cv.email}</Text> : null}
          {cv.address ? <Text style={{ fontSize: 11, color: "#fff", opacity: 0.85 }}>📍 {cv.address}</Text> : null}
        </View>
      </LinearGradient>

      {/* Body */}
      <View style={{ backgroundColor: "#061525", padding: 16, gap: 14 }}>
        {cv.objective ? (
          <View>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: p, marginBottom: 6 }}>الهدف الوظيفي</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 19 }}>{cv.objective}</Text>
          </View>
        ) : null}

        {cv.education.some(e => e.degree) ? (
          <View>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: p, marginBottom: 6 }}>المؤهل العلمي</Text>
            {cv.education.filter(e => e.degree).map((e, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary }}>{e.degree}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{e.institution} · {e.year}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {cv.experience.some(e => e.position) ? (
          <View>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: p, marginBottom: 6 }}>الخبرة العملية</Text>
            {cv.experience.filter(e => e.position).map((e, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary }}>{e.position}</Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted }}>{e.company} · {e.period}</Text>
                {e.desc ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>{e.desc}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {cv.skills.some(Boolean) ? (
          <View>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: p, marginBottom: 8 }}>المهارات</Text>
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
              {cv.skills.filter(Boolean).map((skill, i) => (
                <View key={i} style={{ backgroundColor: p + "20", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: p + "40" }}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: p }}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── الشاشة الرئيسية ───────────────────────────────────────────────
export default function CVBuilderScreen() {
  return <CVBuilderWorkspace />;
}

function CVBuilderWorkspace() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [cv, setCv] = useState<CVData>({ ...EMPTY_CV });
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [unlockedPremium, setUnlockedPremium] = useState(false);
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  function updateCv(field: keyof CVData, value: any) {
    setCv(prev => ({ ...prev, [field]: value }));
  }

  function updateEducation(index: number, field: keyof EducationItem, value: string) {
    const arr = [...cv.education];
    arr[index] = { ...arr[index], [field]: value };
    updateCv("education", arr);
  }

  function addEducation() {
    updateCv("education", [...cv.education, { degree: "", institution: "", year: "" }]);
  }

  function removeEducation(i: number) {
    if (cv.education.length === 1) return;
    updateCv("education", cv.education.filter((_, idx) => idx !== i));
  }

  function updateExperience(index: number, field: keyof ExperienceItem, value: string) {
    const arr = [...cv.experience];
    arr[index] = { ...arr[index], [field]: value };
    updateCv("experience", arr);
  }

  function addExperience() {
    updateCv("experience", [...cv.experience, { position: "", company: "", period: "", desc: "" }]);
  }

  function removeExperience(i: number) {
    if (cv.experience.length === 1) return;
    updateCv("experience", cv.experience.filter((_, idx) => idx !== i));
  }

  function updateListItem(field: "skills" | "languages" | "courses", index: number, value: string) {
    const arr = [...cv[field]];
    arr[index] = value;
    updateCv(field, arr);
  }

  function addListItem(field: "skills" | "languages" | "courses") {
    updateCv(field, [...cv[field], ""]);
  }

  function removeListItem(field: "skills" | "languages" | "courses", index: number) {
    if (cv[field].length === 1) return;
    updateCv(field, cv[field].filter((_, i) => i !== index));
  }

  async function handleDownload() {
    if (!cv.name) {
      Alert.alert("تنبيه", "يرجى إدخال الاسم الكامل أولاً");
      return;
    }
    setLoading(true);
    try {
      const html = buildCVHtml(cv, selectedTemplate);
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${cv.name || "cv"}.html`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert("تم التحميل", "تم تحميل ملف السيرة الذاتية بنجاح");
      } else {
        const Print = require("expo-print");
        const Sharing = require("expo-sharing");
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "مشاركة السيرة الذاتية" });
        } else {
          Alert.alert("تم الحفظ", `تم حفظ السيرة الذاتية كـ PDF`);
        }
      }
    } catch (e) {
      Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الملف");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    const text = `سيرتي الذاتية — ${cv.name || ""}
المسمى: ${cv.title || ""}
الهاتف: ${cv.phone || ""}
البريد: ${cv.email || ""}
المهارات: ${cv.skills.filter(Boolean).join("، ")}

📎 أُنشئت بتطبيق حصاحيصاوي`;
    await Share.share({ message: text, title: "مشاركة السيرة الذاتية" });
  }

  function nextStep() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  function prevStep() {
    if (step > 0) {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* مودال الدفع للنماذج المدفوعة */}
      {showPremiumGate && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowPremiumGate(false)}>
          <View style={pg.modalOverlay}>
            <Animated.View entering={FadeInUp.springify().damping(18)} style={pg.modalSheet}>
              <LinearGradient colors={["#2563EB", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pg.modalHeader}>
                <TouchableOpacity onPress={() => setShowPremiumGate(false)} style={pg.modalClose}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
                <MaterialCommunityIcons name="crown" size={28} color="#FFD700" />
                <Text style={pg.modalTitle}>قالب مميز</Text>
                <Text style={pg.modalSubtitle}>ادفع {PREMIUM_PRICE.toLocaleString()} جنيه لفتح القوالب المدفوعة</Text>
              </LinearGradient>
              <View style={{ padding: 20, gap: 14 }}>
                <View style={pg.infoBox}>
                  <Ionicons name="star-outline" size={16} color={Colors.accent} />
                  <Text style={pg.infoText}>القوالب المدفوعة تتيح لك تصاميم أكثر احترافية وألواناً متميزة مناسبة للمجالات التخصصية والإبداعية.</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowPremiumGate(false); setUnlockedPremium(true); Alert.alert("تم التفعيل ✅", "تم فتح جميع القوالب المميزة. يرجى مراجعة المطور لإتمام الدفع.", [{ text: "حسناً" }]); }} style={{ marginTop: 4 }}>
                  <LinearGradient colors={["#2563EB", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[pg.payBtn]}>
                    <MaterialCommunityIcons name="crown" size={18} color="#FFD700" />
                    <Text style={pg.payBtnText}>فتح القوالب المميزة — {PREMIUM_PRICE.toLocaleString()} جنيه</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}

      {/* رأس الصفحة */}
      <Animated.View entering={FadeInDown.duration(400)} style={s.header}>
        <LinearGradient colors={["rgba(37,99,235,0.15)", "transparent"]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>منشئ السيرة الذاتية</Text>
          <Text style={s.headerSub}>احترافي · قابل للتحميل</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={s.shareBtn} hitSlop={12}>
          <Ionicons name="share-outline" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </Animated.View>

      {/* شريط الخطوات */}
      <View style={s.stepsBar}>
        {STEPS.map((st, i) => (
          <TouchableOpacity key={st.id} onPress={() => setStep(i)} style={s.stepItem}>
            <View style={[s.stepCircle, step === i && { backgroundColor: Colors.primary, borderColor: Colors.primary },
              step > i && { backgroundColor: Colors.primary + "30", borderColor: Colors.primary + "60" }]}>
              <Ionicons name={st.icon} size={14} color={step >= i ? Colors.primary : Colors.textMuted} />
            </View>
            <Text style={[s.stepLabel, step === i && { color: Colors.primary }]}>{st.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* المحتوى */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

          {/* الخطوة 0: اختيار القالب */}
          {step === 0 && (
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text style={s.sectionTitle}>اختر قالب سيرتك الذاتية</Text>
              {/* تقسيم مجاني / مدفوع */}
              <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#22C55E18", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#22C55E40" }}>
                  <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#22C55E" }}>مجاناً: كلاسيكي، بسيط</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F0A50018", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#F0A50040" }}>
                  <MaterialCommunityIcons name="crown" size={12} color="#F0A500" />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#F0A500" }}>مدفوع: عصري، إبداعي</Text>
                </View>
              </View>
              <View style={{ gap: 12 }}>
                {TEMPLATES.map((tmpl, i) => {
                  const isPremiumTemplate = !tmpl.free;
                  const isLocked = isPremiumTemplate && !unlockedPremium;
                  return (
                    <Animated.View key={tmpl.id} entering={FadeInDown.delay(80 + i * 60).springify()}>
                      <AnimatedPress onPress={() => {
                        if (isLocked) { setShowPremiumGate(true); return; }
                        setSelectedTemplate(tmpl);
                      }}>
                        <View style={[s.templateCard, selectedTemplate.id === tmpl.id && s.templateCardSelected, isLocked && { opacity: 0.75 }]}>
                          <LinearGradient
                            colors={tmpl.gradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={s.templateGradientStrip}
                          />
                          <View style={[s.templateIconBox, { backgroundColor: tmpl.primaryColor + "20" }]}>
                            {isLocked
                              ? <Ionicons name="lock-closed" size={22} color={tmpl.primaryColor} />
                              : <Ionicons name={tmpl.icon} size={26} color={tmpl.primaryColor} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <Text style={s.templateName}>{tmpl.name}</Text>
                              {isPremiumTemplate && (
                                <View style={{ backgroundColor: "#F0A50020", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: "#F0A50050" }}>
                                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 8, color: "#F0A500" }}>مميز</Text>
                                </View>
                              )}
                              {tmpl.free && (
                                <View style={{ backgroundColor: "#22C55E18", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: "#22C55E40" }}>
                                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 8, color: "#22C55E" }}>مجاني</Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.templateDesc}>{tmpl.desc}</Text>
                          </View>
                          {selectedTemplate.id === tmpl.id && !isLocked && (
                            <View style={[s.checkBadge, { backgroundColor: tmpl.primaryColor }]}>
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            </View>
                          )}
                          {isLocked && (
                            <View style={[s.checkBadge, { backgroundColor: "#F0A500" }]}>
                              <MaterialCommunityIcons name="crown" size={13} color="#000" />
                            </View>
                          )}
                        </View>
                      </AnimatedPress>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* الخطوة 1: المعلومات الشخصية */}
          {step === 1 && (
            <Animated.View entering={FadeInDown.delay(80).springify()} style={{ gap: 4 }}>
              <Text style={s.sectionTitle}>المعلومات الشخصية</Text>
              <InputField label="الاسم الكامل" value={cv.name} onChangeText={v => updateCv("name", v)} />
              <InputField label="المسمى الوظيفي" value={cv.title} onChangeText={v => updateCv("title", v)} placeholder="مهندس برمجيات · معلم · محاسب..." />
              <InputField label="رقم الهاتف" value={cv.phone} onChangeText={v => updateCv("phone", v)} keyboardType="phone-pad" />
              <InputField label="البريد الإلكتروني" value={cv.email} onChangeText={v => updateCv("email", v)} keyboardType="email-address" />
              <InputField label="العنوان / المدينة" value={cv.address} onChangeText={v => updateCv("address", v)} placeholder="الحصاحيصا، السودان" />
              <InputField label="الهدف الوظيفي" value={cv.objective} onChangeText={v => updateCv("objective", v)} multiline placeholder="اكتب ملخصاً مهنياً مختصراً..." />
            </Animated.View>
          )}

          {/* الخطوة 2: التعليم */}
          {step === 2 && (
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <Text style={s.sectionTitle}>المؤهل العلمي</Text>
              {cv.education.map((edu, i) => (
                <View key={i} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <Text style={s.itemCardLabel}>المؤهل {i + 1}</Text>
                    {cv.education.length > 1 && (
                      <TouchableOpacity onPress={() => removeEducation(i)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <InputField label="الدرجة العلمية" value={edu.degree} onChangeText={v => updateEducation(i, "degree", v)} placeholder="بكالوريوس · ماجستير · دبلوم..." />
                  <InputField label="المؤسسة التعليمية" value={edu.institution} onChangeText={v => updateEducation(i, "institution", v)} />
                  <InputField label="سنة التخرج" value={edu.year} onChangeText={v => updateEducation(i, "year", v)} keyboardType="numeric" />
                </View>
              ))}
              <TouchableOpacity style={s.addBtn} onPress={addEducation}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.addBtnText}>إضافة مؤهل آخر</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* الخطوة 3: الخبرة */}
          {step === 3 && (
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <Text style={s.sectionTitle}>الخبرة العملية</Text>
              {cv.experience.map((exp, i) => (
                <View key={i} style={s.itemCard}>
                  <View style={s.itemCardHeader}>
                    <Text style={s.itemCardLabel}>الخبرة {i + 1}</Text>
                    {cv.experience.length > 1 && (
                      <TouchableOpacity onPress={() => removeExperience(i)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <InputField label="المنصب / الوظيفة" value={exp.position} onChangeText={v => updateExperience(i, "position", v)} />
                  <InputField label="جهة العمل" value={exp.company} onChangeText={v => updateExperience(i, "company", v)} />
                  <InputField label="الفترة الزمنية" value={exp.period} onChangeText={v => updateExperience(i, "period", v)} placeholder="2020 - 2023" />
                  <InputField label="وصف المهام" value={exp.desc} onChangeText={v => updateExperience(i, "desc", v)} multiline />
                </View>
              ))}
              <TouchableOpacity style={s.addBtn} onPress={addExperience}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.addBtnText}>إضافة خبرة أخرى</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* الخطوة 4: المهارات */}
          {step === 4 && (
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              {/* المهارات */}
              <Text style={s.sectionTitle}>المهارات</Text>
              {cv.skills.map((skill, i) => (
                <View key={i} style={s.listRow}>
                  <TextInput
                    value={skill}
                    onChangeText={v => updateListItem("skills", i, v)}
                    placeholder={`مهارة ${i + 1}`}
                    placeholderTextColor="#3F6B54"
                    style={[s.input, { flex: 1 }]}
                  />
                  <TouchableOpacity onPress={() => removeListItem("skills", i)} style={s.removeBtn}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addBtn} onPress={() => addListItem("skills")}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.addBtnText}>إضافة مهارة</Text>
              </TouchableOpacity>

              {/* اللغات */}
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>اللغات</Text>
              {cv.languages.map((lang, i) => (
                <View key={i} style={s.listRow}>
                  <TextInput
                    value={lang}
                    onChangeText={v => updateListItem("languages", i, v)}
                    placeholder={`لغة ${i + 1}`}
                    placeholderTextColor="#3F6B54"
                    style={[s.input, { flex: 1 }]}
                  />
                  <TouchableOpacity onPress={() => removeListItem("languages", i)} style={s.removeBtn}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addBtn} onPress={() => addListItem("languages")}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.addBtnText}>إضافة لغة</Text>
              </TouchableOpacity>

              {/* الدورات */}
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>الدورات والشهادات</Text>
              {cv.courses.map((c, i) => (
                <View key={i} style={s.listRow}>
                  <TextInput
                    value={c}
                    onChangeText={v => updateListItem("courses", i, v)}
                    placeholder={`دورة أو شهادة ${i + 1}`}
                    placeholderTextColor="#3F6B54"
                    style={[s.input, { flex: 1 }]}
                  />
                  <TouchableOpacity onPress={() => removeListItem("courses", i)} style={s.removeBtn}>
                    <Ionicons name="close-circle-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addBtn} onPress={() => addListItem("courses")}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={s.addBtnText}>إضافة دورة</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* الخطوة 5: المعاينة */}
          {step === 5 && (
            <Animated.View entering={FadeIn.delay(80)} style={{ gap: 16 }}>
              <Text style={s.sectionTitle}>معاينة السيرة الذاتية</Text>
              <CVPreview cv={cv} template={selectedTemplate} />

              {/* أزرار الإجراء */}
              <AnimatedPress onPress={handleDownload}>
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryDeep]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.downloadBtn}
                >
                  {loading
                    ? <Text style={s.downloadBtnText}>جاري الإنشاء...</Text>
                    : <>
                        <Ionicons name="download-outline" size={20} color="#fff" />
                        <Text style={s.downloadBtnText}>تحميل PDF</Text>
                      </>
                  }
                </LinearGradient>
              </AnimatedPress>

              <AnimatedPress onPress={handleShare}>
                <View style={s.shareFullBtn}>
                  <Ionicons name="share-social-outline" size={20} color={Colors.accent} />
                  <Text style={[s.downloadBtnText, { color: Colors.accent }]}>مشاركة السيرة الذاتية</Text>
                </View>
              </AnimatedPress>

              {/* مؤشر القالب */}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>
                  القالب المستخدم:
                </Text>
                <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }, { backgroundColor: selectedTemplate.primaryColor + "20" }]}>
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: selectedTemplate.primaryColor }}>
                    {selectedTemplate.name}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* أزرار التنقل بين الخطوات */}
      <View style={[s.navBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          onPress={prevStep}
          disabled={step === 0}
          style={[s.navBtn, step === 0 && { opacity: 0.35 }]}
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          <Text style={s.navBtnText}>السابق</Text>
        </TouchableOpacity>

        <View style={s.stepIndicator}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.stepDot, step === i && s.stepDotActive]} />
          ))}
        </View>

        {step < STEPS.length - 1 ? (
          <TouchableOpacity onPress={nextStep} style={[s.navBtn, s.navBtnPrimary]}>
            <Text style={[s.navBtnText, { color: Colors.primary }]}>التالي</Text>
            <Ionicons name="chevron-back" size={18} color={Colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleDownload} style={[s.navBtn, s.navBtnPrimary]} disabled={loading}>
            <Ionicons name="download-outline" size={18} color={Colors.primary} />
            <Text style={[s.navBtnText, { color: Colors.primary }]}>{loading ? "..." : "تحميل"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 12,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(34,197,94,0.15)", gap: 8,
  },
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  shareBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.accent + "15", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  stepsBar: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.02)", borderBottomWidth: 0.5, borderBottomColor: Colors.divider,
  },
  stepItem: { flex: 1, alignItems: "center", gap: 4 },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: Colors.divider,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent",
  },
  stepLabel: { fontFamily: "Cairo_400Regular", fontSize: 9.5, color: Colors.textMuted },

  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right", marginBottom: 14 },

  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.18)", textAlign: "right",
  },

  itemCard: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  itemCardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  itemCardLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },

  listRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  removeBtn: { padding: 4 },

  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + "35", borderStyle: "dashed", justifyContent: "center", marginTop: 4 },
  addBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },

  templateCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 14, padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  templateCardSelected: { borderColor: Colors.primary + "60", backgroundColor: Colors.primary + "08" },
  templateGradientStrip: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  templateIconBox: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  templateName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  templateDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  checkBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },

  downloadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16 },
  downloadBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  shareFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10" },

  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: Colors.divider, backgroundColor: Colors.bg },
  navBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  navBtnPrimary: { backgroundColor: Colors.primary + "15" },
  navBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  stepIndicator: { flexDirection: "row", gap: 6 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.divider },
  stepDotActive: { width: 18, backgroundColor: Colors.primary },
});

// ── أنماط شاشة الدفع المميز ──────────────────────────────────────
const pg = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingBottom: 14, paddingTop: 12,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(6,182,212,0.18)", gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#06B6D4" },

  heroIcon: {
    width: 110, height: 110, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#06B6D4", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },
  premiumBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#F59E0B", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
    marginTop: -12, zIndex: 10,
    shadowColor: "#F59E0B", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 6,
  },
  premiumBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#000" },

  title: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary, textAlign: "center" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  priceCard: {
    alignItems: "center", paddingVertical: 22, paddingHorizontal: 40,
    borderRadius: 24, borderWidth: 1.5, borderColor: "#06B6D430",
    overflow: "hidden", gap: 6, marginHorizontal: 24,
  },
  priceLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  priceAmount: { fontFamily: "Cairo_700Bold", fontSize: 52, color: "#06B6D4" },
  priceCurrency: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#06B6D4", marginBottom: 8 },
  priceNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  featuresTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
  featuresList: { gap: 10 },
  featureItem: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: "rgba(6,182,212,0.05)", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "rgba(6,182,212,0.15)",
  },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: "#06B6D415", alignItems: "center", justifyContent: "center",
  },
  featureText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, flex: 1 },

  payBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 17, borderRadius: 18,
    shadowColor: "#06B6D4", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 10,
  },
  payBtnText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  secureNote: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: 12 },

  // مودال الدفع
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  modalHeader: { padding: 20, alignItems: "center", gap: 4 },
  modalClose: {
    position: "absolute", top: 14, right: 14,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center",
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  modalSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)" },
  modalLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },

  methodItem: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  methodIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  methodName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, flex: 1 },

  phoneInput: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    borderWidth: 1, borderColor: "rgba(6,182,212,0.25)", textAlign: "right",
  },

  infoBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.accent + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.accent + "30",
  },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 20, textAlign: "right" },
});
