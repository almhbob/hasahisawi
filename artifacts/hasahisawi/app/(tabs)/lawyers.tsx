import { withRTLScreen } from "@/components/RTLScope";
import { trackOpen } from "@/lib/views";
import ViewCount from "@/components/ViewCount";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Alert, Platform, ActivityIndicator, Pressable, Linking,
  KeyboardAvoidingView, Image,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { fetch } from "@/lib/net-fetch";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { usePricingVisible } from "@/lib/feature-flags-context";
import { uploadFile } from "@/lib/firebase/storage";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";
import { paperDocument, printPaper, esc, blank } from "@/lib/paper";
import { notify } from "@/lib/xplatform";


// ─── Types ────────────────────────────────────────────────────────────────────
type Lawyer = {
  id: number; full_name: string; title: string; specialties: string;
  bio: string; phone: string; whatsapp: string; email: string; office_addr: string;
  district: string; bar_number: string; experience_y: number; languages: string;
  consult_fee: string; is_featured: boolean; is_verified: boolean;
  avg_rating: number; review_count: number; entity_id: number | null;
  photo_url?: string;
  // بيانات الاشتراك
  plan_name?: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  has_priority?: boolean; has_unlimited_contacts?: boolean; plan_monthly_contacts?: number;
};
type LawyerService = { id: number; lawyer_id: number; title: string; description: string; price_text: string; duration: string };
type LawyerReview  = { id: number; rating: number; comment: string | null; user_name: string; created_at: string };
type LawyerAd      = { id: number; title: string; body: string; cta_text: string; cta_phone: string; banner_color: string; lawyer_name?: string };
type LegalForm     = { id: number; title: string; category: string; description: string; is_official: boolean };
type LegalFormFull = LegalForm & { content_html: string };
type Contract      = { id: number; lawyer_id: number; lawyer_name: string; lawyer_phone: string; service_title: string; status: string; contract_no: string; created_at: string; preferred_date: string | null; details: string };
type MyApp         = { id: number; full_name: string; status: "pending"|"approved"|"rejected"; admin_note: string; lawyer_id: number | null; created_at: string; reviewed_at?: string };

// ─── تخصصات (مجموعات بكلمات مفتاحية؛ التصفية تتم على بيانات الخادم الحقيقية) ───
type SpecKey = "family" | "realestate" | "contracts" | "criminal" | "labor" | "commercial" | "arbitration";
const SPEC_GROUPS: { key: SpecKey; label: string; kw: string[] }[] = [
  { key: "family",      label: "أحوال شخصية",  kw: ["أحوال", "أسرة", "أسري", "نفقة", "حضانة", "ميراث", "مواريث", "تركات", "طلاق", "زواج"] },
  { key: "realestate",  label: "عقارات",        kw: ["عقار", "إيجار", "أراض", "أراضي"] },
  { key: "contracts",   label: "عقود وتوثيق",   kw: ["عقود", "عقد", "توثيق", "صياغة"] },
  { key: "criminal",    label: "جنائية",        kw: ["جنائ", "جزائ", "مرافعات", "طعون"] },
  { key: "labor",       label: "عمل وعمّال",    kw: ["عمال", "عمالي", "عمل"] },
  { key: "commercial",  label: "تجارية وشركات", kw: ["تجار", "شركات", "شركة", "استثمار", "بنوك", "مصارف"] },
  { key: "arbitration", label: "تحكيم ونزاعات", kw: ["تحكيم", "نزاع", "وساطة", "تسوية", "محكم"] },
];
const norm = (t: string) => String(t || "")
  .replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
function inGroup(lw: { specialties: string; title: string }, key: SpecKey): boolean {
  const g = SPEC_GROUPS.find(x => x.key === key);
  if (!g) return true;
  const hay = norm(`${lw.specialties} ${lw.title}`);
  return g.kw.some(k => hay.includes(norm(k)));
}
function splitSpecs(t: string): string[] {
  return String(t || "").split(/[,،\/؛;|]+/).map(x => x.trim()).filter(Boolean);
}
function initials(name: string): string {
  const parts = String(name || "").replace(/^(د\.|أ\.|م\.|الأستاذ|الأستاذة|الدكتور)\s*/, "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p.replace(/^ال/, "").charAt(0)).join(" ") || "م";
}

type Tile = { title: string; icon: string; action: SpecKey | "rights" | "forms" };
const LEGAL_SERVICES: Tile[] = [
  { title: "أحوال شخصية وأسرة", icon: "account-group-outline", action: "family" },
  { title: "عقارات وإيجارات", icon: "home-city-outline", action: "realestate" },
  { title: "صياغة العقود", icon: "file-sign", action: "contracts" },
  { title: "قضايا جنائية", icon: "gavel", action: "criminal" },
  { title: "العمل والعمّال", icon: "briefcase-account-outline", action: "labor" },
  { title: "شركات وتجارة", icon: "domain", action: "commercial" },
  { title: "تحكيم وفضّ نزاعات", icon: "scale-balance", action: "arbitration" },
  { title: "اعرف حقوقك", icon: "shield-check-outline", action: "rights" },
  { title: "استمارات جاهزة", icon: "file-document-multiple-outline", action: "forms" },
];

// ─── ألوان القسم القانوني (كحلي + ذهبي) مع بدائل للوضع الداكن ───
// محتوى النوافذ (Modal) يُرسم خارج شجرة الشاشة على الويب فيفقد اتجاه RTL؛ يُمرَّر كنمط مباشر لأن StyleSheet على الويب يتجاهل direction
const RTL = { direction: "rtl" } as const;
const DARK = Colors.isDark;
const NAVY = "#14213D";
const P = {
  soft:       DARK ? Colors.surface3 : "#FBF8F1",
  softBorder: DARK ? Colors.borderStrong : "#E6DCC5",
  iconBg:     DARK ? "#26352E" : "#EFE7D3",
  ink:        DARK ? "#E3C27A" : NAVY,
  gold:       DARK ? "#E3C27A" : "#7A5A12",
  activeBg:   DARK ? "#E3C27A" : NAVY,
  activeFg:   DARK ? NAVY : "#FFFFFF",
  btn:        DARK ? "#2B3D66" : NAVY,
  paper:      DARK ? Colors.surface3 : "#FFFDF8",
  paperBorder: DARK ? Colors.border : "#E7DFCB",
  skeleton:   DARK ? "rgba(255,255,255,0.08)" : "rgba(20,33,61,0.07)",
  green:      DARK ? "#6EE7B7" : "#047857",
  greenBtn:   "#047857",
  wa:         DARK ? "#4ADE80" : "#0F7B4B",
  star:       DARK ? "#FBBF24" : "#B45309",
  starOff:    DARK ? "rgba(255,255,255,0.25)" : "#CFC6B2",
  amber:      DARK ? "#FBBF24" : "#B45309",
  blue:       DARK ? "#93C5FD" : "#1D4ED8",
  red:        DARK ? "#FCA5A5" : "#B91C1C",
};

const RIGHTS_GUIDE: { title: string; icon: string; points: string[] }[] = [
  { title: "قبل توقيع أي عقد", icon: "file-sign", points: ["اقرأ جميع البنود كاملة قبل التوقيع، ولا توقّع على ورقة فيها فراغات.", "تأكّد من هوية الطرف الآخر وصفته في التعاقد.", "احصل على نسخة موقّعة من العقد واحتفظ بها في مكان آمن.", "إذا كان المبلغ كبيراً فاستشر محامياً قبل التوقيع."] },
  { title: "عقود الإيجار", icon: "home-outline", points: ["وثّق الإيجار كتابةً مع تحديد المدة والأجرة وموعد الدفع.", "اتفق كتابةً على مبلغ التأمين وشروط استرداده.", "احتفظ بإيصالات كل دفعة، ويفضَّل التحويل البنكي.", "سجّل حالة العقار عند الاستلام بالصور."] },
  { title: "الشيكات والديون", icon: "cash-check", points: ["لا تحرّر شيكاً بلا رصيد كافٍ — قد يعرّضك ذلك لمساءلة قانونية.", "احتفظ بصورة من أي شيك تحرّره أو تستلمه.", "وثّق أي دين بإقرار مكتوب وموقّع وبحضور شهود."] },
  { title: "حقوق العامل", icon: "briefcase-outline", points: ["احتفظ بنسخة من عقد العمل وكشوف المرتب.", "لا توقّع على مخالصة نهائية قبل التأكد من استلام كامل مستحقاتك.", "وثّق الإنذارات والخطابات الرسمية بتواريخها."] },
  { title: "الميراث والتركات", icon: "family-tree", points: ["ابدأ باستخراج الإعلام الشرعي من المحكمة المختصة قبل التصرف في التركة.", "حصر أموال التركة وديونها كتابةً بحضور الورثة.", "النزاع بين الورثة يُحسم ودياً أو أمام المحكمة — استشر محامياً مختصاً."] },
  { title: "عند الاستدعاء أو القبض", icon: "shield-account-outline", points: ["من حقك معرفة سبب الاستدعاء أو القبض.", "من حقك الاستعانة بمحامٍ والتواصل مع أسرتك.", "لا توقّع على أقوال لم تقرأها أو لم تفهمها."] },
];


// ─── Helpers ──────────────────────────────────────────────────────────────────
function apiBase() { return getApiUrl(); }
async function apiFetch(path: string, opts?: any) {
  const base = apiBase();
  if (!base) throw new Error("API not configured");
  const url = new URL(path, base).toString();
  return fetch(url, opts);
}
async function getDeviceId(): Promise<string> {
  let did = await AsyncStorage.getItem("device_id_v1");
  if (!did) { did = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`; await AsyncStorage.setItem("device_id_v1", did); }
  return did;
}

const STATUS_AR: Record<string,{label:string;color:string}> = {
  pending:     { label: "قيد المراجعة", color: P.amber },
  accepted:    { label: "مقبول",         color: P.blue },
  in_progress: { label: "قيد التنفيذ",  color: Colors.text },
  completed:   { label: "مكتمل",         color: P.green },
  rejected:    { label: "مرفوض",         color: P.red },
  cancelled:   { label: "ملغي",          color: Colors.textSecondary },
  approved:    { label: "مقبول",         color: P.green },
};

// ─── Star ─────────────────────────────────────────────────────────────────────
function Stars({ value, size = 13, color = P.star }: { value: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1,2,3,4,5].map(s => (
        <Ionicons key={s} name={s <= Math.round(value) ? "star" : "star-outline"} size={size}
          color={s <= Math.round(value) ? color : P.starOff} />
      ))}
    </View>
  );
}
function StarPicker({ value, onChange }: { value: number; onChange: (v:number)=>void }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
      {[1,2,3,4,5].map(s => (
        <Pressable key={s} onPress={() => { onChange(s); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
          accessibilityRole="button" accessibilityLabel={`${s} من 5 نجوم`} hitSlop={4}>
          <Ionicons name={s <= value ? "star" : "star-outline"} size={42} color={s <= value ? P.star : P.starOff} />
        </Pressable>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//                                MAIN
// ═══════════════════════════════════════════════════════════════════════════
function LawyersScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const showPricing = usePricingVisible();
  const listRef = useRef<FlatList<Lawyer>>(null);
  const [listTopY, setListTopY] = useState(0);
  const [tab, setTab] = useState<"directory" | "forms" | "contracts">("directory");

  // shared
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  // directory
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [ads, setAds] = useState<LawyerAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SpecKey | "all">("all");
  const [plans, setPlans] = useState<{ id: number; name: string; name_ar: string; price_label: string; color: string }[]>([]);
  const [selected, setSelected] = useState<Lawyer | null>(null);

  // detail
  const [services, setServices] = useState<LawyerService[]>([]);
  const [reviews, setReviews]   = useState<LawyerReview[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // contract modal
  const [contractFor, setContractFor] = useState<LawyerService | null>(null);
  const [reqLawyer, setReqLawyer] = useState<Lawyer | null>(null);
  const [contract, setContract] = useState({ name: user?.name || "", phone: user?.phone || "", details: "", date: "" });
  const [submitting, setSubmitting] = useState(false);

  // rate modal
  const [rateOpen, setRateOpen] = useState(false);
  const [rateValue, setRateValue] = useState(5);
  const [rateComment, setRateComment] = useState("");

  // forms
  const [rightsOpen, setRightsOpen] = useState(false);
  const [forms, setForms] = useState<LegalForm[]>([]);
  const [formQ, setFormQ] = useState("");
  const [formCat, setFormCat] = useState("الكل");
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState(false);

  // my contracts
  const [myContracts, setMyContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  // lawyer join application
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [myApps, setMyApps] = useState<MyApp[]>([]);
  const EMPTY_APP = {
    full_name: user?.name || "", title: "محامي", phone: user?.phone || "", whatsapp: "",
    email: "", bar_number: "", experience_y: "", specialties: "",
    bio: "", office_addr: "", district: "", consult_fee: "",
    bar_card_url: "", agree: false,
  };
  const [appForm, setAppForm] = useState<typeof EMPTY_APP>(EMPTY_APP);
  const [barCardUploading, setBarCardUploading] = useState(false);
  const [barCardFileName, setBarCardFileName] = useState<string | null>(null);
  const [barCardUploadFailed, setBarCardUploadFailed] = useState(false);
  const [barCardUploadError, setBarCardUploadError] = useState<string | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDirectory = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [lr, ar] = await Promise.all([apiFetch(`/api/lawyers`), apiFetch(`/api/lawyer-ads`)]);
      if (!lr.ok) throw new Error(String(lr.status));
      const list = await lr.json();
      setLawyers(Array.isArray(list) ? list : []);
      if (ar.ok) { const a = await ar.json(); setAds(Array.isArray(a) ? a : []); }
    } catch (e) { console.warn(e); setLoadError(true); }
    finally { setLoading(false); }
  }, []);

  // الخطط تُجلب من الخادم فقط عند تفعيل عرض الأسعار من لوحة الإدارة
  useEffect(() => {
    if (!showPricing) { setPlans([]); return; }
    apiFetch(`/api/subscription-plans`).then(r => (r.ok ? r.json() : [])).then(d => setPlans(Array.isArray(d) ? d : [])).catch(() => {});
  }, [showPricing]);

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return lawyers.filter(l =>
      (filter === "all" || inGroup(l, filter)) &&
      (!q || norm(`${l.full_name} ${l.title} ${l.specialties} ${l.district} ${l.office_addr}`).includes(q)));
  }, [lawyers, filter, search]);
  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of SPEC_GROUPS) c[g.key] = lawyers.filter(l => inGroup(l, g.key)).length;
    return c;
  }, [lawyers]);

  const pickGroup = (key: SpecKey | "all") => {
    setFilter(f => (f === key ? "all" : key));
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setTimeout(() => listRef.current?.scrollToOffset({ offset: Math.max(0, listTopY - 8), animated: true }), 60);
  };

  const loadForms = useCallback(async () => {
    setFormsLoading(true); setFormsError(false);
    try { const r = await apiFetch(`/api/legal-forms`); if (!r.ok) throw new Error(); const d = await r.json(); setForms(Array.isArray(d) ? d : []); }
    catch { setFormsError(true); } finally { setFormsLoading(false); }
  }, []);

  const loadMyContracts = useCallback(async () => {
    if (!deviceId && !token) return;
    setContractsLoading(true);
    try {
      const [cr, ar] = await Promise.all([
        apiFetch(`/api/my-lawyer-contracts?device_id=${encodeURIComponent(deviceId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        apiFetch(`/api/lawyer-applications/mine?device_id=${encodeURIComponent(deviceId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
      ]);
      if (cr.ok) setMyContracts(await cr.json());
      if (ar.ok) setMyApps(await ar.json());
    } catch {} finally { setContractsLoading(false); }
  }, [deviceId, token]);

  const pickBarCardFile = async () => {
    try {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const picked = result.assets[0];
      const safeName = (picked.name || `lawyer_bar_card_${Date.now()}.jpg`)
        .replace(/[\/]+/g, "_")
        .replace(/[^p{L}p{N}._-]+/gu, "_")
        .slice(0, 120) || `lawyer_bar_card_${Date.now()}.jpg`;

      setBarCardFileName(safeName);
      setBarCardUploading(true);
      setBarCardUploadFailed(false);
      setBarCardUploadError(null);

      const key = (deviceId || `guest_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const url = await uploadFile(`lawyer-applications/${key}/bar-card/${safeName}`, picked.uri, {
        fileName: safeName,
        mimeType: picked.mimeType || null,
      });
      setAppForm(f => ({ ...f, bar_card_url: url }));
      setBarCardUploadFailed(false);
      setBarCardUploadError(null);
    } catch (e: any) {
      const msg = e?.message || "تعذر رفع ملف الهوية حالياً";
      setBarCardUploadFailed(true);
      setBarCardUploadError(msg);
      Alert.alert("تعذر الرفع", "يمكنك إرسال الطلب الآن وسيظهر للإدارة كمراجعة هوية يدوية.");
    } finally {
      setBarCardUploading(false);
    }
  };

  const submitJoinApplication = async () => {
    if (!appForm.full_name.trim() || !appForm.phone.trim() || !appForm.bar_number.trim() || !appForm.specialties.trim()) {
      Alert.alert("بيانات ناقصة", "الاسم والهاتف ورقم النقابة والتخصصات مطلوبة"); return;
    }
    if (!appForm.agree) {
      Alert.alert("شروط التعاقد", "يجب الموافقة على شروط التعاقد للمتابعة"); return;
    }
    setJoinSubmitting(true);
    try {
      const r = await apiFetch(`/api/lawyer-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...appForm,
          experience_y: Number(appForm.experience_y) || 0,
          agree_terms: appForm.agree,
          device_id: deviceId,
          bar_card_upload_status: appForm.bar_card_url ? "uploaded" : "pending_manual_review",
          bar_card_upload_note: appForm.bar_card_url ? "" : "تعذر رفع صورة الهوية/كارنيه النقابة من جهاز المستخدم؛ يرجى مراجعة الطلب يدوياً.",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل الإرسال");
      Alert.alert("تم استلام طلبك", "ستتم مراجعة طلب التعاقد من قبل الإدارة. تابع الحالة من تبويب \"تعاقداتي\".");
      setJoinOpen(false); setAppForm(EMPTY_APP); loadMyContracts();
      setTab("contracts");
    } catch (e: any) {
      Alert.alert("تعذّر إرسال الطلب", e?.message || "حاول لاحقاً");
    } finally { setJoinSubmitting(false); }
  };

  useFocusEffect(useCallback(() => { loadDirectory(); }, [loadDirectory]));
  // تعبئة نموذج الطلب من بيانات الحساب عند فتحه
  // نافذتان متداخلتان لا تعملان على iOS، لذا نغلق الملف أولاً ثم نفتح الطلب
  const openRequest = (svc: LawyerService, lw: Lawyer) => {
    setReqLawyer(lw);
    setContract(c => ({ ...c, name: c.name || user?.name || "", phone: c.phone || user?.phone || "" }));
    if (selected) { setSelected(null); setTimeout(() => setContractFor(svc), 350); }
    else setContractFor(svc);
  };
  const generalRequest = (lw: Lawyer): LawyerService => ({ id: 0, lawyer_id: lw.id, title: "طلب استشارة", description: "", price_text: "", duration: "" });
  const callLawyer = (phone?: string) => { if (phone) Linking.openURL(`tel:${phone}`).catch(() => {}); };
  const waLawyer = (wa?: string) => {
    const d = String(wa || "").replace(/\D/g, "");
    if (!d) return;
    const intl = d.startsWith("0") ? `249${d.slice(1)}` : d;
    Linking.openURL(`https://wa.me/${intl}`).catch(() => {});
  };
  useEffect(() => { if (tab === "forms")     loadForms();       }, [tab, loadForms]);
  useEffect(() => { if (tab === "contracts") loadMyContracts(); }, [tab, loadMyContracts]);

  const openLawyer = useCallback(async (lw: Lawyer) => {
    trackOpen("lawyer", String(lw.id));
    setSelected(lw); setDetailLoading(true);
    try {
      const r = await apiFetch(`/api/lawyers/${lw.id}`);
      if (r.ok) {
        const d = await r.json();
        setServices(d.services || []);
        setReviews(d.reviews || []);
      }
    } catch {} finally { setDetailLoading(false); }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const submitContract = async () => {
    const target = reqLawyer;
    if (!target) return;
    if (!contract.name.trim() || !contract.phone.trim()) {
      Alert.alert("بيانات ناقصة", "الرجاء إدخال الاسم ورقم الهاتف"); return;
    }
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/lawyers/${target.id}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          service_id: contractFor?.id,
          service_title: contractFor?.title || "تواصل عام",
          client_name: contract.name, client_phone: contract.phone,
          details: contract.details, preferred_date: contract.date || null,
          device_id: deviceId,
        }),
      });
      if (!r.ok) throw new Error();
      Alert.alert("تم إرسال الطلب", `سيتواصل معك المحامي قريباً.\nيمكنك متابعة الطلب من تبويب "تعاقداتي".`);
      setContractFor(null); setContract({ name: user?.name || "", phone: user?.phone || "", details: "", date: "" });
      loadMyContracts();
    } catch { Alert.alert("خطأ", "تعذّر إرسال الطلب — حاول لاحقاً"); }
    finally { setSubmitting(false); }
  };

  const submitRating = async () => {
    if (!selected) return;
    try {
      const r = await apiFetch(`/api/lawyers/${selected.id}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rating: rateValue, comment: rateComment, device_id: deviceId }),
      });
      if (!r.ok) throw new Error();
      Alert.alert("شكراً لك", "تم تسجيل تقييمك");
      setRateOpen(false); setRateComment(""); setRateValue(5);
      openLawyer(selected); // إعادة تحميل
      loadDirectory();
    } catch { Alert.alert("خطأ", "تعذّر إرسال التقييم"); }
  };

  // ── طباعة بطاقة المحامي ──
  const printLawyerCard = async (lw: Lawyer, svcs: LawyerService[]) => {
    const svcRows = svcs.map((sv, i) => `<tr><td>${i + 1}</td><td class="r"><b>${esc(sv.title)}</b>${sv.description ? `<br/><small>${esc(sv.description)}</small>` : ""}</td>${showPricing ? `<td>${esc(sv.price_text || "—")}</td>` : ""}<td>${esc(sv.duration || "—")}</td></tr>`).join("");
    const html = paperDocument({
      theme: "legal", title: lw.full_name, subtitle: `${lw.title}${lw.is_verified ? " · موثّق" : ""}`, ref: lw.bar_number ? `نقابة ${lw.bar_number}` : undefined,
      bodyHtml: `<div class="box kv">
          <div>التخصصات: <b>${esc(lw.specialties)}</b></div><div>الخبرة: <b>${lw.experience_y} سنة</b></div>
          <div>الهاتف: <b>${esc(lw.phone || "—")}</b></div><div>العنوان: <b>${esc(lw.office_addr || lw.district || "—")}</b></div>
          <div>اللغات: <b>${esc(lw.languages || "—")}</b></div>${showPricing ? `<div>رسوم الاستشارة: <b>${esc(lw.consult_fee || "—")}</b></div>` : ""}
          ${lw.review_count > 0 ? `<div>التقييم: <b>${Number(lw.avg_rating || 0).toFixed(1)} / 5 (${lw.review_count} مراجعة)</b></div>` : ""}</div>
        ${lw.bio ? `<h2>نبذة</h2><p>${esc(lw.bio)}</p>` : ""}
        ${svcs.length ? `<h2>الخدمات القانونية</h2><table><thead><tr><th>#</th><th class="r">الخدمة</th>${showPricing ? "<th>الأتعاب</th>" : ""}<th>المدة</th></tr></thead><tbody>${svcRows}</tbody></table>` : ""}`,
    });
    try { await printPaper(html, `بطاقة ${lw.full_name}`); } catch (e: any) { notify("تعذّرت الطباعة", e?.message || ""); }
  };

  // ── طباعة استمارة قانونية على ورق رسمي فاخر ──
  const [printingForm, setPrintingForm] = useState<number | null>(null);
  const printForm = async (id: number) => {
    setPrintingForm(id);
    try {
      const r = await apiFetch(`/api/legal-forms/${id}`);
      if (!r.ok) throw new Error("تعذّر تحميل الاستمارة");
      const f: LegalFormFull = await r.json();
      // نُزيل عنوان h1/h2 الأول إن كان يكرّر عنوان الاستمارة، والقالب يضيف عنواناً فاخراً.
      const body = String(f.content_html || "").replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/, (m) => (m.includes(f.title) ? "" : m));
      const html = paperDocument({
        theme: "legal", title: f.title, subtitle: `${f.category}${f.is_official ? " · نموذج معتمد" : ""}`,
        ref: `LF-${String(f.id).padStart(4, "0")}`,
        bodyHtml: `${f.description ? `<p style="color:#6b6253">${esc(f.description)}</p>` : ""}${body}
          <h2>بيانات مقدّم الاستمارة</h2><div class="grid">${blank("الاسم الرباعي")}${blank("الرقم الوطني")}${blank("رقم الهاتف")}${blank("العنوان")}</div>`,
        signatures: ["توقيع مقدّم الطلب", "توقيع المحامي / الشاهد", "الختم"],
        note: "هذه الاستمارة نموذج استرشادي. يُنصح بمراجعة محامٍ مرخّص قبل التوقيع أو تقديمها لأي جهة رسمية.",
      });
      await printPaper(html, f.title);
    } catch (e: any) { notify("تعذّرت الطباعة", e?.message || "حاول مرة أخرى"); }
    finally { setPrintingForm(null); }
  };

  // ── طباعة إيصال طلب خدمة ──
  const printContract = async (c: Contract) => {
    const status = STATUS_AR[c.status] || { label: c.status, color: Colors.textSecondary };
    const html = paperDocument({
      theme: "legal", title: "إيصال طلب خدمة قانونية", subtitle: c.service_title || "تواصل عام", ref: c.contract_no,
      bodyHtml: `<div class="box kv">
          <div>المحامي: <b>${esc(c.lawyer_name)}</b></div><div>هاتف المحامي: <b>${esc(c.lawyer_phone || "—")}</b></div>
          <div>تاريخ الطلب: <b>${new Date(c.created_at).toLocaleDateString("ar-SD")}</b></div><div>الموعد المطلوب: <b>${esc(c.preferred_date || "—")}</b></div>
          <div>الحالة: <span class="pill" style="color:${status.color}">${esc(status.label)}</span></div></div>
        ${c.details ? `<h2>تفاصيل الطلب</h2><p>${esc(c.details)}</p>` : ""}`,
      signatures: ["توقيع العميل", "توقيع المحامي"],
      note: "يُحتفظ بهذا الإيصال لمتابعة الطلب. المنصة وسيط تعريفي والعلاقة المهنية والأتعاب بين العميل والمحامي مباشرة.",
    });
    try { await printPaper(html, "إيصال طلب خدمة"); } catch (e: any) { notify("تعذّرت الطباعة", e?.message || ""); }
  };

  // ── طباعة عقد الانضمام (محامي ↔ تطبيق) ──
  // قبل الاعتماد: نموذج/مسودّة بعلامة مائية واضحة وبدون أي توثيق
  // بعد الاعتماد: عقد موثّق رسمياً بختم وتوقيع رقمي ورمز QR للتحقّق العام
  const printJoinContract = async (a: MyApp) => {
    try {
      const fr = await apiFetch(`/api/lawyer-applications/mine?device_id=${encodeURIComponent(deviceId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const list: any[] = fr.ok ? await fr.json() : [];
      const full = list.find(x => x.id === a.id) || a;
      const today = new Date();
      const dStr = today.toLocaleDateString("ar-SD", { year: "numeric", month: "long", day: "numeric" });
      const hijri = (() => {
        try { return new Intl.DateTimeFormat("ar-SD-u-ca-islamic-umalqura", { year: "numeric", month: "long", day: "numeric" }).format(today); }
        catch { return ""; }
      })();
      const isApproved = a.status === "approved";
      const contractNo = `LAW-${String(a.id).padStart(5, "0")}-${today.getFullYear()}`;
      // توقيع رقمي مختصر مستقل عن أي مكتبة (FNV-1a 32bit + base36)
      const fnv = (s: string) => {
        let h = 0x811c9dc5 >>> 0;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return h.toString(36).toUpperCase().padStart(7, "0");
      };
      const approvedAt = full.reviewed_at || full.created_at || today.toISOString();
      const sigPayload = `${a.id}|${full.full_name}|${full.bar_number||""}|${full.phone||""}|${approvedAt}|HSWAY-LEGAL-V1`;
      const digSig = `${fnv(sigPayload)}-${fnv(sigPayload.split("").reverse().join(""))}`;
      const verifyUrl = `${getApiUrl()}/api/lawyer-applications/verify/${encodeURIComponent(contractNo)}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(verifyUrl)}`;

      // ── ألوان وعناصر مشتركة ───────────────────────────────
      const TERMS = [
        ["موضوع العقد", "يلتزم الطرف الثاني بتقديم استشاراته وخدماته القانونية لمستخدمي المنصة وفق تخصصاته المُعلنة، ويلتزم الطرف الأول بعرض ملف الطرف الثاني وتسهيل وصول طالبي الخدمة إليه."],
        ["صحة البيانات", "يقرّ الطرف الثاني بصحة جميع البيانات والوثائق المقدّمة، ويتحمّل المسؤولية الكاملة شرعاً وقانوناً عن أي معلومة غير صحيحة أو منتحَلة."],
        ["الترخيص المهني", "يلتزم الطرف الثاني بأن يكون ترخيصه ساريَ المفعول طيلة فترة العقد، وعليه إخطار الإدارة فوراً بأي إيقاف أو تعليق صادر من نقابة المحامين."],
        ["الأخلاقيات المهنية", "يلتزم الطرف الثاني بالقواعد الأخلاقية لمهنة المحاماة، وبسرية بيانات موكّليه، وبعدم استخدام المنصة في أي نشاط مخالف للقانون أو الآداب العامة."],
        ["جودة الخدمة", "يلتزم الطرف الثاني بالرد على طلبات الخدمة في وقت معقول، وبإبلاغ المستخدم بحالة طلبه، وبتقديم الخدمة بالمستوى المهني المتعارف عليه."],
        ["الأتعاب", "يحقّ للطرف الثاني تحديد أتعابه واستلامها مباشرة من موكّليه، والمنصة ليست طرفاً في العلاقة المالية بين المحامي وموكّله إلا إذا اتُّفق على غير ذلك صراحة."],
        ["الإعلان والظهور", "يوافق الطرف الثاني على عرض اسمه وصورته وملفه التعريفي وتقييماته من قِبل المستخدمين بشكل علني داخل التطبيق وعلى منصاته الرسمية."],
        ["الشكاوى والتأديب", "يحقّ للطرف الأول إيقاف ملف الطرف الثاني مؤقتاً عند تلقّي أي شكوى موثّقة، ريثما يتمّ التحقّق منها، ولديه الحقّ في الإيقاف الدائم عند ثبوت المخالفة."],
        ["حق الانسحاب", "يحقّ للطرف الثاني طلب إخفاء ملفه أو حذفه نهائياً من المنصة في أي وقت بإشعار خطّي للإدارة، مع الالتزام بإكمال أي تعاقدات قائمة قبل الإخفاء."],
        ["الملكية الفكرية", "تظلّ الملكية الفكرية للمحتوى الذي يقدّمه كل طرف عائدةً لصاحبها، مع منح الطرف الثاني المنصةَ ترخيصاً غير حصري لعرض ملفه ضمن خدماتها."],
        ["تعديل الشروط", "يحقّ للطرف الأول تحديث شروط الخدمة بعد إشعار الطرف الثاني عبر التطبيق بمدة لا تقلّ عن (15) يوماً، ويُعدّ استمرار النشاط بعد المدة قبولاً ضمنياً."],
        ["فضّ النزاعات", "يُحلّ أيّ نزاع ينشأ عن هذا العقد ودّياً، فإذا تعذّر ذلك يُحال إلى الجهات القضائية المختصة في ولاية الجزيرة وفقاً لأحكام القانون السوداني."],
        ["سريان العقد", "يسري هذا العقد من تاريخ اعتماده من إدارة المنصة، ويستمرّ ساري المفعول حتى يتم إنهاؤه برغبة أحد الطرفين وفق البند (9)."],
      ];
      const termsHtml = TERMS.map(([t, b]) => `<li><b>${t}:</b> ${b}</li>`).join("");

      const partiesHtml = `
        <div class="parties">
          <div class="party">
            <h4>الطرف الأول — منصة التطبيق</h4>
            <div class="row"><b>الاسم:</b> تطبيق حصاحيصاوي</div>
            <div class="row"><b>المقر:</b> الحصاحيصا، ولاية الجزيرة، السودان</div>
            <div class="row"><b>القسم:</b> الإدارة القانونية</div>
            <div class="row"><b>الصفة:</b> الجهة المنظِّمة للخدمة</div>
          </div>
          <div class="party">
            <h4>الطرف الثاني — المحامي</h4>
            <div class="row"><b>الاسم:</b> ${full.full_name}</div>
            <div class="row"><b>المسمّى:</b> ${full.title || "محامي"}</div>
            <div class="row"><b>رقم النقابة:</b> ${full.bar_number || "—"}</div>
            <div class="row"><b>الخبرة:</b> ${full.experience_y || 0} سنة</div>
            <div class="row"><b>التخصصات:</b> ${full.specialties || "—"}</div>
            <div class="row"><b>الهاتف:</b> ${full.phone}</div>
            ${full.email ? `<div class="row"><b>البريد:</b> ${full.email}</div>` : ""}
            ${full.office_addr ? `<div class="row"><b>العنوان:</b> ${full.office_addr}</div>` : ""}
          </div>
        </div>`;

      const preamble = `
        <div class="preamble">
          إنه في يوم ${dStr}، تم الاتفاق والتراضي بين الطرفين الموقّعَين أدناه على ما يلي،
          وذلك بكامل الأهلية المعتبرة شرعاً وقانوناً، ورغبةً في تنظيم العلاقة المهنية بينهما
          وفقاً لأحكام قانون نقابة المحامين السودانية والأنظمة المعمول بها.
        </div>
        <h3>أطراف العقد</h3>${partiesHtml}
        <h3>تمهيد</h3>
        <p style="font-size:12px;text-align:justify;margin:0 0 6px;">
          حيث إن الطرف الأول يدير منصةً رقمية لربط المواطنين بمقدّمي الخدمات القانونية في مدينة الحصاحيصا والمناطق المجاورة،
          وحيث إن الطرف الثاني محامٍ مرخّص ومسجَّل لدى نقابة المحامين السودانية ويرغب في تقديم خدماته القانونية عبر هذه المنصة،
          فقد اتفق الطرفان على البنود التالية:
        </p>
        <h3>بنود العقد</h3>
        <ol class="terms">${termsHtml}</ol>
        ${full.admin_note ? `<h3>ملاحظات الإدارة</h3>
          <div style="background:#fef3c7;border-right:4px solid #F59E0B;padding:10px 12px;border-radius:6px;font-size:12px;">${full.admin_note}</div>` : ""}
      `;

      // ──────────────────────────────────────────────────────
      // (1) صيغة المسودّة (قبل الاعتماد): بدون أي توثيق
      // ──────────────────────────────────────────────────────
      const draftHtml = `<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
        <style>
          @page { size: A4; margin: 18mm 16mm; }
          * { box-sizing: border-box; }
          html, body { margin:0; padding:0; }
          body {
            font-family: -apple-system, "Helvetica Neue", "Segoe UI", Tahoma, Arial;
            color: #2a2a2a; line-height: 1.85; font-size: 13px;
            background:
              repeating-linear-gradient(135deg, rgba(180,180,180,0.06) 0 80px, transparent 80px 160px);
            position: relative;
          }
          /* علامة مائية قطرية ضخمة عبر الصفحة */
          body::before {
            content: "نموذج • مسودّة غير موثّقة • DRAFT";
            position: fixed; top: 35%; left: -10%; right: -10%;
            transform: rotate(-22deg);
            text-align: center; font-size: 92px; font-weight: 900;
            color: rgba(220, 38, 38, 0.10);
            letter-spacing: 8px; pointer-events: none; z-index: 0;
          }
          .page { position: relative; z-index: 1; }

          .draft-banner {
            background: linear-gradient(90deg, #FEF2F2, #FEF3C7);
            border: 2px dashed #DC2626;
            color: #991B1B;
            text-align: center; padding: 10px 14px; border-radius: 8px;
            font-weight: 800; font-size: 14px; margin-bottom: 14px;
            letter-spacing: 0.5px;
          }
          .draft-banner small { display:block; color:#7C2D12; font-weight:600; font-size:10px; margin-top:3px; letter-spacing:0; }

          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px dashed #7C7566; margin-bottom: 18px; }
          .brand { font-size: 22px; font-weight: 800; color: #6B7280; margin: 0; }
          .brand-sub { color: #6B7280; font-size: 11px; margin-top: 2px; }
          .meta { text-align: left; font-size: 10px; color: #6B7280; line-height: 1.6; }
          .meta b { color: #D8D0BE; }

          .doc-title { text-align: center; font-size: 19px; font-weight: 800; color: #4B5563; margin: 8px 0 4px; }
          .doc-sub   { text-align: center; font-size: 11px; color: #7C7566; margin-bottom: 18px; }

          .preamble { background: #F9FAFB; border-right: 4px solid #7C7566; padding: 12px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; }
          h3 { color: #4B5563; font-size: 14px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #374151; }
          .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; }
          .party { background: #ffffff; border: 1px dashed #4B5563; border-radius: 8px; padding: 12px; }
          .party h4 { margin: 0 0 6px; color: #6B7280; font-size: 12px; }
          .party .row { font-size: 11px; padding: 3px 0; color: #D8D0BE; }
          .party .row b { color: #111827; }
          ol.terms { padding-right: 22px; }
          ol.terms li { margin-bottom: 9px; font-size: 12px; text-align: justify; }
          ol.terms li b { color: #4B5563; }

          .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; }
          .sig-box { text-align: center; }
          .sig-line { border-top: 1.5px dashed #7C7566; padding-top: 6px; font-size: 11px; color: #6B7280; margin-top: 36px; }
          .sig-pending { color:#7C7566; font-style:italic; font-size:11px; margin-top:6px; }

          .notice {
            margin-top: 24px; background:#FFFBEB; border:1px solid #FCD34D; border-radius:8px;
            padding:12px 14px; color:#92400E; font-size:11px; line-height:1.7;
          }
          .notice b { color:#78350F; }

          .footer { margin-top: 24px; padding-top: 10px; border-top: 1px dashed #4B5563; text-align: center; color: #7C7566; font-size: 9px; line-height: 1.6; }
        </style></head><body>
        <div class="page">
          <div class="draft-banner">
            ⚠️ نموذج / مسودّة عقد — غير موثّق ولا يُحتجّ به أمام أي جهة
            <small>هذه نسخة أولية للاطلاع فقط، تصدر قبل اعتماد الطلب من إدارة المنصة</small>
          </div>

          <div class="header">
            <div>
              <h1 class="brand">⚖️ تطبيق حصاحيصاوي</h1>
              <div class="brand-sub">القسم القانوني — مدينة الحصاحيصا، السودان</div>
            </div>
            <div class="meta">
              <div>مرجع المسودّة: <b>${contractNo}</b></div>
              <div>التاريخ الميلادي: <b>${dStr}</b></div>
              ${hijri ? `<div>التاريخ الهجري: <b>${hijri}</b></div>` : ""}
              <div>الحالة: <b style="color:#DC2626">قيد المراجعة — لم يُعتمد بعد</b></div>
            </div>
          </div>

          <div class="doc-title">مسودّة عقد انضمام محامٍ إلى منصة حصاحيصاوي</div>
          <div class="doc-sub">Lawyer Onboarding Agreement — DRAFT (Unverified)</div>

          ${preamble}

          <div class="sigs">
            <div class="sig-box">
              <div style="font-size:11px;color:#7C7566;margin-bottom:4px;">الطرف الأول</div>
              <div class="sig-line">
                <div style="font-weight:700;font-size:12px;color:#6B7280;">إدارة تطبيق حصاحيصاوي</div>
                <div style="color:#7C7566;font-size:10px;margin-top:2px;">القسم القانوني</div>
                <div class="sig-pending">— لم يُعتمد بعد —</div>
              </div>
            </div>
            <div class="sig-box">
              <div style="font-size:11px;color:#7C7566;margin-bottom:4px;">الطرف الثاني</div>
              <div class="sig-line">
                <div style="font-weight:700;font-size:12px;color:#6B7280;">${full.full_name}</div>
                <div style="color:#7C7566;font-size:10px;margin-top:2px;">${full.title || "محامي"} — نقابة رقم ${full.bar_number || "—"}</div>
                <div class="sig-pending">— بانتظار اعتماد الإدارة —</div>
              </div>
            </div>
          </div>

          <div class="notice">
            <b>تنبيه قانوني:</b> هذه الوثيقة عبارة عن <b>نموذج/مسودّة</b> صادر بصورة آلية من تطبيق حصاحيصاوي،
            وهي <b>غير موثّقة وغير معتمدة</b> ولا تحمل أي ختم رسمي أو رقم تحقق، ولا تترتّب عليها أي آثار قانونية.
            بمجرّد اعتماد الطلب من إدارة المنصة، ستصدر النسخة الرسمية الموثّقة بختم الاعتماد ورمز التحقق العام.
          </div>

          <div class="footer">
            مسودّة آلية صادرة من تطبيق حصاحيصاوي — لا تُعتبر عقداً سارياً.
          </div>
        </div>
      </body></html>`;

      // ──────────────────────────────────────────────────────
      // (2) صيغة العقد الموثّق رسمياً (بعد الاعتماد)
      // ──────────────────────────────────────────────────────
      const notarizedHtml = `<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
        <style>
          @page { size: A4; margin: 18mm 16mm; }
          * { box-sizing: border-box; }
          html, body { margin:0; padding:0; }
          body {
            font-family: -apple-system, "Helvetica Neue", "Segoe UI", Tahoma, Arial;
            color: #111827; line-height: 1.85; font-size: 13px; position: relative;
          }
          /* علامة مائية ناعمة "موثّق" */
          body::before {
            content: "✓ موثّق رسمياً";
            position: fixed; top: 38%; left: 0; right: 0;
            transform: rotate(-18deg);
            text-align: center; font-size: 110px; font-weight: 900;
            color: rgba(16, 185, 129, 0.06);
            letter-spacing: 6px; pointer-events: none; z-index: 0;
          }
          .page { position: relative; z-index: 1; }

          .verified-banner {
            background: linear-gradient(90deg, #ECFDF5, #D1FAE5);
            border: 2px solid #10B981;
            color: #065F46;
            text-align: center; padding: 10px 14px; border-radius: 8px;
            font-weight: 800; font-size: 14px; margin-bottom: 14px;
            letter-spacing: 0.5px;
          }
          .verified-banner small { display:block; color:#047857; font-weight:600; font-size:10px; margin-top:3px; letter-spacing:0; }

          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px double #10B981; margin-bottom: 18px; }
          .brand { font-size: 22px; font-weight: 800; color: #065F46; margin: 0; }
          .brand-sub { color: #047857; font-size: 11px; margin-top: 2px; }
          .meta { text-align: left; font-size: 10px; color: #D8D0BE; line-height: 1.6; }
          .meta b { color: #065F46; }

          .doc-title { text-align: center; font-size: 19px; font-weight: 800; color: #064E3B; margin: 8px 0 4px; letter-spacing: 0.5px; }
          .doc-sub   { text-align: center; font-size: 11px; color: #047857; margin-bottom: 18px; }

          /* ختم دائري احترافي */
          .seal-wrap { position: absolute; top: 84px; left: 30px; z-index: 5; transform: rotate(-12deg); }
          .seal {
            width: 130px; height: 130px; border-radius: 50%;
            border: 4px double #047857;
            display: flex; align-items: center; justify-content: center;
            background: rgba(16,185,129,0.07);
            color: #047857; text-align: center; font-weight: 900;
            box-shadow: 0 0 0 2px rgba(16,185,129,0.25) inset;
            position: relative;
          }
          .seal::before {
            content: ""; position: absolute; inset: 8px; border: 1px dashed #047857; border-radius: 50%;
          }
          .seal-inner { font-size: 11px; line-height: 1.4; }
          .seal-inner .big { display:block; font-size:15px; margin: 2px 0; }
          .seal-inner .small { display:block; font-size:8px; color:#065F46; }

          .preamble { background: #F0FDF4; border-right: 4px solid #10B981; padding: 12px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12px; }
          h3 { color: #064E3B; font-size: 14px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #D1FAE5; }
          .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 6px; }
          .party { background: #F9FAFB; border: 1px solid #374151; border-radius: 8px; padding: 12px; }
          .party h4 { margin: 0 0 6px; color: #047857; font-size: 12px; }
          .party .row { font-size: 11px; padding: 3px 0; color: #E7E1D3; }
          .party .row b { color: #000; }
          ol.terms { padding-right: 22px; }
          ol.terms li { margin-bottom: 9px; font-size: 12px; text-align: justify; }
          ol.terms li b { color: #065F46; }

          .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; }
          .sig-box { text-align: center; }
          .sig-line { border-top: 1.5px solid #065F46; padding-top: 6px; font-size: 11px; color: #E7E1D3; margin-top: 36px; }
          .sig-name { font-weight: 800; font-size: 12px; color: #065F46; }
          .sig-role { color: #047857; font-size: 10px; margin-top: 2px; }
          .sig-stamp { margin-top: 8px; color: #047857; font-size: 12px; font-weight: 800; }

          .verify-block {
            margin-top: 26px; display:grid; grid-template-columns: 140px 1fr; gap: 14px;
            background:#F0FDF4; border: 1.5px solid #10B981; border-radius: 10px; padding: 12px;
            align-items: center;
          }
          .verify-block img { width:130px; height:130px; border:1px solid #D1FAE5; background:#fff; border-radius:6px; }
          .verify-block .info { font-size: 11px; color: #064E3B; line-height: 1.85; }
          .verify-block .info b { color: #047857; }
          .verify-block .sig-hash { font-family: "Courier New", monospace; background:#fff; border:1px dashed #10B981; padding:4px 8px; border-radius:4px; font-size:10px; color:#064E3B; display:inline-block; margin-top:4px; word-break: break-all; }

          .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #D1FAE5; text-align: center; color: #047857; font-size: 9px; line-height: 1.6; }
        </style></head><body>
        <div class="page">
          <div class="verified-banner">
            ✅ عقد موثّق رسمياً ومعتمد من إدارة منصة حصاحيصاوي
            <small>وثيقة سارية المفعول — يمكن التحقّق من صحتها عبر رمز الاستجابة السريعة أدناه</small>
          </div>

          <div class="seal-wrap">
            <div class="seal">
              <div class="seal-inner">
                <span class="small">★ ختم الاعتماد ★</span>
                <span class="big">موثّق</span>
                <span class="small">القسم القانوني</span>
                <span class="small">${contractNo}</span>
              </div>
            </div>
          </div>

          <div class="header">
            <div>
              <h1 class="brand">⚖️ تطبيق حصاحيصاوي</h1>
              <div class="brand-sub">القسم القانوني — مدينة الحصاحيصا، السودان</div>
            </div>
            <div class="meta">
              <div>رقم العقد: <b>${contractNo}</b></div>
              <div>تاريخ الإصدار: <b>${dStr}</b></div>
              ${hijri ? `<div>التاريخ الهجري: <b>${hijri}</b></div>` : ""}
              <div>تاريخ الاعتماد: <b>${new Date(approvedAt).toLocaleDateString("ar-SD")}</b></div>
              <div>الحالة: <b style="color:#047857">معتمد ✓</b></div>
            </div>
          </div>

          <div class="doc-title">عقد انضمام محامٍ إلى منصة حصاحيصاوي</div>
          <div class="doc-sub">Lawyer Onboarding Agreement — Notarized</div>

          ${preamble}

          <div class="sigs">
            <div class="sig-box">
              <div style="font-size:11px;color:#D8D0BE;margin-bottom:4px;">الطرف الأول</div>
              <div class="sig-line">
                <div class="sig-name">إدارة تطبيق حصاحيصاوي</div>
                <div class="sig-role">القسم القانوني</div>
                <div class="sig-stamp">✓ معتمد إلكترونياً بختم رسمي</div>
              </div>
            </div>
            <div class="sig-box">
              <div style="font-size:11px;color:#D8D0BE;margin-bottom:4px;">الطرف الثاني</div>
              <div class="sig-line">
                <div class="sig-name">${full.full_name}</div>
                <div class="sig-role">${full.title || "محامي"} — نقابة رقم ${full.bar_number || "—"}</div>
                <div class="sig-stamp" style="font-size:11px;">✓ موافقة موثّقة عبر التطبيق<br/>بتاريخ ${new Date(full.created_at).toLocaleDateString("ar-SD")}</div>
              </div>
            </div>
          </div>

          <div class="verify-block">
            <img src="${qrSrc}" alt="QR التحقق"/>
            <div class="info">
              <div><b>التحقّق من صحة الوثيقة</b></div>
              <div>رقم العقد: <b>${contractNo}</b></div>
              <div>رمز التحقّق العام: <b>${contractNo}-${String(approvedAt).slice(0,10).replace(/-/g,"")}</b></div>
              <div>التوقيع الرقمي (FNV‑1a): <span class="sig-hash">${digSig}</span></div>
              <div style="margin-top:6px;">رابط التحقّق: <span class="sig-hash">${verifyUrl}</span></div>
              <div style="margin-top:4px;color:#064E3B;">امسح رمز QR للتحقّق الفوري من حالة الاعتماد عبر خادم المنصة الرسمي.</div>
            </div>
          </div>

          <div class="footer">
            وثيقة إلكترونية موثّقة صادرة من تطبيق حصاحيصاوي · أي تعديل أو محو يُبطل صلاحيتها · جميع الحقوق محفوظة © ${today.getFullYear()}
          </div>
        </div>
      </body></html>`;

      const html = isApproved ? notarizedHtml : draftHtml;

      await printPaper(html, "عقد الانضمام");
    } catch (e: any) {
      Alert.alert("تعذّر إصدار العقد", e?.message || "حاول لاحقاً");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const TABS = [
    { key: "directory" as const, label: "المحامون", icon: "account-tie" as const },
    { key: "forms"     as const, label: "الاستمارات", icon: "file-document-outline" as const },
    { key: "contracts" as const, label: "تعاقداتي",  icon: "handshake-outline" as const },
  ];
  const activeGroup = SPEC_GROUPS.find(g => g.key === filter);

  return (
    <View style={s.container}>
      <ModernHeader title="الخدمات القانونية" subtitle="محامون · استشارات · استمارات" showBack onBack={() => router.back()}>
        <View style={s.tabsRow} accessibilityRole="tablist">
          {TABS.map(t => {
            const on = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tabBtn, on && s.tabBtnActive]}
                accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
                <MaterialCommunityIcons name={t.icon} size={17} color={on ? NAVY : "#FFFFFF"} />
                <Text style={[s.tabLabel, on && s.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ModernHeader>

      {/* ── DIRECTORY ── */}
      {tab === "directory" && (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={i => String(i.id)}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              {/* إعلانات المحامين (من الخادم) */}
              {ads.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }} style={{ marginBottom: 12 }}>
                  {ads.map(ad => (
                    <Pressable key={ad.id} onPress={() => callLawyer(ad.cta_phone)}
                      accessibilityRole="button" accessibilityLabel={`${ad.title}، ${ad.cta_text || "اتصال"}`}
                      style={[s.adCard, { borderColor: (ad.banner_color || NAVY) + "66" }]}>
                      <View style={s.adBadge}><Text style={s.adBadgeText}>إعلان</Text></View>
                      <Text style={s.adTitle} numberOfLines={1}>{ad.title}</Text>
                      <Text style={s.adBody} numberOfLines={2}>{ad.body}</Text>
                      <View style={s.adCtaRow}>
                        <View style={s.adCta}>
                          <Ionicons name="call" size={13} color="#fff" />
                          <Text style={s.adCtaText}>{ad.cta_text || "اتصال"}</Text>
                        </View>
                        {!!ad.lawyer_name && <Text style={s.adAuthor} numberOfLines={1}>{ad.lawyer_name}</Text>}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* بماذا نساعدك اليوم؟ */}
              <View style={s.svcHub}>
                <Text style={s.svcHubTitle}>بماذا نساعدك اليوم؟</Text>
                <Text style={s.svcHubSub}>اختر نوع قضيتك لعرض المحامين المختصين بها</Text>
                <View style={s.svcGrid}>
                  {LEGAL_SERVICES.map(sv => {
                    const isGroup = sv.action !== "rights" && sv.action !== "forms";
                    const on = isGroup && filter === sv.action;
                    const count = isGroup ? groupCounts[sv.action] ?? 0 : null;
                    return (
                      <Pressable key={sv.title}
                        style={({ pressed }) => [s.svcTile, on && s.svcTileOn, pressed && { opacity: 0.85 }]}
                        accessibilityRole="button" accessibilityState={{ selected: on }}
                        accessibilityLabel={isGroup ? `${sv.title}، ${count} محامٍ` : sv.title}
                        onPress={() => {
                          if (sv.action === "rights") setRightsOpen(true);
                          else if (sv.action === "forms") setTab("forms");
                          else pickGroup(sv.action);
                        }}>
                        <View style={[s.svcTileIcon, on && { backgroundColor: P.activeBg }]}>
                          <MaterialCommunityIcons name={sv.icon as any} size={21} color={on ? P.activeFg : P.ink} />
                        </View>
                        <Text style={[s.svcTileText, on && { color: P.gold }]} numberOfLines={2}>{sv.title}</Text>
                        {count !== null && count > 0 && <Text style={s.svcTileCount}>{count} محامٍ</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* انضم كمحامٍ */}
              <Pressable onPress={() => setJoinOpen(true)} style={({ pressed }) => [s.joinBanner, pressed && { opacity: 0.9 }]}
                accessibilityRole="button" accessibilityLabel="هل أنت محامٍ؟ قدّم طلب الانضمام">
                <View style={s.joinIcon}><MaterialCommunityIcons name="briefcase-plus" size={22} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.joinTitle}>هل أنت محامٍ؟ انضم إلى الدليل</Text>
                  <Text style={s.joinSub}>
                    {showPricing ? "ابدأ بالخطة المجانية أو اختر خطة مدفوعة" : "سجّل بياناتك ورقم قيدك بالنقابة، وتراجع الإدارة طلبك"}
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </Pressable>

              {/* الخطط: تظهر فقط عند تفعيل عرض الأسعار، ومن بيانات الخادم */}
              {showPricing && plans.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }} style={{ marginBottom: 12 }}>
                  {plans.map(p => (
                    <View key={p.id} style={s.planCard}>
                      <View style={[s.planDot, { backgroundColor: p.color || NAVY }]} />
                      <Text style={s.planName}>{p.name_ar}</Text>
                      <Text style={s.planPrice}>{p.price_label}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* بحث */}
              <View style={s.searchBox}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput
                  style={s.searchInput} placeholder="ابحث باسم المحامي أو التخصص أو الحي" placeholderTextColor={Colors.textMuted}
                  value={search} onChangeText={setSearch} returnKeyType="search" accessibilityLabel="بحث في المحامين"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={12} accessibilityRole="button" accessibilityLabel="مسح البحث">
                    <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
                  </Pressable>
                )}
              </View>

              {/* شرائح التخصص */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
                {[{ key: "all" as const, label: "الكل" }, ...SPEC_GROUPS].map(g => {
                  const on = filter === g.key;
                  return (
                    <Pressable key={g.key} onPress={() => setFilter(g.key)} style={[s.chip, on && s.chipActive]}
                      accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`تخصص ${g.label}`}>
                      <Text style={[s.chipText, on && s.chipTextActive]}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={s.resultsRow} onLayout={e => setListTopY(e.nativeEvent.layout.y + 14)}>
                <Text style={s.resultsText}>
                  {loading && lawyers.length === 0 ? "جارٍ التحميل…" : `${filtered.length} ${filtered.length === 1 ? "محامٍ" : "محامين"}${activeGroup ? ` · ${activeGroup.label}` : ""}`}
                </Text>
                {(filter !== "all" || !!search) && (
                  <Pressable onPress={() => { setFilter("all"); setSearch(""); }} hitSlop={10} style={s.clearBtn}
                    accessibilityRole="button" accessibilityLabel="إلغاء التصفية">
                    <Ionicons name="close" size={14} color={P.gold} />
                    <Text style={s.clearText}>إلغاء التصفية</Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40)}>
              <LawyerCard lw={item} showPricing={showPricing}
                onOpen={() => openLawyer(item)}
                onConsult={() => openRequest(generalRequest(item), item)}
                onCall={() => callLawyer(item.phone)}
                onWhatsApp={item.whatsapp ? () => waLawyer(item.whatsapp) : undefined} />
            </Animated.View>
          )}
          ListEmptyComponent={loading ? (
            <View style={{ gap: 10 }}>{[0, 1, 2].map(i => <SkeletonCard key={i} />)}</View>
          ) : loadError ? (
            <EmptyState icon="cloud-off-outline" title="تعذّر تحميل قائمة المحامين" body="تحقق من اتصالك بالإنترنت ثم أعد المحاولة."
              action="إعادة المحاولة" onAction={loadDirectory} />
          ) : lawyers.length === 0 ? (
            <EmptyState icon="account-tie-outline" title="لا يوجد محامون مسجّلون بعد"
              body="تُضاف ملفات المحامين بعد مراجعة الإدارة لطلبات الانضمام." action="قدّم طلب انضمام كمحامٍ" onAction={() => setJoinOpen(true)} />
          ) : (
            <EmptyState icon="account-search" title={activeGroup ? `لا يوجد محامٍ في تخصص «${activeGroup.label}» بعد` : "لا نتائج مطابقة"}
              body="جرّب كلمة بحث أخرى أو اعرض جميع المحامين." action="عرض كل المحامين" onAction={() => { setFilter("all"); setSearch(""); }} />
          )}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshing={loading && lawyers.length > 0} onRefresh={loadDirectory}
        />
      )}

      {/* ── FORMS ── */}
      {tab === "forms" && (
        <FlatList
          data={forms.filter(f => (formCat === "الكل" || f.category === formCat) && (!formQ.trim() || norm(`${f.title} ${f.description} ${f.category}`).includes(norm(formQ.trim()))))}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 12 }}>
              <View style={s.formsHero}>
                <View style={s.formsHeroIcon}><MaterialCommunityIcons name="file-sign" size={26} color="#E3C27A" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.formsHeroTitle}>الاستمارات والنماذج القانونية</Text>
                  <Text style={s.formsHeroSub}>اطبع الاستمارة على ورق رسمي فيه خانات للتعبئة والتوقيع والختم، أو احفظها PDF.</Text>
                </View>
              </View>
              {forms.length > 0 && (
                <>
                  <View style={s.searchBox}>
                    <Ionicons name="search" size={18} color={Colors.textMuted} />
                    <TextInput style={s.searchInput} placeholder="ابحث عن استمارة: إيجار، توكيل، إقرار…" placeholderTextColor={Colors.textMuted}
                      value={formQ} onChangeText={setFormQ} accessibilityLabel="بحث في الاستمارات" />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {["الكل", ...Array.from(new Set(forms.map(f => f.category).filter(Boolean)))].map(c => (
                      <Pressable key={c} onPress={() => setFormCat(c)} style={[s.chip, formCat === c && s.chipActive]}
                        accessibilityRole="button" accessibilityState={{ selected: formCat === c }}>
                        <Text style={[s.chipText, formCat === c && s.chipTextActive]}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          }
          ListFooterComponent={<OrgInviteCard />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
              <Pressable onPress={() => printForm(item.id)} style={({ pressed }) => [s.paperCard, pressed && { opacity: 0.9 }]}
                accessibilityRole="button" accessibilityLabel={`${item.title}، عرض وطباعة`}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={s.formIconBox}><MaterialCommunityIcons name="file-document-edit-outline" size={24} color={P.ink} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.formTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <Text style={s.formCat}>{item.category}</Text>
                      {item.is_official && <View style={s.officialBadge}><Text style={s.officialBadgeText}>معتمدة</Text></View>}
                    </View>
                    {!!item.description && <Text style={s.formDesc} numberOfLines={2}>{item.description}</Text>}
                  </View>
                </View>
                <View style={s.paperActions}>
                  <View style={s.printBtn}>
                    {printingForm === item.id ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="print-outline" size={16} color="#fff" />}
                    <Text style={s.printBtnText}>عرض وطباعة</Text>
                  </View>
                  <Text style={s.paperHint}>PDF · A4</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
          ListEmptyComponent={formsLoading
            ? <View style={{ gap: 10 }}>{[0, 1, 2].map(i => <SkeletonCard key={i} compact />)}</View>
            : formsError
              ? <EmptyState icon="cloud-off-outline" title="تعذّر تحميل الاستمارات" body="تحقق من اتصالك ثم أعد المحاولة." action="إعادة المحاولة" onAction={loadForms} />
              : forms.length === 0
                ? <EmptyState icon="file-document-outline" title="لا توجد استمارات منشورة بعد" body="تنشر إدارة القسم القانوني النماذج المعتمدة هنا تباعاً." />
                : <EmptyState icon="file-search-outline" title="لا توجد استمارة مطابقة" body="جرّب كلمة أخرى أو اختر «الكل»." action="عرض الكل" onAction={() => { setFormQ(""); setFormCat("الكل"); }} />}
        />
      )}

      {/* ── MY CONTRACTS ── */}
      {tab === "contracts" && (
        <FlatList
          data={myContracts} keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          refreshing={contractsLoading && (myContracts.length > 0 || myApps.length > 0)} onRefresh={loadMyContracts}
          ListHeaderComponent={
            myApps.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={s.contractsSectionTitle}>طلبات انضمامك كمحامٍ</Text>
                {myApps.map(a => {
                  const st = STATUS_AR[a.status] || { label: a.status, color: Colors.textMuted };
                  return (
                    <View key={a.id} style={[s.contractCard, { borderColor: st.color + "66" }]}>
                      <View style={s.contractTop}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name="briefcase-plus" size={15} color={st.color} />
                          <Text style={s.contractNo}>طلب #{a.id}</Text>
                        </View>
                        <View style={[s.statusPill, { borderColor: st.color }]}>
                          <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Text style={s.contractLawyer}>{a.full_name}</Text>
                      <Text style={s.contractMeta}>قُدّم في {new Date(a.created_at).toLocaleDateString("ar-SD")}</Text>
                      {!!a.admin_note && (
                        <View style={s.noteBox}>
                          <Text style={[s.noteTitle, { color: st.color }]}>ملاحظة الإدارة</Text>
                          <Text style={s.noteText}>{a.admin_note}</Text>
                        </View>
                      )}
                      {a.status === "approved" && (
                        <>
                          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="checkmark-circle" size={15} color={P.green} />
                            <Text style={{ color: P.green, fontFamily: "Cairo_700Bold", fontSize: 12 }}>ملفك ظاهر الآن في دليل المحامين</Text>
                          </View>
                          <Pressable onPress={() => router.push("/lawyer-portal")} style={s.primaryBtn}
                            accessibilityRole="button" accessibilityLabel="فتح بوابة المحامي">
                            <Ionicons name="grid-outline" size={16} color="#fff" />
                            <Text style={s.primaryBtnText}>بوابة المحامي</Text>
                          </Pressable>
                        </>
                      )}
                      {a.status !== "rejected" && (
                        <Pressable onPress={() => printJoinContract(a)} style={s.outlineBtn}
                          accessibilityRole="button" accessibilityLabel="تحميل عقد الانضمام">
                          <MaterialCommunityIcons name="file-document-outline" size={16} color={P.ink} />
                          <Text style={s.outlineBtnText}>
                            {a.status === "approved" ? "تحميل العقد المعتمد (PDF)" : "عرض مسودّة العقد (PDF)"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
                {myContracts.length > 0 && <Text style={[s.contractsSectionTitle, { marginTop: 18 }]}>طلبات الخدمات القانونية</Text>}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const st = STATUS_AR[item.status] || { label: item.status, color: Colors.textMuted };
            return (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
                <View style={s.contractCard}>
                  <View style={s.contractTop}>
                    <Text style={s.contractNo}>#{item.contract_no}</Text>
                    <View style={[s.statusPill, { borderColor: st.color }]}>
                      <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={s.contractLawyer}>{item.lawyer_name}</Text>
                  <Text style={s.contractSvc}>{item.service_title || "تواصل عام"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                    <Text style={s.contractMeta}>أُرسل في {new Date(item.created_at).toLocaleDateString("ar-SD")}</Text>
                    {!!item.preferred_date && <Text style={s.contractMeta}>· الموعد المطلوب {item.preferred_date}</Text>}
                  </View>
                  <View style={s.contractActions}>
                    {!!item.lawyer_phone && (
                      <Pressable onPress={() => callLawyer(item.lawyer_phone)} style={s.miniBtn} accessibilityRole="button" accessibilityLabel={`اتصال بـ ${item.lawyer_name}`}>
                        <Ionicons name="call-outline" size={15} color={P.green} /><Text style={s.miniBtnText}>اتصال</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => router.push({ pathname: "/client-case-chat", params: { contractId: String(item.id) } })} style={s.miniBtn}
                      accessibilityRole="button" accessibilityLabel="محادثة المحامي">
                      <Ionicons name="chatbubbles-outline" size={15} color={P.ink} /><Text style={s.miniBtnText}>محادثة</Text>
                    </Pressable>
                    <Pressable onPress={() => printContract(item)} style={s.miniBtn} accessibilityRole="button" accessibilityLabel="طباعة الإيصال">
                      <Ionicons name="print-outline" size={15} color={P.blue} /><Text style={s.miniBtnText}>إيصال</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={contractsLoading
            ? <View style={{ gap: 10 }}>{[0, 1].map(i => <SkeletonCard key={i} compact />)}</View>
            : myApps.length === 0 ? (
              <EmptyState icon="handshake-outline" title="لا توجد طلبات بعد"
                body="اختر محامياً من الدليل وأرسل طلب استشارة، وستجد طلباتك وحالتها هنا."
                action="تصفّح المحامين" onAction={() => setTab("directory")} />
            ) : null}
        />
      )}

      {/* ═══ Lawyer Join Modal ═══ */}
      <Modal visible={joinOpen} animationType="slide" onRequestClose={() => setJoinOpen(false)} transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, RTL, { maxHeight: "94%" }]}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <View style={s.joinHead}>
                <View style={s.joinHeadIcon}>
                  <MaterialCommunityIcons name="briefcase-plus" size={26} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailName}>طلب تعاقد كمحامٍ</Text>
                  <Text style={s.detailTitle}>سيتم مراجعة الطلب من إدارة التطبيق</Text>
                </View>
                <TouchableOpacity onPress={() => setJoinOpen(false)} style={s.closeBtn} accessibilityRole="button" accessibilityLabel="إغلاق">
                  <Ionicons name="close" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* قسم المعلومات الأساسية */}
              <Text style={s.joinSectionTitle}>المعلومات الأساسية *</Text>
              <Field label="الاسم الكامل *" value={appForm.full_name} onChange={(v: string) => setAppForm(f => ({ ...f, full_name: v }))} placeholder="مثال: أحمد محمد علي" />
              <Field label="المسمّى المهني" value={appForm.title} onChange={(v: string) => setAppForm(f => ({ ...f, title: v }))} placeholder="محامي / مستشار قانوني" />
              <Field label="رقم الهاتف *" value={appForm.phone} onChange={(v: string) => setAppForm(f => ({ ...f, phone: v }))} placeholder="09xxxxxxxx" keyboardType="phone-pad" />
              <Field label="واتساب" value={appForm.whatsapp} onChange={(v: string) => setAppForm(f => ({ ...f, whatsapp: v }))} placeholder="09xxxxxxxx" keyboardType="phone-pad" />
              <Field label="البريد الإلكتروني" value={appForm.email} onChange={(v: string) => setAppForm(f => ({ ...f, email: v }))} placeholder="email@example.com" keyboardType="email-address" />

              <Text style={s.joinSectionTitle}>التراخيص والخبرة *</Text>
              <Field label="رقم النقابة *" value={appForm.bar_number} onChange={(v: string) => setAppForm(f => ({ ...f, bar_number: v }))} placeholder="BAR-YYYY-XXXX" />
              <Field label="سنوات الخبرة" value={appForm.experience_y} onChange={(v: string) => setAppForm(f => ({ ...f, experience_y: v.replace(/\D/g, "") }))} placeholder="0" keyboardType="number-pad" />
              <Field label="التخصصات *" value={appForm.specialties} onChange={(v: string) => setAppForm(f => ({ ...f, specialties: v }))} placeholder="مثال: تجاري, عقارات, أحوال شخصية" multiline />
              <View style={s.uploadBox}>
                <Text style={s.joinSectionTitle}>الهوية المهنية / كارنيه النقابة</Text>
                <Text style={s.uploadHelp}>إرفاق صورة أو PDF اختياري، لكن يسرّع المراجعة. إذا تعذر الرفع سيكتمل الطلب كمراجعة يدوية.</Text>
                <TouchableOpacity onPress={pickBarCardFile} disabled={barCardUploading} style={[s.uploadBtn, barCardUploadFailed && s.uploadBtnWarn, appForm.bar_card_url && s.uploadBtnOk]}>
                  {barCardUploading ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name={appForm.bar_card_url ? "check-decagram" : "card-account-details-outline"} size={18} color="#fff" />}
                  <Text style={s.uploadBtnText}>{barCardUploading ? "جارٍ رفع الملف…" : appForm.bar_card_url ? "تم رفع ملف الهوية" : "إرفاق صورة/ملف الهوية"}</Text>
                </TouchableOpacity>
                {barCardFileName ? <Text style={s.uploadFileName}>الملف: {barCardFileName}</Text> : null}
                {barCardUploadFailed ? <Text style={s.uploadWarn}>{barCardUploadError || "لم يكتمل الرفع، وسيظهر الطلب للإدارة كمراجعة يدوية."}</Text> : null}
                <Field label="رابط يدوي للهوية (اختياري)" value={appForm.bar_card_url} onChange={(v: string) => setAppForm(f => ({ ...f, bar_card_url: v }))} placeholder="https://..." />
              </View>

              <Text style={s.joinSectionTitle}>المكتب والعنوان</Text>
              <Field label="عنوان المكتب" value={appForm.office_addr} onChange={(v: string) => setAppForm(f => ({ ...f, office_addr: v }))} placeholder="العنوان التفصيلي" />
              <Field label="الحي / المنطقة" value={appForm.district} onChange={(v: string) => setAppForm(f => ({ ...f, district: v }))} placeholder="مثال: حي الشرق" />
              {showPricing && <Field label="رسوم الاستشارة" value={appForm.consult_fee} onChange={(v: string) => setAppForm(f => ({ ...f, consult_fee: v }))} placeholder="مثال: 5,000 ج.س / 30 دقيقة" />}

              <Text style={s.joinSectionTitle}>نبذة تعريفية</Text>
              <Field label="نبذة عنك (تظهر في ملفك)" value={appForm.bio} onChange={(v: string) => setAppForm(f => ({ ...f, bio: v }))} placeholder="اكتب نبذة موجزة عن خبراتك وأسلوب عملك…" multiline />

              {/* شروط التعاقد */}
              <View style={s.termsBox}>
                <Text style={s.termsTitle}>شروط التعاقد</Text>
                <Text style={s.termsText}>
                  • أتعهد بصحة جميع البيانات والوثائق المقدّمة وأتحمّل مسؤوليتها كاملة.{"\n"}
                  • ألتزم بالأخلاقيات المهنية وقواعد نقابة المحامين السودانية.{"\n"}
                  • أوافق على عرض ملفي الشخصي وخدماتي لمستخدمي التطبيق وتلقّي طلبات الخدمة منهم.{"\n"}
                  • للتطبيق الحق في إيقاف الملف عند ثبوت أي شكوى موثّقة أو معلومات غير صحيحة.{"\n"}
                  • يحق للمحامي طلب إخفاء ملفه أو حذفه في أي وقت بإشعار الإدارة.
                </Text>
              </View>

              <Pressable onPress={() => setAppForm(f => ({ ...f, agree: !f.agree }))} style={s.agreeRow}>
                <View style={[s.checkbox, appForm.agree && s.checkboxOn]}>
                  {appForm.agree && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={s.agreeText}>أوافق على شروط التعاقد أعلاه وأؤكد صحة بياناتي</Text>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                <TouchableOpacity onPress={() => setJoinOpen(false)} style={s.cancelBtn}>
                  <Text style={s.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitJoinApplication} disabled={joinSubmitting} style={[s.submitBtn, joinSubmitting && { opacity: 0.6 }]}>
                  {joinSubmitting ? <ActivityIndicator color="#fff" /> : (
                    <><MaterialCommunityIcons name="send-check" size={16} color="#fff" /><Text style={s.submitBtnText}>إرسال طلب التعاقد</Text></>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* ═══ Lawyer Detail Modal ═══ */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)} transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, RTL]}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {selected && (
                <>
                  <View style={s.detailHead}>
                    <Avatar lw={selected} size={72} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailName}>{selected.full_name}</Text>
                      <Text style={s.detailTitle}>{selected.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        {selected.is_verified && <VerifiedBadge />}
                        {selected.review_count > 0 && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Stars value={selected.avg_rating} size={13} />
                            <Text style={s.detailMeta}>{selected.avg_rating.toFixed(1)} ({selected.review_count})</Text>
                          </View>
                        )}
                        <ViewCount kind="lawyer" id={String(selected.id)} label size={12} />
                      </View>
                    </View>
                    <Pressable onPress={() => setSelected(null)} style={s.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="إغلاق">
                      <Ionicons name="close" size={20} color={Colors.text} />
                    </Pressable>
                  </View>

                  {/* إجراءات */}
                  <View style={s.quickRow}>
                    <Pressable onPress={() => openRequest(generalRequest(selected), selected)} style={[s.quickBtn, { backgroundColor: P.btn, flexBasis: "100%" }]}
                      accessibilityRole="button" accessibilityLabel="طلب استشارة">
                      <MaterialCommunityIcons name="scale-balance" size={18} color="#fff" /><Text style={s.quickBtnText}>طلب استشارة</Text>
                    </Pressable>
                    {!!selected.phone && (
                      <Pressable onPress={() => callLawyer(selected.phone)} style={[s.quickBtn, { backgroundColor: P.greenBtn }]}
                        accessibilityRole="button" accessibilityLabel={`اتصال بـ ${selected.full_name}`}>
                        <Ionicons name="call" size={16} color="#fff" /><Text style={s.quickBtnText}>اتصال</Text>
                      </Pressable>
                    )}
                    {!!selected.whatsapp && (
                      <Pressable onPress={() => waLawyer(selected.whatsapp)} style={s.quickBtnOutline}
                        accessibilityRole="button" accessibilityLabel="مراسلة عبر واتساب">
                        <Ionicons name="logo-whatsapp" size={17} color={P.wa} /><Text style={s.quickBtnOutlineText}>واتساب</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* الترخيص */}
                  <View style={s.licenseBox}>
                    <MaterialCommunityIcons name={selected.is_verified ? "shield-check" : "shield-outline"} size={26} color={selected.is_verified ? P.green : Colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.licenseLabel}>رقم القيد بنقابة المحامين</Text>
                      <Text style={s.licenseValue}>{selected.bar_number || "غير مُدرج"}</Text>
                      <Text style={[s.licenseNote, { color: selected.is_verified ? P.green : Colors.textMuted }]}>
                        {selected.is_verified ? "راجعت الإدارة بطاقة القيد ووثّقت الملف" : "لم يُوثَّق بعد"}
                      </Text>
                    </View>
                  </View>

                  {/* التخصصات */}
                  {splitSpecs(selected.specialties).length > 0 && (
                    <View style={s.section}>
                      <Text style={s.sectionTitle}>التخصصات</Text>
                      <View style={s.specWrap}>
                        {splitSpecs(selected.specialties).map(sp => <View key={sp} style={s.specChip}><Text style={s.specChipText}>{sp}</Text></View>)}
                      </View>
                    </View>
                  )}

                  <View style={s.infoBox}>
                    {selected.experience_y > 0 && <InfoLine icon="ribbon-outline" label="الخبرة" value={`${selected.experience_y} سنة`} />}
                    <InfoLine icon="location-outline" label="المكتب" value={[selected.office_addr, selected.district].filter(Boolean).join(" — ") || "الحصاحيصا"} />
                    {!!selected.languages && <InfoLine icon="globe-outline" label="اللغات" value={selected.languages} />}
                    {showPricing && !!selected.consult_fee && <InfoLine icon="cash-outline" label="الاستشارة" value={selected.consult_fee} />}
                  </View>

                  {!!selected.bio && (
                    <View style={s.section}>
                      <Text style={s.sectionTitle}>نبذة</Text>
                      <Text style={s.bioText}>{selected.bio}</Text>
                    </View>
                  )}

                  {/* الخدمات */}
                  <View style={s.section}>
                    <Text style={s.sectionTitle}>الخدمات</Text>
                    {detailLoading ? <ActivityIndicator color={P.ink} /> : services.length === 0 ? (
                      <Text style={s.emptyInline}>لم يُضف المحامي خدمات محددة بعد. أرسل طلب استشارة عامة.</Text>
                    ) : services.map(svc => (
                      <View key={svc.id} style={s.svcCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.svcTitle}>{svc.title}</Text>
                          {!!svc.description && <Text style={s.svcDesc}>{svc.description}</Text>}
                          {((showPricing && !!svc.price_text) || !!svc.duration) && (
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                              {showPricing && !!svc.price_text && <View style={s.svcChip}><Ionicons name="cash-outline" size={12} color={Colors.textSecondary} /><Text style={s.svcChipText}>{svc.price_text}</Text></View>}
                              {!!svc.duration && <View style={s.svcChip}><Ionicons name="time-outline" size={12} color={Colors.textSecondary} /><Text style={s.svcChipText}>{svc.duration}</Text></View>}
                            </View>
                          )}
                        </View>
                        <Pressable onPress={() => openRequest(svc, selected)} style={s.contractBtn} accessibilityRole="button" accessibilityLabel={`طلب ${svc.title}`}>
                          <Text style={s.contractBtnText}>اطلب</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>

                  {/* المراجعات */}
                  <View style={s.section}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <Text style={[s.sectionTitle, { marginBottom: 0 }]}>المراجعات</Text>
                      <Pressable onPress={() => setRateOpen(true)} style={s.linkBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="قيّم المحامي">
                        <Ionicons name="star-outline" size={15} color={P.gold} /><Text style={s.linkBtnText}>قيّم المحامي</Text>
                      </Pressable>
                    </View>
                    {reviews.length === 0 ? <Text style={s.emptyInline}>لا توجد مراجعات بعد.</Text> : reviews.slice(0, 8).map(r => (
                      <View key={r.id} style={s.reviewCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={s.reviewName}>{r.user_name}</Text>
                          <Stars value={r.rating} size={12} />
                        </View>
                        {!!r.comment && <Text style={s.reviewText}>{r.comment}</Text>}
                      </View>
                    ))}
                  </View>

                  <Pressable onPress={() => printLawyerCard(selected, services)} style={[s.outlineBtn, { marginTop: 16 }]}
                    accessibilityRole="button" accessibilityLabel="طباعة بطاقة المحامي">
                    <Ionicons name="print-outline" size={16} color={P.ink} /><Text style={s.outlineBtnText}>طباعة بطاقة المحامي</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ Request Modal ═══ */}
      <Modal visible={!!contractFor} animationType="fade" onRequestClose={() => setContractFor(null)} transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay2}>
          <View style={[s.contractModal, RTL]}>
            <View style={s.contractHeader}>
              <MaterialCommunityIcons name="scale-balance" size={20} color={P.ink} />
              <Text style={s.contractTitle}>{contractFor?.title}{reqLawyer ? ` — ${reqLawyer.full_name}` : ""}</Text>
            </View>
            <Text style={s.contractSubt}>يصل طلبك إلى المحامي ويتواصل معك لتأكيد التفاصيل والموعد. تابع حالته من «تعاقداتي».</Text>

            <Field label="الاسم *" value={contract.name} onChange={(v: string) => setContract(c => ({ ...c, name: v }))} placeholder="اسمك الكامل" />
            <Field label="رقم الهاتف *" value={contract.phone} onChange={(v: string) => setContract(c => ({ ...c, phone: v }))} placeholder="09xxxxxxxx" keyboardType="phone-pad" />
            <Field label="الموعد المناسب (اختياري)" value={contract.date} onChange={(v: string) => setContract(c => ({ ...c, date: v }))} placeholder="مثال: 2026-11-10" />
            <Field label="وصف موجز للقضية" value={contract.details} onChange={(v: string) => setContract(c => ({ ...c, details: v }))} placeholder="ما الذي حدث، وما المطلوب من المحامي؟" multiline />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setContractFor(null)} style={s.cancelBtn} accessibilityRole="button"><Text style={s.cancelBtnText}>إلغاء</Text></Pressable>
              <Pressable onPress={submitContract} disabled={submitting} style={[s.submitBtn, submitting && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="إرسال الطلب">
                {submitting ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="send" size={14} color="#fff" style={{ transform: [{ scaleX: -1 }] }} /><Text style={s.submitBtnText}>إرسال الطلب</Text></>)}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Rights Guide ═══ */}
      <Modal visible={rightsOpen} animationType="slide" transparent onRequestClose={() => setRightsOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, RTL]}>
            <View style={s.modalHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={s.svcTileIcon}><MaterialCommunityIcons name="shield-check-outline" size={20} color={P.ink} /></View>
              <Text style={[s.detailName, { flex: 1 }]}>اعرف حقوقك</Text>
              <Pressable onPress={() => setRightsOpen(false)} style={s.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="إغلاق">
                <Ionicons name="close" size={20} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30, gap: 10 }}>
              {RIGHTS_GUIDE.map(g => (
                <View key={g.title} style={s.rightsCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <MaterialCommunityIcons name={g.icon as any} size={18} color={P.gold} />
                    <Text style={s.rightsTitle}>{g.title}</Text>
                  </View>
                  {g.points.map((pt, i) => <Text key={i} style={s.rightsPoint}>• {pt}</Text>)}
                </View>
              ))}
              <Text style={s.rightsNote}>معلومات توعوية عامة، وليست استشارة قانونية. لكل حالة تفاصيلها، فاستشر محامياً مرخّصاً.</Text>
              <Pressable onPress={() => { setRightsOpen(false); setTab("directory"); }} style={[s.submitBtn, { flex: 0 }]} accessibilityRole="button">
                <MaterialCommunityIcons name="account-tie" size={16} color="#fff" /><Text style={s.submitBtnText}>اختر محامياً للاستشارة</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ Rate Modal ═══ */}
      <Modal visible={rateOpen} animationType="fade" transparent onRequestClose={() => setRateOpen(false)}>
        <View style={s.modalOverlay2}>
          <View style={[s.rateModal, RTL]}>
            <Text style={s.rateTitle}>تقييم {selected?.full_name}</Text>
            <View style={{ marginVertical: 18 }}><StarPicker value={rateValue} onChange={setRateValue} /></View>
            <TextInput
              style={s.rateInput} placeholder="اكتب رأيك (اختياري)" placeholderTextColor={Colors.textMuted}
              value={rateComment} onChangeText={setRateComment} multiline maxLength={500} accessibilityLabel="تعليق التقييم"
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setRateOpen(false)} style={s.cancelBtn} accessibilityRole="button"><Text style={s.cancelBtnText}>إلغاء</Text></Pressable>
              <Pressable onPress={submitRating} style={s.submitBtn} accessibilityRole="button" accessibilityLabel="إرسال التقييم">
                <Ionicons name="star" size={14} color="#fff" /><Text style={s.submitBtnText}>إرسال التقييم</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── components ─────────────────────────────────────────────────────────────
function Avatar({ lw, size = 56 }: { lw: Lawyer; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {lw.photo_url && !broken
        ? <Image source={{ uri: lw.photo_url }} style={{ width: "100%", height: "100%" }} onError={() => setBroken(true)} accessibilityLabel={`صورة ${lw.full_name}`} />
        : <Text style={[s.avatarText, { fontSize: size * 0.32 }]}>{initials(lw.full_name)}</Text>}
    </View>
  );
}
function VerifiedBadge() {
  return (
    <View style={s.verified} accessibilityLabel="محامٍ موثّق">
      <MaterialCommunityIcons name="check-decagram" size={13} color={P.green} />
      <Text style={s.verifiedText}>موثّق</Text>
    </View>
  );
}
function LawyerCard({ lw, showPricing, onOpen, onConsult, onCall, onWhatsApp }: {
  lw: Lawyer; showPricing: boolean; onOpen: () => void; onConsult: () => void; onCall: () => void; onWhatsApp?: () => void;
}) {
  const specs = splitSpecs(lw.specialties);
  const plan = showPricing && lw.plan_name && lw.plan_name !== "free" ? lw.plan_name_ar : null;
  return (
    <View style={s.lawyerCard}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`ملف ${lw.full_name}`} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        <View style={s.lawyerHead}>
          <Avatar lw={lw} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={s.lawyerName} numberOfLines={1}>{lw.full_name}</Text>
              {lw.is_verified && <VerifiedBadge />}
            </View>
            <Text style={s.lawyerTitle} numberOfLines={1}>{lw.title}</Text>
            <View style={s.metaRow}>
              {lw.experience_y > 0 && (
                <View style={s.metaItem}><Ionicons name="ribbon-outline" size={13} color={Colors.textMuted} /><Text style={s.lawyerMeta}>{lw.experience_y} سنة خبرة</Text></View>
              )}
              <View style={s.metaItem}><Ionicons name="location-outline" size={13} color={Colors.textMuted} /><Text style={s.lawyerMeta} numberOfLines={1}>{lw.district || "الحصاحيصا"}</Text></View>
              {lw.review_count > 0 && (
                <View style={s.metaItem}><Ionicons name="star" size={13} color={P.star} /><Text style={s.lawyerMeta}>{lw.avg_rating.toFixed(1)} ({lw.review_count})</Text></View>
              )}
              <ViewCount kind="lawyer" id={String(lw.id)} size={12} />
            </View>
          </View>
          {(lw.is_featured || plan) && (
            <View style={s.featBadge}><Text style={s.featBadgeText}>{plan || "مميّز"}</Text></View>
          )}
        </View>
        {specs.length > 0 && (
          <View style={[s.specWrap, { marginTop: 10 }]}>
            {specs.slice(0, 3).map(sp => <View key={sp} style={s.specChip}><Text style={s.specChipText}>{sp}</Text></View>)}
            {specs.length > 3 && <View style={s.specChip}><Text style={s.specChipText}>+{specs.length - 3}</Text></View>}
          </View>
        )}
        {showPricing && !!lw.consult_fee && <Text style={s.lawyerFee} numberOfLines={1}>{lw.consult_fee}</Text>}
      </Pressable>
      <View style={s.cardActions}>
        <Pressable onPress={onConsult} style={[s.cardBtn, s.cardBtnPrimary]} accessibilityRole="button" accessibilityLabel={`طلب استشارة من ${lw.full_name}`}>
          <MaterialCommunityIcons name="scale-balance" size={16} color="#fff" /><Text style={s.cardBtnPrimaryText}>استشارة</Text>
        </Pressable>
        {!!lw.phone && (
          <Pressable onPress={onCall} style={s.cardBtn} accessibilityRole="button" accessibilityLabel={`اتصال بـ ${lw.full_name}`}>
            <Ionicons name="call-outline" size={16} color={P.green} /><Text style={s.cardBtnText}>اتصال</Text>
          </Pressable>
        )}
        {onWhatsApp && (
          <Pressable onPress={onWhatsApp} style={s.cardBtn} accessibilityRole="button" accessibilityLabel={`واتساب ${lw.full_name}`}>
            <Ionicons name="logo-whatsapp" size={16} color={P.wa} /><Text style={s.cardBtnText}>واتساب</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
function SkeletonCard({ compact }: { compact?: boolean }) {
  return (
    <View style={[s.lawyerCard, { gap: 10 }]} accessibilityLabel="جارٍ التحميل">
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        {!compact && <View style={[s.skel, { width: 56, height: 56, borderRadius: 28 }]} />}
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[s.skel, { width: "60%", height: 14 }]} />
          <View style={[s.skel, { width: "40%", height: 12 }]} />
        </View>
      </View>
      <View style={[s.skel, { width: "85%", height: 12 }]} />
      {!compact && <View style={[s.skel, { width: "100%", height: 40, borderRadius: 12 }]} />}
    </View>
  );
}
function EmptyState({ icon, title, body, action, onAction }: { icon: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.centerBox}>
      <View style={s.emptyIcon}><MaterialCommunityIcons name={icon as any} size={34} color={P.ink} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!body && <Text style={s.emptyText}>{body}</Text>}
      {!!action && onAction && (
        <Pressable onPress={onAction} style={[s.primaryBtn, { paddingHorizontal: 22, alignSelf: "center" }]} accessibilityRole="button">
          <Text style={s.primaryBtnText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}
function InfoLine({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.infoLine}>
      <Ionicons name={icon} size={15} color={Colors.textMuted} />
      <Text style={s.infoLineLabel}>{label}</Text>
      <Text style={s.infoLineValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}
function Field({ label, value, onChange, placeholder, multiline, keyboardType }: any) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, multiline && { height: 88, textAlignVertical: "top", paddingTop: 10 }]}
        placeholder={placeholder} placeholderTextColor={Colors.textMuted} accessibilityLabel={label.replace(" *", "")}
        value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType}
      />
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────
const F = { r: "Cairo_400Regular", s: "Cairo_600SemiBold", b: "Cairo_700Bold" } as const;
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // تبويبات على الرأس الأخضر: مسار داكن شفاف + نص أبيض، والنشط أبيض صلب بنص كحلي
  tabsRow: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.24)", borderRadius: Colors.radius.md, padding: 4, gap: 4 },
  tabBtn: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: Colors.radius.sm },
  tabBtnActive: { backgroundColor: "#FFFFFF" },
  tabLabel: { fontFamily: F.b, fontSize: 13, color: "#FFFFFF" },
  tabLabelActive: { color: NAVY },

  adCard: { width: 272, padding: 12, borderRadius: Colors.radius.md, borderWidth: 1, backgroundColor: Colors.cardBg },
  adBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, backgroundColor: P.iconBg },
  adBadgeText: { color: P.gold, fontSize: 12, fontFamily: F.b },
  adTitle: { fontFamily: F.b, color: Colors.text, fontSize: 14, marginTop: 6, textAlign: "right" },
  adBody: { fontFamily: F.r, color: Colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18, textAlign: "right" },
  adCtaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 8 },
  adCta: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, minHeight: 36, borderRadius: 10, backgroundColor: P.greenBtn },
  adCtaText: { color: "#fff", fontSize: 12, fontFamily: F.b },
  adAuthor: { color: Colors.textMuted, fontSize: 12, fontFamily: F.r, flex: 1, textAlign: "left" },

  svcHub: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  svcHubTitle: { fontFamily: F.b, fontSize: 15, color: Colors.text, textAlign: "right" },
  svcHubSub: { fontFamily: F.r, fontSize: 12, color: Colors.textMuted, textAlign: "right", marginBottom: 10 },
  svcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  svcTile: { width: "31%", flexGrow: 1, minHeight: 96, alignItems: "center", gap: 5, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, backgroundColor: P.soft, borderWidth: 1, borderColor: P.softBorder },
  svcTileOn: { borderColor: P.gold, borderWidth: 1.5 },
  svcTileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: P.iconBg, alignItems: "center", justifyContent: "center" },
  svcTileText: { fontFamily: F.s, fontSize: 12, color: Colors.text, textAlign: "center", lineHeight: 17 },
  svcTileCount: { fontFamily: F.r, fontSize: 12, color: Colors.textMuted },

  joinBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: P.btn, padding: 14, borderRadius: Colors.radius.md, marginBottom: 14, minHeight: 64 },
  joinIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  joinTitle: { color: "#fff", fontFamily: F.b, fontSize: 14, textAlign: "right" },
  joinSub: { color: "#E8ECF5", fontFamily: F.r, fontSize: 12, marginTop: 2, textAlign: "right", lineHeight: 18 },

  planCard: { minWidth: 120, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 2 },
  planDot: { width: 10, height: 10, borderRadius: 5 },
  planName: { fontFamily: F.b, fontSize: 13, color: Colors.text },
  planPrice: { fontFamily: F.r, fontSize: 12, color: Colors.textSecondary, textAlign: "center" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: Colors.borderStrong },
  searchInput: { flex: 1, color: Colors.text, fontFamily: F.r, fontSize: 14, paddingVertical: 0, textAlign: "right" },
  chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: "center", borderRadius: Colors.radius.pill, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderStrong },
  chipActive: { backgroundColor: P.activeBg, borderColor: P.activeBg },
  chipText: { color: Colors.textSecondary, fontFamily: F.s, fontSize: 13 },
  chipTextActive: { color: P.activeFg },

  resultsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  resultsText: { fontFamily: F.b, fontSize: 13, color: Colors.textSecondary },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  clearText: { fontFamily: F.b, fontSize: 12, color: P.gold },

  lawyerCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, marginHorizontal: 14, marginVertical: 6, borderWidth: 1, borderColor: Colors.border, ...Colors.shadow.card },
  lawyerHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  avatar: { backgroundColor: DARK ? "#26352E" : "#E9EDF5", borderWidth: 1.5, borderColor: P.gold, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontFamily: F.b, color: P.ink },
  lawyerName: { fontFamily: F.b, color: Colors.text, fontSize: 15, flexShrink: 1, textAlign: "right" },
  lawyerTitle: { fontFamily: F.r, color: P.gold, fontSize: 13, marginTop: 1, textAlign: "right" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 2, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  lawyerMeta: { color: Colors.textMuted, fontFamily: F.r, fontSize: 12 },
  featBadge: { alignSelf: "flex-start", backgroundColor: P.iconBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  featBadgeText: { color: P.gold, fontFamily: F.b, fontSize: 12 },
  verified: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: DARK ? "rgba(110,231,183,0.12)" : "rgba(4,120,87,0.10)" },
  verifiedText: { fontFamily: F.b, fontSize: 12, color: P.green },
  specWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  specChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Colors.radius.pill, backgroundColor: P.soft, borderWidth: 1, borderColor: P.softBorder },
  specChipText: { fontFamily: F.s, fontSize: 12, color: Colors.textSecondary },
  lawyerFee: { color: P.green, fontFamily: F.b, fontSize: 12, marginTop: 8, textAlign: "right" },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  cardBtn: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.cardBg },
  cardBtnText: { fontFamily: F.b, fontSize: 13, color: Colors.text },
  cardBtnPrimary: { flex: 1.3, backgroundColor: P.btn, borderColor: P.btn },
  cardBtnPrimaryText: { fontFamily: F.b, fontSize: 13, color: "#fff" },
  skel: { backgroundColor: P.skeleton, borderRadius: 6 },

  centerBox: { paddingVertical: 48, paddingHorizontal: 28, alignItems: "center", gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: P.iconBg, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { color: Colors.text, fontFamily: F.b, fontSize: 15, textAlign: "center" },
  emptyText: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 13, textAlign: "center", lineHeight: 20 },

  rightsCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border, borderRightWidth: 3, borderRightColor: P.gold },
  rightsTitle: { fontFamily: F.b, fontSize: 14, color: Colors.text, textAlign: "right", flex: 1 },
  rightsPoint: { fontFamily: F.r, fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  rightsNote: { fontFamily: F.r, fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 18, marginTop: 4 },

  formsHero: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: NAVY, borderRadius: Colors.radius.lg, padding: 14, borderWidth: 1, borderColor: "#B08D3C" },
  formsHeroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(176,141,60,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B08D3C" },
  formsHeroTitle: { color: "#F6F1E4", fontFamily: F.b, fontSize: 15, textAlign: "right" },
  formsHeroSub: { color: "#E2D9C3", fontFamily: F.r, fontSize: 12, lineHeight: 18, textAlign: "right", marginTop: 2 },
  paperCard: { backgroundColor: P.paper, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: P.paperBorder, borderRightWidth: 4, borderRightColor: "#B08D3C", ...Colors.shadow.card },
  paperActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: P.paperBorder, borderStyle: "dashed" },
  paperHint: { fontFamily: F.r, fontSize: 12, color: Colors.textMuted },
  formIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: P.iconBg, alignItems: "center", justifyContent: "center" },
  formTitle: { color: Colors.text, fontFamily: F.b, fontSize: 14, textAlign: "right" },
  officialBadge: { borderColor: P.green, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 0, borderRadius: 6 },
  officialBadgeText: { color: P.green, fontFamily: F.b, fontSize: 12 },
  formCat: { color: P.gold, fontFamily: F.s, fontSize: 12 },
  formDesc: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 12, marginTop: 4, lineHeight: 18, textAlign: "right" },
  printBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: P.btn, paddingHorizontal: 14, minHeight: 40, borderRadius: Colors.radius.sm },
  printBtnText: { color: "#fff", fontFamily: F.b, fontSize: 13 },

  contractCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  contractTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  contractNo: { color: Colors.textMuted, fontFamily: F.s, fontSize: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 1, borderRadius: 14, borderWidth: 1 },
  statusPillText: { fontFamily: F.b, fontSize: 12 },
  contractLawyer: { color: Colors.text, fontFamily: F.b, fontSize: 15, textAlign: "right" },
  contractSvc: { color: P.gold, fontFamily: F.s, fontSize: 13, marginTop: 2, textAlign: "right" },
  contractMeta: { color: Colors.textMuted, fontFamily: F.r, fontSize: 12 },
  contractActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  miniBtn: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong },
  miniBtnText: { fontFamily: F.b, fontSize: 13, color: Colors.text },
  noteBox: { marginTop: 8, padding: 10, backgroundColor: P.soft, borderRadius: 10 },
  noteTitle: { fontFamily: F.s, fontSize: 12, textAlign: "right" },
  noteText: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 12, marginTop: 2, textAlign: "right" },
  contractsSectionTitle: { color: Colors.text, fontFamily: F.b, fontSize: 14, marginBottom: 8, paddingRight: 8, borderRightWidth: 3, borderRightColor: P.gold, textAlign: "right" },
  primaryBtn: { marginTop: 10, minHeight: 44, backgroundColor: P.btn, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#fff", fontFamily: F.b, fontSize: 13 },
  outlineBtn: { marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  outlineBtnText: { color: Colors.text, fontFamily: F.b, fontSize: 13 },

  // detail modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, paddingHorizontal: 16, paddingTop: 8, maxHeight: "92%", borderWidth: 1, borderColor: Colors.border },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong, alignSelf: "center", marginBottom: 12 },
  detailHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailName: { fontFamily: F.b, color: Colors.text, fontSize: 17, flexShrink: 1, textAlign: "right" },
  detailTitle: { fontFamily: F.r, color: P.gold, fontSize: 13, marginTop: 2, textAlign: "right" },
  detailMeta: { color: Colors.textMuted, fontFamily: F.r, fontSize: 12 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  quickBtn: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12 },
  quickBtnText: { color: "#fff", fontFamily: F.b, fontSize: 14 },
  quickBtnOutline: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.cardBg },
  quickBtnOutlineText: { color: Colors.text, fontFamily: F.b, fontSize: 14 },

  licenseBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, padding: 12, marginTop: 14, borderWidth: 1, borderColor: Colors.border },
  licenseLabel: { fontFamily: F.r, fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  licenseValue: { fontFamily: F.b, fontSize: 15, color: Colors.text, textAlign: "right", letterSpacing: 0.5 },
  licenseNote: { fontFamily: F.s, fontSize: 12, textAlign: "right" },

  infoBox: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, paddingHorizontal: 12, marginTop: 14, borderWidth: 1, borderColor: Colors.border },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLineLabel: { color: Colors.textMuted, fontFamily: F.r, fontSize: 12, width: 64, textAlign: "right" },
  infoLineValue: { color: Colors.text, fontFamily: F.s, fontSize: 13, flex: 1, textAlign: "right" },
  bioText: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 14, lineHeight: 22, textAlign: "right" },

  section: { marginTop: 18 },
  sectionTitle: { color: Colors.text, fontFamily: F.b, fontSize: 15, marginBottom: 10, textAlign: "right" },
  emptyInline: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 13, textAlign: "right" },

  svcCard: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  svcTitle: { color: Colors.text, fontFamily: F.b, fontSize: 14, textAlign: "right" },
  svcDesc: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 12, marginTop: 3, lineHeight: 18, textAlign: "right" },
  svcChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: P.soft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  svcChipText: { color: Colors.textSecondary, fontFamily: F.s, fontSize: 12 },
  contractBtn: { minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center", backgroundColor: P.btn, paddingHorizontal: 14, borderRadius: 12 },
  contractBtnText: { color: "#fff", fontFamily: F.b, fontSize: 13 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  linkBtnText: { color: P.gold, fontFamily: F.b, fontSize: 13 },

  reviewCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.sm, padding: 11, marginBottom: 7, borderWidth: 1, borderColor: Colors.border },
  reviewName: { color: Colors.text, fontFamily: F.b, fontSize: 13 },
  reviewText: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 13, marginTop: 4, lineHeight: 19, textAlign: "right" },

  // request & rate modals
  modalOverlay2: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  contractModal: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 18, borderWidth: 1, borderColor: Colors.border },
  contractHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  contractTitle: { color: Colors.text, fontFamily: F.b, fontSize: 15, flex: 1, textAlign: "right" },
  contractSubt: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 12, marginTop: 6, lineHeight: 18, textAlign: "right" },
  fieldLabel: { color: Colors.textSecondary, fontFamily: F.s, fontSize: 12, marginBottom: 5, textAlign: "right" },
  fieldInput: { backgroundColor: Colors.bg, borderRadius: Colors.radius.sm, paddingHorizontal: 12, height: 46, color: Colors.text, fontFamily: F.r, fontSize: 14, borderWidth: 1, borderColor: Colors.borderStrong, textAlign: "right" },
  cancelBtn: { flex: 1, minHeight: 46, justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: "center" },
  cancelBtnText: { color: Colors.text, fontFamily: F.b, fontSize: 14 },
  submitBtn: { flex: 1.4, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, backgroundColor: P.btn },
  submitBtnText: { color: "#fff", fontFamily: F.b, fontSize: 14 },

  rateModal: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 22, borderWidth: 1, borderColor: Colors.border },
  rateTitle: { color: Colors.text, fontFamily: F.b, fontSize: 15, textAlign: "center" },
  rateInput: { backgroundColor: Colors.bg, borderRadius: Colors.radius.sm, padding: 12, color: Colors.text, fontFamily: F.r, fontSize: 14, borderWidth: 1, borderColor: Colors.borderStrong, height: 88, textAlignVertical: "top", textAlign: "right" },

  // join modal
  joinHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  joinHeadIcon: { width: 56, height: 56, borderRadius: Colors.radius.md, backgroundColor: P.btn, alignItems: "center", justifyContent: "center" },
  joinSectionTitle: { color: Colors.text, fontFamily: F.b, fontSize: 14, marginTop: 18, marginBottom: 4, paddingRight: 8, borderRightWidth: 3, borderRightColor: P.gold, textAlign: "right" },
  uploadBox: { borderWidth: 1, borderColor: Colors.border, backgroundColor: P.soft, borderRadius: 14, padding: 12, gap: 8, marginTop: 10 },
  uploadHelp: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 13, lineHeight: 18, textAlign: "right" },
  uploadBtn: { minHeight: 44, borderRadius: 12, backgroundColor: P.btn, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  uploadBtnOk: { backgroundColor: P.greenBtn },
  uploadBtnWarn: { backgroundColor: "#B45309" },
  uploadBtnText: { color: "#fff", fontFamily: F.b, fontSize: 13 },
  uploadFileName: { color: Colors.text, fontFamily: F.s, fontSize: 12, textAlign: "right" },
  uploadWarn: { color: P.amber, fontFamily: F.s, fontSize: 12, textAlign: "right", lineHeight: 17 },
  termsBox: { backgroundColor: P.soft, borderRadius: Colors.radius.md, padding: 14, marginTop: 16, borderWidth: 1, borderColor: P.softBorder },
  termsTitle: { color: Colors.text, fontFamily: F.b, fontSize: 14, marginBottom: 8, textAlign: "right" },
  termsText: { color: Colors.textSecondary, fontFamily: F.r, fontSize: 13, lineHeight: 22, textAlign: "right" },
  agreeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 10, minHeight: 48, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: Colors.border },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: P.ink, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: P.btn, borderColor: P.btn },
  agreeText: { color: Colors.text, fontFamily: F.s, fontSize: 13, flex: 1, textAlign: "right" },
});

export default withRTLScreen(LawyersScreen);
