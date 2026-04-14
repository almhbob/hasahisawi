import React, { useRef, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Platform, KeyboardAvoidingView, Image, Linking, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn, FadeInUp, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { uploadFile } from "@/lib/firebase/storage";

// ══════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════
const COMMITMENT_VERSION = "v1.0";
const COMMITMENT_DATE = "١ أبريل ٢٠٢٦";

const INST_TYPES = [
  { key: "health",      label: "مستشفى / عيادة",       icon: "medical-bag",        color: "#E74C6F" },
  { key: "education",   label: "مدرسة / مركز تعليمي",  icon: "school",             color: "#4CAF93" },
  { key: "government",  label: "جهة حكومية",             icon: "office-building",    color: "#2980B9" },
  { key: "ngo",         label: "جمعية / منظمة",         icon: "account-group",      color: "#9B59B6" },
  { key: "religious",   label: "مسجد / مركز ديني",      icon: "mosque",             color: "#27AE60" },
  { key: "commercial",  label: "شركة / مشروع تجاري",    icon: "domain",             color: Colors.accent },
  { key: "sport",       label: "نادي رياضي",             icon: "basketball",         color: "#E67E22" },
  { key: "cooperative", label: "جمعية تعاونية",          icon: "handshake",          color: "#1ABC9C" },
  { key: "media",       label: "وسيلة إعلامية",          icon: "newspaper-variant",  color: "#8E44AD" },
  { key: "other",       label: "أخرى",                   icon: "dots-horizontal",    color: Colors.textMuted },
] as const;

const INST_CATEGORIES = [
  "الصحة والرعاية الطبية",
  "التعليم والتدريب",
  "الخدمات الحكومية",
  "العمل الخيري والاجتماعي",
  "التجارة والاقتصاد",
  "الرياضة والشباب",
  "الثقافة والفنون",
  "البيئة والزراعة",
  "التقنية والابتكار",
  "الإعلام والتوعية",
];

const ALL_SERVICES = [
  // الصحة
  { id: "s01", label: "الرعاية الصحية الأولية",        icon: "heart-pulse",           cat: "الصحة" },
  { id: "s02", label: "الطوارئ والإسعاف",              icon: "ambulance",             cat: "الصحة" },
  { id: "s03", label: "استشارات طبية",                  icon: "doctor",                cat: "الصحة" },
  { id: "s04", label: "المختبرات والتحاليل",            icon: "test-tube",             cat: "الصحة" },
  // التعليم
  { id: "s05", label: "التعليم الأساسي والثانوي",       icon: "school",                cat: "التعليم" },
  { id: "s06", label: "التعليم العالي",                  icon: "university",            cat: "التعليم" },
  { id: "s07", label: "الدورات والتدريب المهني",        icon: "certificate",           cat: "التعليم" },
  { id: "s08", label: "الدروس الخصوصية",               icon: "book-open-page-variant", cat: "التعليم" },
  // الخدمات الاجتماعية
  { id: "s09", label: "كفالة الأيتام والأسر المحتاجة",  icon: "heart",                 cat: "اجتماعي" },
  { id: "s10", label: "توزيع المساعدات الغذائية",       icon: "food-apple",            cat: "اجتماعي" },
  { id: "s11", label: "دعم ذوي الاحتياجات الخاصة",     icon: "wheelchair-accessibility", cat: "اجتماعي" },
  { id: "s12", label: "الإرشاد الأسري والاجتماعي",     icon: "account-multiple",       cat: "اجتماعي" },
  // الخدمات الحكومية
  { id: "s13", label: "استخراج الوثائق الرسمية",       icon: "file-document",          cat: "حكومي" },
  { id: "s14", label: "التسجيل والترخيص",               icon: "clipboard-check",        cat: "حكومي" },
  { id: "s15", label: "الخدمات القانونية والقضائية",   icon: "gavel",                  cat: "حكومي" },
  { id: "s16", label: "الضرائب والرسوم",               icon: "receipt",                cat: "حكومي" },
  // التجارة والاقتصاد
  { id: "s17", label: "البيع بالتجزئة والجملة",        icon: "shopping",               cat: "تجارة" },
  { id: "s18", label: "الخدمات المصرفية والمالية",      icon: "bank",                   cat: "تجارة" },
  { id: "s19", label: "الحوالات والدفع الإلكتروني",    icon: "transfer",               cat: "تجارة" },
  { id: "s20", label: "توفير فرص العمل",               icon: "briefcase",              cat: "تجارة" },
  // الدين والمجتمع
  { id: "s21", label: "الخدمات الدينية والروحية",      icon: "mosque",                 cat: "ديني" },
  { id: "s22", label: "التوعية والإرشاد الديني",       icon: "book-open-outline",      cat: "ديني" },
  // الرياضة
  { id: "s23", label: "التدريب الرياضي",               icon: "basketball",             cat: "رياضة" },
  { id: "s24", label: "تنظيم البطولات والفعاليات",     icon: "trophy",                 cat: "رياضة" },
  // البيئة والزراعة
  { id: "s25", label: "الخدمات البيئية والنظافة",      icon: "leaf",                   cat: "بيئة" },
  { id: "s26", label: "المشاريع الزراعية",              icon: "sprout",                 cat: "بيئة" },
  // الإعلام
  { id: "s27", label: "نشر الأخبار والمعلومات",        icon: "newspaper",              cat: "إعلام" },
  { id: "s28", label: "التوعية المجتمعية",              icon: "bullhorn",               cat: "إعلام" },
];

const SERVICE_CATS = ["الكل", "الصحة", "التعليم", "اجتماعي", "حكومي", "تجارة", "ديني", "رياضة", "بيئة", "إعلام"];

// ══════════════════════════════════════════════════════
// COMMITMENT TEXT (v1.0)
// ══════════════════════════════════════════════════════
const COMMITMENT_TEXT = `بسم الله الرحمن الرحيم

عهد الشراكة المؤسسية وميثاق الالتزام
منصة حصاحيصاوي — الإصدار الأول ${COMMITMENT_DATE}

أولاً: التعريف والأطراف
يُبرَم هذا العهد بين منصة حصاحيصاوي (المنصة) من جهة، وبين المؤسسة المُتقدِّمة بطلب الانضمام ممثَّلةً بالشخص الموقِّع (الممثل الرسمي) من جهة أخرى. يُعدّ هذا المستند ملزِماً قانونياً ومعنوياً لكلا الطرفين بمجرد قبوله إلكترونياً.

ثانياً: الغاية من الشراكة
تهدف هذه الشراكة إلى جعل مدينة الحصاحيصا نموذجاً يُحتذى به بين مدن السودان والمنطقة في مجال الخدمات الرقمية المجتمعية، وذلك من خلال ربط المؤسسات المحلية بالمواطنين عبر بنية تقنية متكاملة تخدم الجميع.

ثالثاً: التزامات المؤسسة
يلتزم الممثل الرسمي بالنيابة عن مؤسسته بما يأتي:

أ) خدمة المواطنين بأمانة وإخلاص ومساواة دون تمييز بسبب الانتماء الجهوي أو العرقي أو الاجتماعي.

ب) عدم استخدام المنصة إلا في نطاق الخدمات المعتمدة المحددة في هذا الطلب، ويُحظر استغلالها لأغراض تجارية أو دعائية خارج نطاق ما تم الاتفاق عليه.

ج) الالتزام الكامل بالدقة والصدق في جميع البيانات والمعلومات المُدرَجة، ويتحمل الممثل المسؤولية الكاملة عن أي بيانات مُضللة أو منقوصة.

د) الاستجابة السريعة للمواطنين خلال مدة لا تتجاوز ثلاثة أيام عمل من تاريخ أي تواصل مُسجَّل عبر المنصة.

هـ) الإبلاغ الفوري عن أي تغيير في بيانات المؤسسة أو ممثلها خلال ٤٨ ساعة من حدوثه.

رابعاً: المسؤولية عن التقصير وإصلاح الضرر
يُقرّ الممثل الرسمي صراحةً بأن:

أ) أي تقصير أو إهمال يُلحق ضرراً بمواطن أو مجموعة من المواطنين يُوجِب على المؤسسة التعويضَ الكاملَ وإصلاحَ الضرر فورياً وبصورة موثَّقة.

ب) تُعدّ المؤسسة مسؤولة بالتضامن مع ممثلها عن جميع الأضرار الناجمة عن الإخلال بهذا العهد.

ج) للمنصة الحق في تعليق حساب المؤسسة فوراً في حال تلقّي شكاوى موثَّقة تثبت الإهمال أو الضرر، وذلك ريثما تُحسم الشكوى.

د) لا يُعفي الانسحاب من المنصة المؤسسةَ من الالتزامات التي نشأت خلال فترة عضويتها.

خامساً: شروط الانسحاب
لا يحق للمؤسسة الانسحاب بصورة فردية مفاجئة؛ إذ يُشترط إخطار المنصة كتابياً قبل ثلاثين (٣٠) يوم عمل، مع استيفاء جميع الالتزامات المعلَّقة تجاه المواطنين قبيل الانسحاب.

سادساً: الملكية الفكرية والبيانات
تُدرك المؤسسة أن بيانات التفاعل والتقييمات والآراء التي يُبديها المواطنون على المنصة هي ملكية للمنصة وللمجتمع، ولا يحق للمؤسسة حذفها أو المطالبة بإزالتها بصورة تعسفية.

سابعاً: الإقرار والتوقيع الإلكتروني
بقبوله لهذا العهد إلكترونياً، يُقرّ الممثل الرسمي بأنه:
• قرأ جميع بنود هذا العهد وفهمها وقبلها دون إكراه.
• مُفوَّض رسمياً من مؤسسته لإبرام هذه الشراكة.
• يعلم أن التوقيع الإلكتروني يعادل التوقيع الخطّي في قيمته القانونية والمعنوية.
• يقبل صراحةً بند التعويض وإصلاح الضرر الوارد في البند الرابع.

تعمل منصة حصاحيصاوي وفق مبادئ الشفافية والنزاهة والخدمة المجتمعية؛ ونحن نثق أن هذه الشراكة ستُسهم في جعل الحصاحيصا نموذجاً يُفخر به.

«وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ»`;

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function Field({
  label, value, onChange, placeholder, keyboardType, multiline, required, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean;
  required?: boolean; icon?: string;
}) {
  return (
    <View style={fi.block}>
      <Text style={fi.label}>
        {label}{required ? <Text style={{ color: Colors.danger }}> *</Text> : null}
      </Text>
      <View style={[fi.row, multiline && fi.rowMulti]}>
        {icon && !multiline && (
          <Ionicons name={icon as any} size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
        )}
        <TextInput
          style={[fi.input, multiline && fi.inputMulti]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType || "default"}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          textAlignVertical={multiline ? "top" : "center"}
          textAlign="right"
        />
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════
type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function OrgJoinScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const auth = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const commitmentSectionYRef = useRef<number>(9999);

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [appId, setAppId] = useState<number | null>(null);
  const [appStatus, setAppStatus] = useState<string>("pending");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [contractAgreed, setContractAgreed] = useState(false);
  const [commitmentScrolled, setCommitmentScrolled] = useState(false);
  const [serviceCatFilter, setServiceCatFilter] = useState("الكل");

  // إعدادات العقد
  const [contractWhatsapp, setContractWhatsapp] = useState("+966530658285");
  const [uploadingSignedContract, setUploadingSignedContract] = useState(false);
  const [signedContractUrl, setSignedContractUrl] = useState<string | null>(null);

  // ── Step 1: بيانات المؤسسة ──
  const [instName, setInstName] = useState("");
  const [instType, setInstType] = useState<string>("");
  const [instCategory, setInstCategory] = useState("");
  const [instDesc, setInstDesc] = useState("");
  const [instAddress, setInstAddress] = useState("");
  const [instNeighborhood, setInstNeighborhood] = useState("");
  const [instPhone, setInstPhone] = useState("");
  const [instEmail, setInstEmail] = useState("");
  const [instWebsite, setInstWebsite] = useState("");
  const [instRegNo, setInstRegNo] = useState("");
  const [instFounded, setInstFounded] = useState("");

  // ── Step 2: الخدمات ──
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState("");

  // ── Step 3: بيانات الممثل + الصورة ──
  const [repName, setRepName] = useState(auth.user?.name || "");
  const [repTitle, setRepTitle] = useState("");
  const [repNationalId, setRepNationalId] = useState("");
  const [repPhone, setRepPhone] = useState("");
  const [repEmail, setRepEmail] = useState("");
  const [repPhotoUri, setRepPhotoUri] = useState<string | null>(null);
  const [repPhotoUploading, setRepPhotoUploading] = useState(false);
  const [repPhotoUrl, setRepPhotoUrl] = useState<string | null>(null);
  const [repPhotoUploadFailed, setRepPhotoUploadFailed] = useState(false);

  // جلب رقم واتساب العقود عند التحميل
  useEffect(() => {
    const base = getApiUrl().replace(/\/$/, "");
    fetch(`${base}/api/institution-applications/contract-settings`)
      .then(r => r.json())
      .then(d => { if (d.contract_whatsapp) setContractWhatsapp(d.contract_whatsapp); })
      .catch(() => {});
  }, []);

  const toggleService = (id: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const filteredServices = serviceCatFilter === "الكل"
    ? ALL_SERVICES
    : ALL_SERVICES.filter(s => s.cat === serviceCatFilter);

  const instTypeObj = INST_TYPES.find(t => t.key === instType);

  // رفع صورة هوية الممثل
  const pickRepPhoto = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى المعرض لرفع الصورة");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setRepPhotoUri(uri);
    setRepPhotoUrl(null);
    setRepPhotoUploadFailed(false);
    if (auth.user) {
      setRepPhotoUploading(true);
      try {
        const name = `${Date.now()}_rep_id.jpg`;
        const url = await uploadFile(`institution_applications/${auth.user.id}/${name}`, uri);
        setRepPhotoUrl(url);
        setRepPhotoUploadFailed(false);
      } catch {
        setRepPhotoUploadFailed(true);
      } finally {
        setRepPhotoUploading(false);
      }
    }
  };

  // التحقق من حالة الطلب
  const checkAppStatus = async () => {
    if (!appId) return;
    setCheckingStatus(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = {};
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      const res = await fetch(`${base}/api/institution-applications/${appId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAppStatus(data.status || "pending");
        if (data.signed_contract_url) setSignedContractUrl(data.signed_contract_url);
      }
    } catch {}
    finally { setCheckingStatus(false); }
  };

  // تحميل العقد الرسمي
  const downloadContract = () => {
    const base = getApiUrl().replace(/\/$/, "");
    const pdfUrl = `${base}/api/institution-applications/contract-pdf`;
    Linking.openURL(pdfUrl).catch(() =>
      Alert.alert("خطأ", "تعذّر فتح ملف العقد")
    );
  };

  // إرسال العقد عبر الواتساب
  const sendViaWhatsApp = () => {
    const phone = contractWhatsapp.replace(/\D/g, "");
    const msg = encodeURIComponent(
      `السلام عليكم،\nأنا ${repName} — ممثل مؤسسة: ${instName}\nأرغب في إرسال عقد انضمام المؤسسة الموقّع.\nرقم الطلب: #${appId}`
    );
    Linking.openURL(`whatsapp://send?phone=${phone}&text=${msg}`).catch(() =>
      Linking.openURL(`https://wa.me/${phone}?text=${msg}`).catch(() =>
        Alert.alert("واتساب", "تعذّر فتح واتساب. يرجى تثبيت التطبيق أو التواصل مباشرة على: " + contractWhatsapp)
      )
    );
  };

  // رفع العقد الموقع
  const uploadSignedContract = async () => {
    if (!appId) return;
    if (appStatus !== "approved") {
      Alert.alert("غير متاح", "يمكن رفع العقد الموقع فقط بعد الموافقة على الطلب");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول إلى الملفات");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setUploadingSignedContract(true);
    try {
      const name = `${Date.now()}_signed_contract.jpg`;
      const url = await uploadFile(`signed_contracts/${appId}/${name}`, uri);
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      const res = await fetch(`${base}/api/institution-applications/${appId}/signed-contract`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ signed_contract_url: url }),
      });
      if (res.ok) {
        setSignedContractUrl(url);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("تم الرفع", "تم رفع العقد الموقع بنجاح. سيتم مراجعته من قِبل الإدارة.");
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "تعذّر رفع العقد");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر رفع الملف، تأكد من الاتصال وحاول مجدداً");
    } finally {
      setUploadingSignedContract(false);
    }
  };

  const goNext = () => {
    if (step === 1) {
      if (!instName.trim()) return Alert.alert("تنبيه", "يرجى إدخال اسم المؤسسة");
      if (!instType) return Alert.alert("تنبيه", "يرجى تحديد نوع المؤسسة");
      if (!instCategory) return Alert.alert("تنبيه", "يرجى تحديد تصنيف المؤسسة");
      if (!instDesc.trim()) return Alert.alert("تنبيه", "يرجى كتابة وصف للمؤسسة");
      if (!instAddress.trim()) return Alert.alert("تنبيه", "يرجى إدخال عنوان المؤسسة");
      if (!instPhone.trim()) return Alert.alert("تنبيه", "يرجى إدخال رقم هاتف المؤسسة");
    }
    if (step === 2) {
      if (selectedServices.length === 0) return Alert.alert("تنبيه", "يرجى تحديد خدمة واحدة على الأقل");
    }
    if (step === 3) {
      if (!repName.trim()) return Alert.alert("تنبيه", "يرجى إدخال اسم الممثل");
      if (!repTitle.trim()) return Alert.alert("تنبيه", "يرجى إدخال المسمى الوظيفي للممثل");
      if (!repNationalId.trim()) return Alert.alert("تنبيه", "يرجى إدخال الرقم الوطني للممثل");
      if (!repPhone.trim()) return Alert.alert("تنبيه", "يرجى إدخال رقم هاتف الممثل");
      if (!repPhotoUri && !repPhotoUrl) {
        return Alert.alert("تنبيه", "يرجى إرفاق صورة هوية الممثل الرسمي");
      }
    }
    if (step === 4) {
      if (!contractAgreed) {
        return Alert.alert("تنبيه", "يرجى تأكيد قراءتك والموافقة على بنود العقد أولاً");
      }
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(s => Math.min(s + 1, 6) as Step);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => Math.max(s - 1, 1) as Step);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleSubmit = async () => {
    if (!commitmentScrolled) {
      return Alert.alert("تنبيه", "يرجى قراءة العهد كاملاً قبل التوقيع");
    }
    setSubmitting(true);

    // إعادة محاولة رفع صورة الهوية إذا فشلت سابقاً
    let finalRepPhotoUrl = repPhotoUrl;
    if (!finalRepPhotoUrl && repPhotoUri && auth.user) {
      try {
        const name = `${Date.now()}_rep_id.jpg`;
        finalRepPhotoUrl = await uploadFile(`institution_applications/${auth.user.id}/${name}`, repPhotoUri);
        setRepPhotoUrl(finalRepPhotoUrl);
        setRepPhotoUploadFailed(false);
      } catch {
        // نستمر بدون صورة — يمكن للإدارة طلبها لاحقاً
      }
    }

    try {
      const base = getApiUrl().replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;

      const res = await fetch(`${base}/api/institution-applications`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          inst_name: instName.trim(),
          inst_type: instType,
          inst_category: instCategory,
          inst_description: instDesc.trim(),
          inst_address: instAddress.trim(),
          inst_neighborhood: instNeighborhood.trim() || undefined,
          inst_phone: instPhone.trim(),
          inst_email: instEmail.trim() || undefined,
          inst_website: instWebsite.trim() || undefined,
          inst_registration_no: instRegNo.trim() || undefined,
          inst_founded_year: instFounded.trim() || undefined,
          selected_services: JSON.stringify(selectedServices),
          custom_services: customServices.trim() || undefined,
          rep_name: repName.trim(),
          rep_title: repTitle.trim(),
          rep_national_id: repNationalId.trim(),
          rep_phone: repPhone.trim(),
          rep_email: repEmail.trim() || undefined,
          rep_photo_url: finalRepPhotoUrl || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAppId(data.application?.id ?? null);
        setAppStatus("pending");
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep(6);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        const err = await res.json();
        Alert.alert("خطأ", err.error || "تعذّر تقديم الطلب");
      }
    } catch {
      Alert.alert("خطأ في الاتصال", "تأكد من اتصالك بالإنترنت وحاول مجدداً");
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = [
    { n: 1, label: "المؤسسة" },
    { n: 2, label: "الخدمات" },
    { n: 3, label: "الممثل" },
    { n: 4, label: "العقد" },
    { n: 5, label: "العهد" },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <LinearGradient
        colors={[Colors.cardBg, Colors.bg]}
        style={[s.header, { paddingTop: topPad + 10 }]}
      >
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>استمارة انضمام مؤسسة</Text>
            <Text style={s.headerSub}>منصة حصاحيصاوي — الخدمات المجتمعية</Text>
          </View>
          <LinearGradient colors={[Colors.primary + "30", Colors.primary + "15"]} style={s.headerIcon}>
            <MaterialCommunityIcons name="domain-plus" size={22} color={Colors.primary} />
          </LinearGradient>
        </View>

        {/* Progress */}
        {step < 6 && (
          <View style={s.progressRow}>
            {STEPS.map((st, i) => {
              const done = step > st.n;
              const active = step === st.n;
              return (
                <React.Fragment key={st.n}>
                  <View style={s.progressItem}>
                    <View style={[s.progressDot, done && s.progressDone, active && s.progressActive]}>
                      {done
                        ? <Ionicons name="checkmark" size={10} color="#fff" />
                        : <Text style={[s.progressNum, active && { color: "#fff" }]}>{st.n}</Text>
                      }
                    </View>
                    <Text style={[s.progressLabel, active && { color: Colors.primary }]}>{st.label}</Text>
                  </View>
                  {i < 4 && (
                    <View style={[s.progressLine, done && { backgroundColor: Colors.primary }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          if (step === 5 && !commitmentScrolled) {
            const scrolledPast = nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height;
            if (scrolledPast >= commitmentSectionYRef.current) {
              setCommitmentScrolled(true);
            }
          }
        }}
        scrollEventThrottle={200}
      >
        {/* ══════════════════ STEP 1: بيانات المؤسسة ══════════════════ */}
        {step === 1 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 16 }}>
            <View style={s.stepHeader}>
              <View style={[s.stepIcon, { backgroundColor: Colors.primary + "20" }]}>
                <MaterialCommunityIcons name="office-building-outline" size={24} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>بيانات المؤسسة</Text>
                <Text style={s.stepSub}>معلومات أساسية عن مؤسستك</Text>
              </View>
            </View>

            <Field label="اسم المؤسسة" value={instName} onChange={setInstName}
              placeholder="الاسم الرسمي الكامل للمؤسسة" required icon="business-outline" />

            {/* نوع المؤسسة */}
            <View style={fi.block}>
              <Text style={fi.label}>نوع المؤسسة <Text style={{ color: Colors.danger }}>*</Text></Text>
              <View style={s.typeGrid}>
                {INST_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.typeCard, instType === t.key && { borderColor: t.color, backgroundColor: t.color + "15" }]}
                    onPress={() => { setInstType(t.key); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
                  >
                    <MaterialCommunityIcons name={t.icon as any} size={22} color={instType === t.key ? t.color : Colors.textMuted} />
                    <Text style={[s.typeCardText, instType === t.key && { color: t.color }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, backgroundColor: "#6B728012", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#6B728025" }}>
                <Ionicons name="information-circle-outline" size={16} color="#6B7280" style={{ marginTop: 2 }} />
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: "#6B7280", flex: 1, lineHeight: 20 }}>
                  حصاحيصاوي منصة مجتمعية أهلية مستقلة، وغير تابعة لأي جهة حكومية. انضمام الجهات الحكومية لأغراض التواصل المجتمعي فقط.
                </Text>
              </View>
            </View>

            {/* تصنيف المؤسسة */}
            <View style={fi.block}>
              <Text style={fi.label}>التصنيف الوظيفي <Text style={{ color: Colors.danger }}>*</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {INST_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.catChip, instCategory === cat && { borderColor: Colors.primary, backgroundColor: Colors.primary + "18" }]}
                    onPress={() => setInstCategory(cat)}
                  >
                    <Text style={[s.catChipText, instCategory === cat && { color: Colors.primary }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Field label="وصف المؤسسة" value={instDesc} onChange={setInstDesc}
              placeholder="اشرح طبيعة عمل مؤسستك وأهدافها الخدمية..." required multiline />

            <View style={s.dividerRow}>
              <View style={s.divider} />
              <Text style={s.dividerText}>بيانات الاتصال والموقع</Text>
              <View style={s.divider} />
            </View>

            <Field label="العنوان التفصيلي" value={instAddress} onChange={setInstAddress}
              placeholder="الشارع، الحي، الموقع الدقيق" required icon="location-outline" />

            <Field label="الحي أو القرية" value={instNeighborhood} onChange={setInstNeighborhood}
              placeholder="اختياري — حي الشرقي، قرية المسلمية..." icon="map-outline" />

            <Field label="هاتف المؤسسة" value={instPhone} onChange={setInstPhone}
              placeholder="09xxxxxxxx" required keyboardType="phone-pad" icon="call-outline" />

            <Field label="البريد الإلكتروني" value={instEmail} onChange={setInstEmail}
              placeholder="info@example.com (اختياري)" keyboardType="email-address" icon="mail-outline" />

            <Field label="الموقع الإلكتروني" value={instWebsite} onChange={setInstWebsite}
              placeholder="https://... (اختياري)" icon="globe-outline" />

            <View style={s.dividerRow}>
              <View style={s.divider} />
              <Text style={s.dividerText}>بيانات التسجيل الرسمي</Text>
              <View style={s.divider} />
            </View>

            <Field label="رقم السجل التجاري / تصريح الجهة" value={instRegNo} onChange={setInstRegNo}
              placeholder="اختياري — إن وُجد" icon="document-text-outline" />

            <Field label="سنة التأسيس" value={instFounded} onChange={setInstFounded}
              placeholder="مثال: ٢٠١٥" keyboardType="numeric" icon="calendar-outline" />
          </Animated.View>
        )}

        {/* ══════════════════ STEP 2: الخدمات المقدمة ══════════════════ */}
        {step === 2 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 16 }}>
            <View style={s.stepHeader}>
              <View style={[s.stepIcon, { backgroundColor: Colors.accent + "25" }]}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={24} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>الخدمات المقدمة للمواطنين</Text>
                <Text style={s.stepSub}>حدد ما تقدمه مؤسستك من خدمات</Text>
              </View>
            </View>

            {/* عداد المحدد */}
            {selectedServices.length > 0 && (
              <Animated.View entering={ZoomIn.springify()}>
                <LinearGradient colors={[Colors.primary + "20", Colors.primary + "10"]} style={s.selectedCount}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  <Text style={s.selectedCountText}>تم تحديد {selectedServices.length} خدمة</Text>
                </LinearGradient>
              </Animated.View>
            )}

            {/* فلتر الفئات */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SERVICE_CATS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[s.catChip, serviceCatFilter === cat && { borderColor: Colors.accent, backgroundColor: Colors.accent + "18" }]}
                  onPress={() => setServiceCatFilter(cat)}
                >
                  <Text style={[s.catChipText, serviceCatFilter === cat && { color: Colors.accent }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* قائمة الخدمات */}
            <View style={{ gap: 8 }}>
              {filteredServices.map((svc, i) => {
                const selected = selectedServices.includes(svc.id);
                return (
                  <Animated.View key={svc.id} entering={FadeInDown.delay(i * 30).springify()}>
                    <TouchableOpacity
                      style={[s.serviceCard, selected && { borderColor: Colors.primary, backgroundColor: Colors.primary + "12" }]}
                      onPress={() => toggleService(svc.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.serviceIcon, selected && { backgroundColor: Colors.primary + "20" }]}>
                        <MaterialCommunityIcons name={svc.icon as any} size={20} color={selected ? Colors.primary : Colors.textMuted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.serviceLabel, selected && { color: Colors.primary }]}>{svc.label}</Text>
                        <Text style={s.serviceCat}>{svc.cat}</Text>
                      </View>
                      <View style={[s.checkbox, selected && s.checkboxSelected]}>
                        {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            {/* خدمات إضافية */}
            <View style={fi.block}>
              <Text style={fi.label}>خدمات إضافية لم تُذكر (اختياري)</Text>
              <TextInput
                style={[fi.input, fi.inputMulti]}
                value={customServices}
                onChangeText={setCustomServices}
                placeholder="اذكر أي خدمات أخرى تقدمها مؤسستك..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                textAlign="right"
              />
            </View>
          </Animated.View>
        )}

        {/* ══════════════════ STEP 3: بيانات الممثل ══════════════════ */}
        {step === 3 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 16 }}>
            <View style={s.stepHeader}>
              <View style={[s.stepIcon, { backgroundColor: "#9B59B6" + "25" }]}>
                <MaterialCommunityIcons name="account-tie" size={24} color="#9B59B6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>بيانات الممثل الرسمي</Text>
                <Text style={s.stepSub}>الشخص المفوَّض للتوقيع نيابةً عن المؤسسة</Text>
              </View>
            </View>

            <LinearGradient colors={["#9B59B6" + "18", Colors.bg]} style={s.repNote}>
              <Ionicons name="information-circle-outline" size={18} color="#9B59B6" />
              <Text style={s.repNoteText}>
                يجب أن يكون الممثل شخصاً مُفوَّضاً رسمياً من المؤسسة. بياناته ستظهر في وثيقة العهد وستُحفظ بصورة آمنة.
              </Text>
            </LinearGradient>

            <Field label="الاسم الكامل للممثل" value={repName} onChange={setRepName}
              placeholder="الاسم الثلاثي كاملاً" required icon="person-outline" />

            <Field label="المسمى الوظيفي / الصفة" value={repTitle} onChange={setRepTitle}
              placeholder="مثال: المدير التنفيذي، رئيس مجلس الإدارة..." required icon="briefcase-outline" />

            <Field label="الرقم الوطني (هوية السودان)" value={repNationalId} onChange={setRepNationalId}
              placeholder="يُستخدم للتحقق من الهوية فقط" required keyboardType="numeric" icon="card-outline" />

            <Field label="رقم الهاتف الشخصي" value={repPhone} onChange={setRepPhone}
              placeholder="09xxxxxxxx" required keyboardType="phone-pad" icon="call-outline" />

            <Field label="البريد الإلكتروني الشخصي" value={repEmail} onChange={setRepEmail}
              placeholder="للتواصل الرسمي (اختياري)" keyboardType="email-address" icon="mail-outline" />

            {/* صورة هوية الممثل */}
            <View style={fi.block}>
              <Text style={fi.label}>
                صورة هوية الممثل الرسمي <Text style={{ color: Colors.danger }}>*</Text>
              </Text>
              <TouchableOpacity
                style={[s.photoPicker, repPhotoUri && (repPhotoUploadFailed ? s.photoPickerFailed : s.photoPickerDone)]}
                onPress={pickRepPhoto}
                disabled={repPhotoUploading}
                activeOpacity={0.8}
              >
                {repPhotoUri ? (
                  <View style={s.photoPreviewRow}>
                    <Image source={{ uri: repPhotoUri }} style={s.photoPreview} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {repPhotoUploading ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : repPhotoUploadFailed ? (
                          <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                        ) : (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                        )}
                        <Text style={[s.photoPickerDoneText, repPhotoUploadFailed && { color: Colors.danger }]}>
                          {repPhotoUploading
                            ? "جارٍ الرفع..."
                            : repPhotoUploadFailed
                            ? "لم يُرفع بعد — سيُرسل مع الطلب"
                            : "✓ تم رفع الصورة"}
                        </Text>
                      </View>
                      <Text style={s.photoPickerChange}>اضغط لتغيير الصورة</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.photoPickerEmpty}>
                    <View style={s.photoPickerIcon}>
                      <MaterialCommunityIcons name="card-account-details-outline" size={28} color={Colors.textMuted} />
                    </View>
                    <View>
                      <Text style={s.photoPickerTitle}>إرفاق صورة الهوية</Text>
                      <Text style={s.photoPickerSub}>صورة واضحة لبطاقة الهوية الوطنية أو جواز السفر</Text>
                    </View>
                    <Ionicons name="cloud-upload-outline" size={20} color={Colors.textMuted} />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={s.photoNote}>
                ⚠ الصورة مشفّرة ومحمية — تُستخدم للتحقق من الهوية فقط ولا تُنشر علناً
              </Text>
            </View>

            {/* ملخص المؤسسة */}
            <View style={s.summaryBox}>
              <Text style={s.summaryTitle}>ملخص طلبك</Text>
              <View style={s.summaryRow}>
                <Text style={s.summaryVal}>{instName}</Text>
                <Text style={s.summaryKey}>المؤسسة</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryVal}>{instTypeObj?.label || "—"}</Text>
                <Text style={s.summaryKey}>النوع</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryVal}>{selectedServices.length} خدمة محددة</Text>
                <Text style={s.summaryKey}>الخدمات</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ══════════════════ STEP 4: معاينة العقد الرسمي ══════════════════ */}
        {step === 4 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 16 }}>
            <View style={s.stepHeader}>
              <View style={[s.stepIcon, { backgroundColor: Colors.cyber + "20" }]}>
                <MaterialCommunityIcons name="file-document-outline" size={24} color={Colors.cyber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>عقد انضمام المؤسسة</Text>
                <Text style={s.stepSub}>اطّلع على بنود العقد الرسمي قبل التوقيع</Text>
              </View>
            </View>

            <LinearGradient colors={[Colors.cyber + "18", Colors.bg]} style={s.repNote}>
              <MaterialCommunityIcons name="information-outline" size={18} color={Colors.cyber} />
              <Text style={[s.repNoteText, { color: Colors.cyber + "CC" }]}>
                هذا العقد رسمي وملزم قانونياً. اقرأه بعناية — ستتمكن من تحميله وتوقيعه بعد الموافقة.
              </Text>
            </LinearGradient>

            {/* وثيقة العقد */}
            <View style={[s.documentCard, { borderColor: Colors.cyber + "40" }]}>
              <MaterialCommunityIcons name="seal-variant" size={40} color={Colors.cyber + "60"} />
              <Text style={[s.documentHeader, { color: Colors.cyber }]}>منصة حصاحيصاوي</Text>
              <Text style={s.documentSubHeader}>عقد انضمام مؤسسة لتقديم الخدمات</Text>
              <Text style={s.documentSubHeader}>الطرف الأول — المنصة · الطرف الثاني — المؤسسة</Text>
              <View style={[s.documentDivider, { borderColor: Colors.cyber + "40", backgroundColor: Colors.cyber + "30" }]} />

              {/* المادة 1: أطراف العقد */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>١ — أطراف العقد</Text>
                <View style={s.contractParties}>
                  <View style={s.contractParty}>
                    <Text style={s.contractPartyTitle}>الطرف الأول — المنصة</Text>
                    <Text style={s.contractPartyText}>Almhbob.iii@gmail.com</Text>
                    <Text style={s.contractPartyText}>{contractWhatsapp}</Text>
                    <Text style={s.contractPartyText}>مدينة الحصاحيصا</Text>
                  </View>
                  <View style={[s.contractPartyDivider]} />
                  <View style={s.contractParty}>
                    <Text style={s.contractPartyTitle}>الطرف الثاني — المؤسسة</Text>
                    <Text style={[s.contractPartyText, { color: Colors.textPrimary }]}>{instName || "—"}</Text>
                    <Text style={s.contractPartyText}>{instType || "—"}</Text>
                    <Text style={s.contractPartyText}>{repName || "—"} ({repTitle || "—"})</Text>
                    <Text style={s.contractPartyText}>{repNationalId ? `****${repNationalId.slice(-4)}` : "—"}</Text>
                  </View>
                </View>
              </View>

              {/* المادة 2: موضوع العقد */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>٢ — موضوع العقد</Text>
                <Text style={s.contractBody}>
                  انضمام المؤسسة إلى منصة حصاحيصاوي الرقمية وتقديم خدماتها لمواطني مدينة الحصاحيصا عبر التطبيق، وفق الشروط والأحكام المنصوص عليها في هذا العقد.
                </Text>
              </View>

              {/* المادة 3: التزامات المؤسسة */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>٣ — التزامات المؤسسة</Text>
                {[
                  "تقديم الخدمات المعلنة بصورة منتظمة ومستمرة دون انقطاع.",
                  "الإفصاح الكامل عن طبيعة الخدمات وشروطها وتكاليفها.",
                  "الرد على شكاوى المواطنين خلال 48 ساعة من تاريخ تسجيلها.",
                  "معالجة الشكاوى في مدة لا تتجاوز 7 أيام عمل.",
                  "الالتزام بقوانين وأنظمة جمهورية السودان.",
                ].map((item, i) => (
                  <View key={i} style={s.contractBullet}>
                    <Text style={s.contractBulletDot}>•</Text>
                    <Text style={s.contractBulletText}>{item}</Text>
                  </View>
                ))}
              </View>

              {/* المادة 4: التزامات المنصة */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>٤ — التزامات المنصة</Text>
                {[
                  "توفير مساحة ظاهرة للمؤسسة داخل التطبيق لعرض خدماتها واستقبال طلبات المواطنين.",
                  "توفير نظام متابعة الشكاوى والحفاظ على سرية بيانات المؤسسة.",
                  "إشعار المؤسسة بأي تحديثات تطال سياسات المنصة قبل تطبيقها بـ 14 يوماً.",
                ].map((item, i) => (
                  <View key={i} style={s.contractBullet}>
                    <Text style={[s.contractBulletDot, { color: Colors.cyber }]}>•</Text>
                    <Text style={s.contractBulletText}>{item}</Text>
                  </View>
                ))}
              </View>

              {/* المادة 5: الجزاءات */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>٥ — الجزاءات والعقوبات</Text>
                <View style={s.contractPenalties}>
                  <View style={[s.penaltyItem, { borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "0A" }]}>
                    <Text style={s.penaltyIcon}>⚠️</Text>
                    <Text style={s.penaltyTitle}>إنذار رسمي</Text>
                    <Text style={s.penaltyDesc}>عند المخالفة الأولى مع إمهال المؤسسة لتصحيح وضعها</Text>
                  </View>
                  <View style={[s.penaltyItem, { borderColor: "#F9731640", backgroundColor: "#F9731608" }]}>
                    <Text style={s.penaltyIcon}>⏸️</Text>
                    <Text style={[s.penaltyTitle, { color: "#F97316" }]}>تعليق مؤقت</Text>
                    <Text style={s.penaltyDesc}>عند تكرار المخالفة أو عدم الاستجابة للإنذار</Text>
                  </View>
                  <View style={[s.penaltyItem, { borderColor: Colors.danger + "40", backgroundColor: Colors.danger + "08" }]}>
                    <Text style={s.penaltyIcon}>🚫</Text>
                    <Text style={[s.penaltyTitle, { color: Colors.danger }]}>إيقاف نهائي</Text>
                    <Text style={s.penaltyDesc}>عند الإخلال الجسيم أو المتكرر وإلغاء العقد بالكامل</Text>
                  </View>
                </View>
              </View>

              {/* المادة 6: المدة والإنهاء وفض النزاعات */}
              <View style={s.contractSection}>
                <Text style={s.contractSectionTitle}>٦ — مدة العقد والإنهاء وفض النزاعات</Text>
                <View style={s.contractInfoGrid}>
                  <View style={s.contractInfoCell}>
                    <Text style={s.contractInfoLabel}>⏱ مدة العقد</Text>
                    <Text style={s.contractInfoText}>سنة كاملة من تاريخ التوقيع، تُجدَّد تلقائياً ما لم يُبلَّغ الطرف الآخر قبل 30 يوماً.</Text>
                  </View>
                  <View style={[s.contractInfoCell, { borderTopWidth: 1, borderColor: Colors.cyber + "20" }]}>
                    <Text style={s.contractInfoLabel}>⚖️ فض النزاعات</Text>
                    <Text style={s.contractInfoText}>يُسعى أولاً للحل بالتراضي، فإن تعذّر يُحال النزاع للجهات القضائية المختصة في جمهورية السودان.</Text>
                  </View>
                  <View style={[s.contractInfoCell, { borderTopWidth: 1, borderColor: Colors.cyber + "20" }]}>
                    <Text style={s.contractInfoLabel}>📄 نسخ العقد</Text>
                    <Text style={s.contractInfoText}>محرَّر من نسختين أصليتين متساويتين في الحجية القانونية، يحتفظ كل طرف بنسخة.</Text>
                  </View>
                </View>
              </View>

              <View style={[s.documentDivider, { backgroundColor: Colors.cyber + "30" }]} />
              <Text style={s.documentFooter}>
                هذا العقد ملزم قانونياً لكلا الطرفين فور التوقيع عليه{"\n"}
                أي تعديل يستلزم موافقة خطية من الطرفين{"\n"}
                وثيقة رسمية صادرة عن منصة حصاحيصاوي © 2026
              </Text>
            </View>

            {/* تنبيه PDF */}
            <View style={s.warningBox}>
              <MaterialCommunityIcons name="download-circle-outline" size={20} color={Colors.accent} />
              <Text style={s.warningText}>
                بعد الموافقة على طلبك ستتمكن من تحميل هذا العقد بصيغة PDF لملئه وتوقيعه ورفعه أو إرساله عبر الواتساب للإدارة.
              </Text>
            </View>

            {/* مربع الموافقة */}
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                setContractAgreed(v => !v);
              }}
              activeOpacity={0.8}
              style={{
                flexDirection: "row", alignItems: "center", gap: 14,
                backgroundColor: contractAgreed ? Colors.primary + "15" : Colors.cardBg,
                borderRadius: 14, borderWidth: 1.5,
                borderColor: contractAgreed ? Colors.primary + "60" : Colors.divider,
                padding: 16,
              }}
            >
              <View style={{
                width: 26, height: 26, borderRadius: 8, borderWidth: 2,
                borderColor: contractAgreed ? Colors.primary : Colors.textMuted,
                backgroundColor: contractAgreed ? Colors.primary : "transparent",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {contractAgreed && (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                )}
              </View>
              <Text style={{
                flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14,
                color: contractAgreed ? Colors.primary : Colors.textSecondary,
                lineHeight: 22, textAlign: "right",
              }}>
                قرأت عقد انضمام المؤسسة وأوافق على جميع بنوده وشروطه
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ══════════════════ STEP 5: العهد والالتزام ══════════════════ */}
        {step === 5 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 16 }}>
            <View style={s.stepHeader}>
              <View style={[s.stepIcon, { backgroundColor: Colors.danger + "20" }]}>
                <MaterialCommunityIcons name="seal" size={24} color={Colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>عهد الشراكة والالتزام</Text>
                <Text style={s.stepSub}>اقرأ بعناية قبل التوقيع الإلكتروني</Text>
              </View>
            </View>

            {!commitmentScrolled && (
              <LinearGradient colors={[Colors.danger + "20", Colors.danger + "08"]} style={s.readNote}>
                <MaterialCommunityIcons name="arrow-down-circle-outline" size={22} color={Colors.danger} />
                <Text style={s.readNoteText}>مرّر للنهاية لقراءة العهد كاملاً قبل التوقيع</Text>
              </LinearGradient>
            )}

            {commitmentScrolled && (
              <Animated.View entering={ZoomIn.springify()}>
                <LinearGradient colors={[Colors.primary + "20", Colors.primary + "10"]} style={s.readNote}>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                  <Text style={[s.readNoteText, { color: Colors.primary }]}>قرأت العهد كاملاً — يمكنك التوقيع الآن</Text>
                </LinearGradient>
              </Animated.View>
            )}

            {/* الوثيقة */}
            <View style={s.documentCard}>
              {/* ختم */}
              <View style={s.documentStamp}>
                <MaterialCommunityIcons name="seal-variant" size={36} color={Colors.primary + "60"} />
              </View>
              <Text style={s.documentHeader}>منصة حصاحيصاوي</Text>
              <Text style={s.documentSubHeader}>وثيقة عهد الشراكة المؤسسية</Text>
              <View style={s.documentDivider} />

              <ScrollView
                style={s.documentScroll}
                contentContainerStyle={{ alignItems: "stretch" }}
                nestedScrollEnabled
                onContentSizeChange={(_, contentH) => {
                  // إذا كان النص يتسع دون تمرير → نعتبره مقروءاً تلقائياً
                  const maxH = 340;
                  if (contentH <= maxH && !commitmentScrolled) setCommitmentScrolled(true);
                }}
                onScroll={({ nativeEvent }) => {
                  const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                  const reached = layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
                  if (reached && !commitmentScrolled) setCommitmentScrolled(true);
                }}
                scrollEventThrottle={100}
              >
                <Text style={s.documentBody}>{COMMITMENT_TEXT}</Text>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>

            {/* بيانات الممثل */}
            <View
              style={s.signatureBox}
              onLayout={(e) => { commitmentSectionYRef.current = e.nativeEvent.layout.y; }}
            >
              <Text style={s.signatureTitle}>بيانات الموقِّع</Text>
              {[
                { k: "الاسم", v: repName },
                { k: "الصفة", v: repTitle },
                { k: "المؤسسة", v: instName },
                { k: "الرقم الوطني", v: repNationalId.length > 4 ? `****${repNationalId.slice(-4)}` : "****" },
                { k: "تاريخ التوقيع", v: new Date().toLocaleDateString("ar-SD") },
                { k: "رقم الإصدار", v: COMMITMENT_VERSION },
              ].map(r => (
                <View key={r.k} style={s.sigRow}>
                  <Text style={s.sigVal}>{r.v}</Text>
                  <Text style={s.sigKey}>{r.k}</Text>
                </View>
              ))}

              <View style={s.signLine}>
                <Text style={s.signLineText}>التوقيع الإلكتروني</Text>
                <Text style={s.signLineVal}>✦ {repName} ✦</Text>
              </View>
            </View>

            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={18} color={Colors.accent} />
              <Text style={s.warningText}>
                بالضغط على "أوقّع وأرسل الطلب" فإنك تُقرّ بقراءة وقبول جميع بنود العهد بما فيها بند التعويض وإصلاح الضرر.
                يُعدّ هذا التوقيع ملزِماً قانونياً ومعنوياً.
              </Text>
            </View>
          </Animated.View>
        )}

        {/* ══════════════════ STEP 6: التأكيد والإجراءات ══════════════════ */}
        {step === 6 && (
          <Animated.View entering={FadeInUp.springify()} style={{ gap: 20, alignItems: "center", paddingTop: 20 }}>
            <Animated.View entering={ZoomIn.delay(200).springify()}>
              <LinearGradient colors={[Colors.primary, Colors.primary + "CC"]} style={s.successIcon}>
                <Ionicons name="checkmark" size={40} color="#fff" />
              </LinearGradient>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).springify()} style={{ alignItems: "center", gap: 8 }}>
              <Text style={s.successTitle}>تم تقديم طلب الانضمام بنجاح!</Text>
              <Text style={s.successSub}>رقم الطلب: #{appId ?? "—"}</Text>
              <Text style={s.successDesc}>
                سيراجع فريق حصاحيصاوي طلبك خلال ٣–٥ أيام عمل. بعد الموافقة ستتمكن من تحميل عقد الانضمام الرسمي وتوقيعه.
              </Text>
            </Animated.View>

            {/* بطاقة حالة الطلب */}
            <Animated.View entering={FadeInDown.delay(500).springify()} style={{ width: "100%" }}>
              <View style={s.statusCard}>
                <View style={s.statusCardTop}>
                  <Text style={s.statusCardTitle}>حالة طلب الانضمام</Text>
                  <TouchableOpacity onPress={checkAppStatus} disabled={checkingStatus} style={s.refreshBtn}>
                    {checkingStatus
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Ionicons name="refresh" size={18} color={Colors.primary} />
                    }
                  </TouchableOpacity>
                </View>
                <View style={s.statusBadgeRow}>
                  {appStatus === "pending" && (
                    <View style={[s.statusBadge, { backgroundColor: Colors.accent + "25", borderColor: Colors.accent + "60" }]}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={Colors.accent} />
                      <Text style={[s.statusBadgeText, { color: Colors.accent }]}>قيد المراجعة</Text>
                    </View>
                  )}
                  {appStatus === "under_review" && (
                    <View style={[s.statusBadge, { backgroundColor: Colors.cyber + "25", borderColor: Colors.cyber + "60" }]}>
                      <MaterialCommunityIcons name="eye-check-outline" size={16} color={Colors.cyber} />
                      <Text style={[s.statusBadgeText, { color: Colors.cyber }]}>تحت المراجعة</Text>
                    </View>
                  )}
                  {appStatus === "approved" && (
                    <View style={[s.statusBadge, { backgroundColor: Colors.primary + "25", borderColor: Colors.primary + "60" }]}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      <Text style={[s.statusBadgeText, { color: Colors.primary }]}>تمت الموافقة ✓</Text>
                    </View>
                  )}
                  {appStatus === "rejected" && (
                    <View style={[s.statusBadge, { backgroundColor: Colors.danger + "25", borderColor: Colors.danger + "60" }]}>
                      <Ionicons name="close-circle" size={16} color={Colors.danger} />
                      <Text style={[s.statusBadgeText, { color: Colors.danger }]}>مرفوض</Text>
                    </View>
                  )}
                </View>
                {appStatus !== "approved" && (
                  <Text style={s.statusHint}>
                    اضغط على زر التحديث للاطلاع على آخر حالة طلبك
                  </Text>
                )}
              </View>
            </Animated.View>

            {/* إجراءات العقد */}
            <Animated.View entering={FadeInDown.delay(650).springify()} style={{ width: "100%", gap: 12 }}>
              <Text style={s.contractActionsTitle}>إجراءات عقد الانضمام الرسمي</Text>

              {/* تحميل العقد */}
              <TouchableOpacity
                onPress={appStatus === "approved" ? downloadContract : () => Alert.alert("غير متاح بعد", "ستتمكن من تحميل العقد بعد الموافقة على طلبك")}
                style={[s.contractActionBtn, appStatus !== "approved" && s.contractActionBtnDisabled]}
                activeOpacity={0.8}
              >
                <View style={[s.contractActionIcon, { backgroundColor: appStatus === "approved" ? Colors.primary + "20" : Colors.divider }]}>
                  <MaterialCommunityIcons name="download-circle-outline" size={24} color={appStatus === "approved" ? Colors.primary : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.contractActionTitle, appStatus !== "approved" && { color: Colors.textMuted }]}>تحميل العقد الرسمي (PDF)</Text>
                  <Text style={s.contractActionSub}>{appStatus === "approved" ? "اضغط لتحميل عقد الانضمام لملئه وتوقيعه" : "متاح بعد الموافقة على الطلب"}</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color={appStatus === "approved" ? Colors.textSecondary : Colors.divider} />
              </TouchableOpacity>

              {/* إرسال عبر واتساب */}
              <TouchableOpacity
                onPress={appStatus === "approved" ? sendViaWhatsApp : () => Alert.alert("غير متاح بعد", "ستتمكن من إرسال العقد الموقع بعد الموافقة")}
                style={[s.contractActionBtn, appStatus !== "approved" && s.contractActionBtnDisabled]}
                activeOpacity={0.8}
              >
                <View style={[s.contractActionIcon, { backgroundColor: appStatus === "approved" ? "#25D36620" : Colors.divider }]}>
                  <MaterialCommunityIcons name="whatsapp" size={24} color={appStatus === "approved" ? "#25D366" : Colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.contractActionTitle, appStatus !== "approved" && { color: Colors.textMuted }]}>إرسال العقد عبر واتساب</Text>
                  <Text style={s.contractActionSub}>{appStatus === "approved" ? `إرسال العقد الموقع إلى: ${contractWhatsapp}` : "متاح بعد الموافقة على الطلب"}</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color={appStatus === "approved" ? Colors.textSecondary : Colors.divider} />
              </TouchableOpacity>

              {/* رفع العقد الموقع */}
              <TouchableOpacity
                onPress={uploadSignedContract}
                style={[s.contractActionBtn, appStatus !== "approved" && s.contractActionBtnDisabled]}
                disabled={uploadingSignedContract}
                activeOpacity={0.8}
              >
                <View style={[s.contractActionIcon, { backgroundColor: appStatus === "approved" ? Colors.accent + "20" : Colors.divider }]}>
                  {uploadingSignedContract
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <MaterialCommunityIcons name="cloud-upload-outline" size={24} color={appStatus === "approved" ? Colors.accent : Colors.textMuted} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.contractActionTitle, appStatus !== "approved" && { color: Colors.textMuted }]}>
                    {signedContractUrl ? "تم رفع العقد الموقع ✓" : "رفع العقد بعد التوقيع"}
                  </Text>
                  <Text style={s.contractActionSub}>
                    {signedContractUrl
                      ? "يمكنك رفع نسخة محدّثة"
                      : appStatus === "approved"
                        ? "ارفع صورة أو صورة مسح ضوئي للعقد الموقع"
                        : "متاح بعد الموافقة على الطلب"
                    }
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={18} color={appStatus === "approved" ? Colors.textSecondary : Colors.divider} />
              </TouchableOpacity>
            </Animated.View>

            {/* وثيقة الاستلام */}
            <Animated.View entering={FadeInDown.delay(750).springify()} style={{ width: "100%" }}>
              <View style={s.documentCard}>
                <View style={s.documentStamp}>
                  <MaterialCommunityIcons name="seal-variant" size={40} color={Colors.primary + "60"} />
                </View>
                <Text style={s.documentHeader}>منصة حصاحيصاوي</Text>
                <Text style={s.documentSubHeader}>إشعار استلام طلب الانضمام</Text>
                <Text style={s.receiptNo}>رقم الطلب: #{appId ?? "—"}</Text>
                <View style={s.documentDivider} />
                {[
                  { k: "المؤسسة",           v: instName },
                  { k: "النوع",              v: instTypeObj?.label || instType },
                  { k: "الممثل الرسمي",      v: repName },
                  { k: "الصفة",              v: repTitle },
                  { k: "الخدمات المحددة",    v: `${selectedServices.length} خدمة` },
                  { k: "تاريخ التقديم",      v: new Date().toLocaleDateString("ar-SD") },
                  { k: "صورة الهوية",        v: repPhotoUrl ? "مرفقة ✓" : repPhotoUri ? "محفوظة (سترفع مع الطلب)" : "غير مرفقة" },
                  { k: "إصدار العهد",        v: COMMITMENT_VERSION },
                ].map(r => (
                  <View key={r.k} style={s.sigRow}>
                    <Text style={s.sigVal}>{r.v}</Text>
                    <Text style={s.sigKey}>{r.k}</Text>
                  </View>
                ))}
                <View style={[s.documentDivider, { marginTop: 8 }]} />
                <Text style={s.documentFooter}>
                  وثيقة استلام رسمية — الإصدار {COMMITMENT_VERSION} — {COMMITMENT_DATE}
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(900).springify()} style={{ width: "100%", gap: 12 }}>
              <TouchableOpacity onPress={() => router.back()}>
                <LinearGradient colors={[Colors.primary, Colors.primary + "CC"]} style={s.doneBtn}>
                  <Ionicons name="home-outline" size={20} color="#fff" />
                  <Text style={s.doneBtnText}>العودة للرئيسية</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Bottom Nav Bar ── */}
      {step < 6 && (
        <Animated.View entering={FadeInUp.delay(100).springify()} style={[s.navBar, { paddingBottom: insets.bottom + 12 }]}>
          {step > 1 ? (
            <TouchableOpacity style={s.navBackBtn} onPress={goBack}>
              <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
              <Text style={s.navBackText}>السابق</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}

          {step < 5 ? (
            <TouchableOpacity style={{ flex: 2 }} onPress={goNext}>
              <LinearGradient colors={[Colors.primary, Colors.primary + "CC"]} style={s.navNextBtn}>
                <Text style={s.navNextText}>التالي</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 2 }} onPress={handleSubmit} disabled={submitting || !commitmentScrolled}>
              <LinearGradient
                colors={commitmentScrolled ? [Colors.danger, Colors.danger + "CC"] : [Colors.textMuted, Colors.textMuted]}
                style={s.navNextBtn}
              >
                <MaterialCommunityIcons name="draw-pen" size={18} color="#fff" />
                <Text style={s.navNextText}>{submitting ? "جارٍ الإرسال..." : "أوقِّع وأرسل الطلب"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════
const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.cardBg, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.divider },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: "center", alignItems: "center" },

  progressRow: { flexDirection: "row", alignItems: "flex-start", gap: 0, marginBottom: 4 },
  progressItem: { alignItems: "center", gap: 4, flex: 0 },
  progressDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.cardBg,
    borderWidth: 2, borderColor: Colors.divider, justifyContent: "center", alignItems: "center",
  },
  progressActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  progressDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  progressNum: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  progressLabel: { fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.textMuted, textAlign: "center", maxWidth: 50 },
  progressLine: { flex: 1, height: 2, backgroundColor: Colors.divider, marginTop: 13, marginHorizontal: 4 },

  stepHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 50, height: 50, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  stepSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: {
    width: "48%", alignItems: "center", justifyContent: "center", gap: 6,
    padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider,
    backgroundColor: Colors.cardBg,
  },
  typeCardText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "center" },

  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  catChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: Colors.divider },
  dividerText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },

  selectedCount: {
    flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14,
    padding: 12, justifyContent: "center",
  },
  selectedCountText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },

  serviceCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  serviceIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: Colors.cardBg + "80", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.divider },
  serviceLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  serviceCat: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.divider, justifyContent: "center", alignItems: "center" },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  repNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#9B59B6" + "30" },
  repNoteText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  summaryBox: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, gap: 4,
  },
  summaryTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.primary, textAlign: "right", marginBottom: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  summaryKey: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  summaryVal: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right", marginRight: 12 },
  summaryDivider: { height: 1, backgroundColor: Colors.divider },

  readNote: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.danger + "35" },
  readNoteText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.danger, flex: 1, textAlign: "right" },

  documentCard: {
    backgroundColor: Colors.cardBg, borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: Colors.primary + "35", alignItems: "center", gap: 8,
  },
  documentStamp: { marginBottom: 4 },
  documentHeader: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary, textAlign: "center" },
  documentSubHeader: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  receiptNo: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.accent, textAlign: "center" },
  documentDivider: { width: "100%", height: 1, backgroundColor: Colors.primary + "30", marginVertical: 4 },
  documentScroll: { maxHeight: 340, width: "100%" },
  documentBody: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary,
    textAlign: "right", lineHeight: 26, writingDirection: "rtl", width: "100%",
  },
  documentFooter: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    textAlign: "center", lineHeight: 20, marginTop: 4,
  },

  signatureBox: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.primary + "40", gap: 4,
  },
  signatureTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.primary, textAlign: "right", marginBottom: 6 },
  sigRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sigKey: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, minWidth: 90 },
  sigVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  signLine: { marginTop: 12, alignItems: "center", gap: 4 },
  signLineText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  signLineVal: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.primary },

  warningBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.accent + "15", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "35",
  },
  warningText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },

  successIcon: { width: 90, height: 90, borderRadius: 45, justifyContent: "center", alignItems: "center" },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "center" },
  successSub: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.accent },
  successDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 24, paddingHorizontal: 20 },

  doneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  doneBtnText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },

  navBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  navBackBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  navBackText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  navNextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  navNextText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // صورة هوية الممثل
  photoPicker: {
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, borderStyle: "dashed",
    backgroundColor: Colors.cardBg, overflow: "hidden",
  },
  photoPickerDone: { borderColor: Colors.primary, borderStyle: "solid" },
  photoPickerFailed: { borderColor: Colors.danger, borderStyle: "solid" },
  photoPickerEmpty: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  photoPickerIcon: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: Colors.bg,
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.divider,
  },
  photoPickerTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  photoPickerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  photoPreview: { width: 72, height: 48, borderRadius: 10, backgroundColor: Colors.divider },
  photoPickerDoneText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },
  photoPickerChange: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  photoNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 4 },

  // معاينة العقد
  contractSection: { width: "100%", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  contractSectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  contractBody: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  contractParties: { flexDirection: "row", gap: 0 },
  contractParty: { flex: 1, gap: 4, padding: 10, borderRadius: 10, backgroundColor: Colors.bg },
  contractPartyDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  contractPartyTitle: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary, textAlign: "center", marginBottom: 4 },
  contractPartyText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  contractBullet: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  contractBulletDot: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary, marginTop: 2 },
  contractBulletText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },
  contractPenalties: { flexDirection: "row", gap: 8 },
  penaltyItem: { flex: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 10, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  penaltyIcon: { fontSize: 18 },
  penaltyTitle: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textPrimary, textAlign: "center" },
  penaltyDesc: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", lineHeight: 15 },
  contractInfoGrid: { borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.cyber + "25", backgroundColor: Colors.bg },
  contractInfoCell: { padding: 12, gap: 4 },
  contractInfoLabel: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.cyber, textAlign: "right" },
  contractInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },

  // بطاقة حالة الطلب
  statusCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  statusCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  refreshBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "18", justifyContent: "center", alignItems: "center" },
  statusBadgeRow: { flexDirection: "row" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statusBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  statusHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  // أزرار إجراءات العقد
  contractActionsTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  contractActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg,
  },
  contractActionBtnDisabled: { opacity: 0.55 },
  contractActionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  contractActionTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  contractActionSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
});

const fi = StyleSheet.create({
  block: { gap: 6 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  row: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden",
  },
  rowMulti: { alignItems: "flex-start" },
  input: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15,
    color: Colors.textPrimary, paddingVertical: 13, paddingHorizontal: 14,
  },
  inputMulti: {
    minHeight: 110, paddingVertical: 13, textAlignVertical: "top", lineHeight: 24,
  },
});
