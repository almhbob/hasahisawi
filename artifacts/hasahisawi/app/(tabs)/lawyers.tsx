import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Alert, Platform, ActivityIndicator, Pressable, Linking,
  KeyboardAvoidingView, Image,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { fetch } from "@/lib/net-fetch";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
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

const LEGAL_SERVICES: { title: string; icon: string; spec: string }[] = [
  { title: "أحوال شخصية وأسرة", icon: "account-group-outline", spec: "أحوال شخصية" },
  { title: "عقارات وإيجارات", icon: "home-city-outline", spec: "عقارات" },
  { title: "صياغة العقود", icon: "file-sign", spec: "عقود" },
  { title: "قضايا جنائية", icon: "gavel", spec: "جنائية" },
  { title: "العمل والعمّال", icon: "briefcase-account-outline", spec: "عمل" },
  { title: "شركات وتجارة", icon: "domain", spec: "تجارية" },
  { title: "تحكيم وفضّ نزاعات", icon: "scale-balance", spec: "تحكيم" },
  { title: "اعرف حقوقك", icon: "shield-check-outline", spec: "rights" },
  { title: "استمارات جاهزة", icon: "file-document-multiple-outline", spec: "forms" },
];

const RIGHTS_GUIDE: { title: string; icon: string; points: string[] }[] = [
  { title: "قبل توقيع أي عقد", icon: "file-sign", points: ["اقرأ جميع البنود كاملة قبل التوقيع، ولا توقّع على ورقة فيها فراغات.", "تأكّد من هوية الطرف الآخر وصفته في التعاقد.", "احصل على نسخة موقّعة من العقد واحتفظ بها في مكان آمن.", "إذا كان المبلغ كبيراً فاستشر محامياً قبل التوقيع."] },
  { title: "عقود الإيجار", icon: "home-outline", points: ["وثّق الإيجار كتابةً مع تحديد المدة والأجرة وموعد الدفع.", "اتفق كتابةً على مبلغ التأمين وشروط استرداده.", "احتفظ بإيصالات كل دفعة، ويفضَّل التحويل البنكي.", "سجّل حالة العقار عند الاستلام بالصور."] },
  { title: "الشيكات والديون", icon: "cash-check", points: ["لا تحرّر شيكاً بلا رصيد كافٍ — قد يعرّضك ذلك لمساءلة قانونية.", "احتفظ بصورة من أي شيك تحرّره أو تستلمه.", "وثّق أي دين بإقرار مكتوب وموقّع وبحضور شهود."] },
  { title: "حقوق العامل", icon: "briefcase-outline", points: ["احتفظ بنسخة من عقد العمل وكشوف المرتب.", "لا توقّع على مخالصة نهائية قبل التأكد من استلام كامل مستحقاتك.", "وثّق الإنذارات والخطابات الرسمية بتواريخها."] },
  { title: "الميراث والتركات", icon: "family-tree", points: ["ابدأ باستخراج الإعلام الشرعي من المحكمة المختصة قبل التصرف في التركة.", "حصر أموال التركة وديونها كتابةً بحضور الورثة.", "النزاع بين الورثة يُحسم ودياً أو أمام المحكمة — استشر محامياً مختصاً."] },
  { title: "عند الاستدعاء أو القبض", icon: "shield-account-outline", points: ["من حقك معرفة سبب الاستدعاء أو القبض.", "من حقك الاستعانة بمحامٍ والتواصل مع أسرتك.", "لا توقّع على أقوال لم تقرأها أو لم تفهمها."] },
];

const SPECIALTIES = ["الكل","تجارية","عقارات","شركات","أحوال شخصية","ميراث","نفقة","حضانة","جنائية","عمل","تحكيم","عقود"];

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
  pending:     { label: "قيد المراجعة", color: "#F59E0B" },
  accepted:    { label: "مقبول",         color: "#3B82F6" },
  in_progress: { label: "قيد التنفيذ",  color: "#14213D" },
  completed:   { label: "مكتمل",         color: "#10B981" },
  rejected:    { label: "مرفوض",         color: "#EF4444" },
  cancelled:   { label: "ملغي",          color: "#6B7280" },
  approved:    { label: "مقبول ✓",       color: "#10B981" },
};

// ─── Star ─────────────────────────────────────────────────────────────────────
function Stars({ value, size = 13, color = "#F59E0B" }: { value: number; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1,2,3,4,5].map(s => (
        <Ionicons key={s} name={s <= Math.round(value) ? "star" : "star-outline"} size={size}
          color={s <= Math.round(value) ? color : "#D6CFC0"} />
      ))}
    </View>
  );
}
function StarPicker({ value, onChange }: { value: number; onChange: (v:number)=>void }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
      {[1,2,3,4,5].map(s => (
        <Pressable key={s} onPress={() => { onChange(s); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
          <Ionicons name={s <= value ? "star" : "star-outline"} size={42} color={s <= value ? "#F59E0B" : "#D6CFC0"} />
        </Pressable>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//                                MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function LawyersScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"directory" | "forms" | "contracts">("directory");

  // shared
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  // directory
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [ads, setAds] = useState<LawyerAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("الكل");
  const [selected, setSelected] = useState<Lawyer | null>(null);

  // detail
  const [services, setServices] = useState<LawyerService[]>([]);
  const [reviews, setReviews]   = useState<LawyerReview[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // contract modal
  const [contractFor, setContractFor] = useState<LawyerService | null>(null);
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
    setLoading(true);
    try {
      const [lr, ar] = await Promise.all([
        apiFetch(`/api/lawyers${filter !== "الكل" ? `?specialty=${encodeURIComponent(filter)}` : ""}${search ? `${filter !== "الكل" ? "&" : "?"}search=${encodeURIComponent(search)}` : ""}`),
        apiFetch(`/api/lawyer-ads`),
      ]);
      if (lr.ok) setLawyers(await lr.json());
      if (ar.ok) setAds(await ar.json());
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [filter, search]);

  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    try { const r = await apiFetch(`/api/legal-forms`); if (r.ok) setForms(await r.json()); }
    catch {} finally { setFormsLoading(false); }
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
      Alert.alert("✅ تم استلام طلبك", "ستتم مراجعة طلب التعاقد من قبل الإدارة. تابع الحالة من تبويب \"تعاقداتي\".");
      setJoinOpen(false); setAppForm(EMPTY_APP); loadMyContracts();
      setTab("contracts");
    } catch (e: any) {
      Alert.alert("تعذّر إرسال الطلب", e?.message || "حاول لاحقاً");
    } finally { setJoinSubmitting(false); }
  };

  useFocusEffect(useCallback(() => { loadDirectory(); }, [loadDirectory]));
  useEffect(() => { if (tab === "forms")     loadForms();       }, [tab, loadForms]);
  useEffect(() => { if (tab === "contracts") loadMyContracts(); }, [tab, loadMyContracts]);

  const openLawyer = useCallback(async (lw: Lawyer) => {
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
    if (!selected) return;
    if (!contract.name.trim() || !contract.phone.trim()) {
      Alert.alert("بيانات ناقصة", "الرجاء إدخال الاسم ورقم الهاتف"); return;
    }
    setSubmitting(true);
    try {
      const r = await apiFetch(`/api/lawyers/${selected.id}/contracts`, {
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
      Alert.alert("✅ تم إرسال الطلب", `سيتواصل معك المحامي قريباً.\nيمكنك متابعة الطلب من تبويب "تعاقداتي".`);
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
      Alert.alert("✅ شكراً لك", "تم تسجيل تقييمك");
      setRateOpen(false); setRateComment(""); setRateValue(5);
      openLawyer(selected); // إعادة تحميل
      loadDirectory();
    } catch { Alert.alert("خطأ", "تعذّر إرسال التقييم"); }
  };

  // ── طباعة بطاقة المحامي ──
  const printLawyerCard = async (lw: Lawyer, svcs: LawyerService[]) => {
    const svcRows = svcs.map((sv, i) => `<tr><td>${i + 1}</td><td class="r"><b>${esc(sv.title)}</b>${sv.description ? `<br/><small>${esc(sv.description)}</small>` : ""}</td><td>${esc(sv.price_text || "—")}</td><td>${esc(sv.duration || "—")}</td></tr>`).join("");
    const html = paperDocument({
      theme: "legal", title: lw.full_name, subtitle: `${lw.title}${lw.is_verified ? " · موثّق ✓" : ""}`, ref: lw.bar_number ? `نقابة ${lw.bar_number}` : undefined,
      bodyHtml: `<div class="box kv">
          <div>التخصصات: <b>${esc(lw.specialties)}</b></div><div>الخبرة: <b>${lw.experience_y} سنة</b></div>
          <div>الهاتف: <b>${esc(lw.phone || "—")}</b></div><div>العنوان: <b>${esc(lw.office_addr || lw.district || "—")}</b></div>
          <div>اللغات: <b>${esc(lw.languages || "—")}</b></div><div>رسوم الاستشارة: <b>${esc(lw.consult_fee || "—")}</b></div>
          <div>التقييم: <b>${Number(lw.avg_rating || 0).toFixed(1)} / 5 (${lw.review_count} مراجعة)</b></div></div>
        ${lw.bio ? `<h2>نبذة</h2><p>${esc(lw.bio)}</p>` : ""}
        ${svcs.length ? `<h2>الخدمات القانونية</h2><table><thead><tr><th>#</th><th class="r">الخدمة</th><th>الأتعاب</th><th>المدة</th></tr></thead><tbody>${svcRows}</tbody></table>` : ""}`,
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
    const status = STATUS_AR[c.status] || { label: c.status, color: "#666" };
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
  return (
    <View style={s.container}>
      {/* Header */}
      <ModernHeader
        title="الخدمات القانونية"
        subtitle="محامون · استشارات · استمارات"
        showBack
        onBack={() => router.back()}
      >
        {/* Tabs */}
        <View style={s.tabsRow}>
          {[
            { key: "directory" as const, label: "المحامون", icon: "account-tie" as const },
            { key: "forms"     as const, label: "الاستمارات", icon: "file-document-outline" as const },
            { key: "contracts" as const, label: "تعاقداتي",  icon: "handshake-outline" as const },
          ].map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
              <MaterialCommunityIcons name={t.icon} size={16} color={tab === t.key ? "#fff" : "#B08D3C"} />
              <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </ModernHeader>

      {/* ── DIRECTORY ── */}
      {tab === "directory" && (
        <FlatList
          data={lawyers}
          keyExtractor={i => String(i.id)}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              {/* بانر إعلاني */}
              {ads.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }} style={{ marginBottom: 12 }}>
                  {ads.map(ad => (
                    <TouchableOpacity key={ad.id} activeOpacity={0.85}
                      onPress={() => ad.cta_phone && Linking.openURL(`tel:${ad.cta_phone}`)}
                      style={[s.adCard, { borderColor: ad.banner_color + "55", backgroundColor: ad.banner_color + "12" }]}>
                      <View style={[s.adBadge, { backgroundColor: ad.banner_color }]}>
                        <Text style={s.adBadgeText}>إعلان</Text>
                      </View>
                      <Text style={s.adTitle} numberOfLines={1}>{ad.title}</Text>
                      <Text style={s.adBody} numberOfLines={2}>{ad.body}</Text>
                      <View style={s.adCtaRow}>
                        <View style={[s.adCta, { backgroundColor: ad.banner_color }]}>
                          <Ionicons name="call" size={12} color="#fff" />
                          <Text style={s.adCtaText}>{ad.cta_text}</Text>
                        </View>
                        {ad.lawyer_name && <Text style={s.adAuthor} numberOfLines={1}>— {ad.lawyer_name}</Text>}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* مركز الخدمات القانونية */}
              <View style={s.svcHub}>
                <Text style={s.svcHubTitle}>بماذا نساعدك اليوم؟</Text>
                <View style={s.svcGrid}>
                  {LEGAL_SERVICES.map(sv => (
                    <Pressable key={sv.title} style={({ pressed }) => [s.svcTile, filter === sv.spec && s.svcTileOn, pressed && { opacity: 0.8 }]}
                      onPress={() => { if (sv.spec === "rights") setRightsOpen(true); else if (sv.spec === "forms") setTab("forms"); else setFilter(f => (f === sv.spec ? "الكل" : sv.spec)); }}>
                      <View style={[s.svcTileIcon, filter === sv.spec && { backgroundColor: "#B08D3C" }]}>
                        <MaterialCommunityIcons name={sv.icon as any} size={20} color={filter === sv.spec ? "#fff" : "#14213D"} />
                      </View>
                      <Text style={s.svcTileText} numberOfLines={2}>{sv.title}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* انضم كمحامي */}
              <TouchableOpacity onPress={() => setJoinOpen(true)} activeOpacity={0.85} style={s.joinBanner}>
                <View style={s.joinIcon}>
                  <MaterialCommunityIcons name="briefcase-plus" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.joinTitle}>هل أنت محامي؟ انضم لقائمتنا</Text>
                  <Text style={s.joinSub}>ابدأ مجاناً · أو اختر خطة مدفوعة لمزيد من المميزات</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>
              {/* بانر الخطط المدمج */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 2, gap: 8 }} style={{ marginHorizontal: -2, marginBottom: 4 }}>
                {[
                  { icon: "🔓", name: "مجاني", sub: "5 تواصلات/شهر", color: "#6B7280" },
                  { icon: "⭐", name: "أساسي",  sub: "500 ج.س · تواصل غير محدود", color: "#3B82F6" },
                  { icon: "💎", name: "محترف", sub: "1,500 ج.س · إعلانات + موثّق", color: "#14213D" },
                  { icon: "👑", name: "بريميوم", sub: "3,000 ج.س · الصدارة + 8%", color: "#F59E0B" },
                ].map(p => (
                  <View key={p.name} style={{ backgroundColor: p.color + "18", borderRadius: Colors.radius.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: p.color + "44", alignItems: "center", minWidth: 110 }}>
                    <Text style={{ fontSize: 18, marginBottom: 2 }}>{p.icon}</Text>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: p.color }}>{p.name}</Text>
                    <Text style={{ fontSize: 9, color: "#6B7280", textAlign: "center", marginTop: 2 }}>{p.sub}</Text>
                  </View>
                ))}
              </ScrollView>

              {/* بحث */}
              <View style={s.searchBox}>
                <Ionicons name="search" size={17} color="#7C7566" />
                <TextInput
                  style={s.searchInput} placeholder="ابحث باسم المحامي أو التخصص أو الحي" placeholderTextColor="#6B7280"
                  value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={loadDirectory}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearch(""); setTimeout(loadDirectory, 100); }}>
                    <Ionicons name="close-circle" size={18} color="#6B7280" />
                  </TouchableOpacity>
                )}
              </View>

              {/* فلاتر */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
                {SPECIALTIES.map(sp => (
                  <Pressable key={sp} onPress={() => setFilter(sp)}
                    style={[s.chip, filter === sp && s.chipActive]}>
                    <Text style={[s.chipText, filter === sp && s.chipTextActive]}>{sp}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
          renderItem={({ item, index }) => {
            const planColor = item.plan_color || "#6B7280";
            const isPremium  = item.plan_name === "premium";
            const isPro      = item.plan_name === "professional";
            const isBasic    = item.plan_name === "basic";
            const hasPlan    = !!item.plan_name && item.plan_name !== "free";
            return (
              <Animated.View entering={FadeInDown.delay(40 * index).springify()}>
                <TouchableOpacity onPress={() => openLawyer(item)} activeOpacity={0.85}
                  style={[s.lawyerCard, isPremium && { borderColor: "#F59E0B", borderWidth: 1.5 }, isPro && { borderColor: "#14213D", borderWidth: 1 }]}>
                  {/* شارة الخطة / مميّز */}
                  <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 5, zIndex: 2 }}>
                    {hasPlan && (
                      <View style={{ backgroundColor: planColor + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: planColor + "66" }}>
                        <Text style={{ fontSize: 11 }}>{item.plan_icon}</Text>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: planColor }}>{item.plan_name_ar}</Text>
                      </View>
                    )}
                    {item.is_featured && !hasPlan && (
                      <View style={s.featBadge}><MaterialCommunityIcons name="star-circle" size={11} color="#FBBF24" /><Text style={s.featBadgeText}>مميّز</Text></View>
                    )}
                  </View>
                  <View style={[s.lawyerHead, hasPlan && { marginTop: 22 }]}>
                    <View style={[s.avatar, hasPlan && { borderWidth: 2, borderColor: planColor + "88" }]}>
                      {item.photo_url ? <Image source={{ uri: item.photo_url }} style={{ width: "100%", height: "100%", borderRadius: Colors.radius.md }} />
                        : <MaterialCommunityIcons name="account-tie" size={28} color={hasPlan ? planColor : "#B08D3C"} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.lawyerName} numberOfLines={1}>{item.full_name}</Text>
                        {item.is_verified && <Ionicons name="checkmark-circle" size={15} color="#0E8A5F" />}
                        {isPremium && <Text style={{ fontSize: 14 }}>👑</Text>}
                        {isPro && !isPremium && <Text style={{ fontSize: 13 }}>💎</Text>}
                        {isBasic && <Text style={{ fontSize: 13 }}>⭐</Text>}
                      </View>
                      <Text style={s.lawyerTitle} numberOfLines={1}>{item.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <Stars value={item.avg_rating} size={12} />
                        <Text style={s.lawyerMeta}>{item.avg_rating.toFixed(1)} ({item.review_count})</Text>
                        <Text style={s.lawyerMeta}>· {item.experience_y} سنة خبرة</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={s.lawyerSpec} numberOfLines={2}>{item.specialties}</Text>
                  <View style={s.lawyerFooter}>
                    <View style={s.lawyerLocPill}>
                      <Ionicons name="location-outline" size={11} color="#7C7566" />
                      <Text style={s.lawyerLocText} numberOfLines={1}>{item.district || "الحصاحيصا"}</Text>
                    </View>
                    <Text style={s.lawyerFee} numberOfLines={1}>{item.consult_fee || "تواصل للتفاصيل"}</Text>
                  </View>
                  {/* شريط أسفل البطاقة للبريميوم */}
                  {isPremium && (
                    <View style={{ marginTop: 8, backgroundColor: "#F59E0B22", borderRadius: 6, padding: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 10, color: "#B45309", fontWeight: "700" }}>👑 محامي بريميوم — أعلى مستوى من الخدمة القانونية</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          }}
          ListEmptyComponent={loading ? (
            <View style={s.centerBox}><ActivityIndicator color="#14213D" /></View>
          ) : (
            <View style={s.centerBox}>
              <MaterialCommunityIcons name="account-search" size={42} color="#D6CFC0" />
              <Text style={s.emptyText}>لا يوجد محامون مطابقون</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshing={loading} onRefresh={loadDirectory}
        />
      )}

      {/* ── FORMS ── */}
      {tab === "forms" && (
        <FlatList
          data={forms.filter(f => (formCat === "الكل" || f.category === formCat) && (!formQ.trim() || `${f.title} ${f.description} ${f.category}`.includes(formQ.trim())))}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 12 }}>
              <View style={s.formsHero}>
                <View style={s.formsHeroIcon}><MaterialCommunityIcons name="file-sign" size={26} color="#B08D3C" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.formsHeroTitle}>الاستمارات والنماذج القانونية</Text>
                  <Text style={s.formsHeroSub}>تُطبع على ورق رسمي منسّق بإطار مزخرف وخانات للتعبئة والتوقيع والختم — أو تُحفظ PDF.</Text>
                </View>
              </View>
              <View style={s.searchBox}>
                <Ionicons name="search" size={17} color="#7C7566" />
                <TextInput style={s.searchInput} placeholder="ابحث عن استمارة: إيجار، توكيل، إقرار…" placeholderTextColor="#7C7566" value={formQ} onChangeText={setFormQ} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {["الكل", ...Array.from(new Set(forms.map(f => f.category).filter(Boolean)))].map(c => (
                  <Pressable key={c} onPress={() => setFormCat(c)} style={[s.chip, formCat === c && s.chipActive]}>
                    <Text style={[s.chipText, formCat === c && s.chipTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
          ListFooterComponent={<OrgInviteCard />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(30 * index).springify()}>
              <Pressable onPress={() => printForm(item.id)} style={({ pressed }) => [s.paperCard, pressed && { opacity: 0.9 }]}>
                <View style={s.paperFold} />
                <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 }}>
                  <View style={s.formIconBox}><MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#14213D" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.formTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 2 }}>
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
                  <Text style={s.paperHint}>PDF · A4 · خانات للتعبئة والتوقيع</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
          ListEmptyComponent={formsLoading
            ? <View style={s.centerBox}><ActivityIndicator color="#14213D" /></View>
            : <View style={s.centerBox}><MaterialCommunityIcons name="file-search-outline" size={40} color="#D6CFC0" /><Text style={s.emptyText}>لا توجد استمارات مطابقة</Text></View>}
        />
      )}

      {/* ── MY CONTRACTS ── */}
      {tab === "contracts" && (
        <FlatList
          data={myContracts} keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          ListHeaderComponent={
            myApps.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={s.contractsSectionTitle}>طلبات انضمامك كمحامي</Text>
                {myApps.map(a => {
                  const st = STATUS_AR[a.status] || { label: a.status, color: "#888" };
                  return (
                    <View key={a.id} style={[s.contractCard, { borderColor: st.color + "55" }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <MaterialCommunityIcons name="briefcase-plus" size={14} color={st.color} />
                          <Text style={s.contractNo}>طلب #{a.id}</Text>
                        </View>
                        <View style={[s.statusPill, { backgroundColor: st.color + "22", borderColor: st.color + "55" }]}>
                          <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Text style={s.contractLawyer}>{a.full_name}</Text>
                      <Text style={s.contractMeta}>قُدّم في {new Date(a.created_at).toLocaleDateString("ar-SD")}</Text>
                      {a.admin_note && (
                        <View style={{ marginTop: 8, padding: 9, backgroundColor: st.color + "11", borderRadius: 8 }}>
                          <Text style={{ color: st.color, fontFamily: "Cairo_600SemiBold", fontSize: 11 }}>ملاحظة الإدارة:</Text>
                          <Text style={{ color: "#4B5563", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 2 }}>{a.admin_note}</Text>
                        </View>
                      )}
                      {a.status === "approved" && (
                        <>
                          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                            <Text style={{ color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 11 }}>تم تفعيل ملفك في قائمة المحامين</Text>
                          </View>
                          <TouchableOpacity onPress={() => router.push("/lawyer-portal")}
                            style={{ marginTop: 10, backgroundColor: "#14213D", borderRadius: Colors.radius.sm, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <Ionicons name="grid-outline" size={16} color="#fff" />
                            <Text style={{ color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 }}>⚖️ بوابتي — لوحة تحكم المحامي</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {a.status !== "rejected" && (
                        <TouchableOpacity onPress={() => printJoinContract(a)} activeOpacity={0.85}
                          style={s.contractDownloadBtn}>
                          <MaterialCommunityIcons name="file-document-outline" size={15} color="#fff" />
                          <Text style={s.contractDownloadText}>
                            {a.status === "approved" ? "تحميل نسخة العقد المعتمد (PDF)" : "عرض / تحميل مسودّة العقد (PDF)"}
                          </Text>
                          <Ionicons name="download-outline" size={14} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {myContracts.length > 0 && <Text style={[s.contractsSectionTitle, { marginTop: 18 }]}>طلبات الخدمات القانونية</Text>}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const st = STATUS_AR[item.status] || { label: item.status, color: "#888" };
            return (
              <Animated.View entering={FadeInDown.delay(30 * index).springify()}>
                <View style={s.contractCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={s.contractNo}>#{item.contract_no}</Text>
                    <View style={[s.statusPill, { backgroundColor: st.color + "22", borderColor: st.color + "55" }]}>
                      <Text style={[s.statusPillText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={s.contractLawyer}>{item.lawyer_name}</Text>
                  <Text style={s.contractSvc}>{item.service_title || "تواصل عام"}</Text>
                  {item.preferred_date && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <Ionicons name="calendar-outline" size={12} color="#7C7566" />
                      <Text style={s.contractMeta}>{item.preferred_date}</Text>
                    </View>
                  )}
                  <View style={s.contractActions}>
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.lawyer_phone}`)} style={[s.miniBtn, { backgroundColor: "#10B981" + "22", borderColor: "#10B981" + "55" }]}>
                      <Ionicons name="call" size={13} color="#10B981" /><Text style={[s.miniBtnText, { color: "#10B981" }]}>اتصال</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push({ pathname: "/client-case-chat", params: { contractId: String(item.id) } })} style={[s.miniBtn, { backgroundColor: "#14213D" + "22", borderColor: "#14213D" + "55" }]}>
                      <Ionicons name="chatbubbles-outline" size={13} color="#14213D" /><Text style={[s.miniBtnText, { color: "#14213D" }]}>دردشة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => printContract(item)} style={[s.miniBtn, { backgroundColor: "#3B82F6" + "22", borderColor: "#3B82F6" + "55" }]}>
                      <Ionicons name="print-outline" size={13} color="#3B82F6" /><Text style={[s.miniBtnText, { color: "#3B82F6" }]}>طباعة</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={contractsLoading
            ? <View style={s.centerBox}><ActivityIndicator color="#14213D" /></View>
            : myApps.length === 0 ? (
              <View style={s.centerBox}>
                <MaterialCommunityIcons name="handshake-outline" size={42} color="#D6CFC0" />
                <Text style={s.emptyText}>لا توجد تعاقدات بعد</Text>
                <Text style={[s.emptyText, { fontSize: 11 }]}>اختر محامياً وأرسل طلب خدمة، أو قدّم طلب الانضمام كمحامٍ</Text>
              </View>
            ) : null}
        />
      )}

      {/* ═══ Lawyer Join Modal ═══ */}
      <Modal visible={joinOpen} animationType="slide" onRequestClose={() => setJoinOpen(false)} transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: "94%" }]}>
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
                <TouchableOpacity onPress={() => setJoinOpen(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={20} color="#fff" />
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
              <Field label="رسوم الاستشارة" value={appForm.consult_fee} onChange={(v: string) => setAppForm(f => ({ ...f, consult_fee: v }))} placeholder="مثال: 5,000 ج.س / 30 دقيقة" />

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
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {selected && (
                <>
                  <View style={s.detailHead}>
                    <View style={s.avatarLg}>
                      <MaterialCommunityIcons name="account-tie" size={36} color="#B08D3C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.detailName}>{selected.full_name}</Text>
                        {selected.is_verified && <Ionicons name="checkmark-circle" size={17} color="#0E8A5F" />}
                      </View>
                      <Text style={s.detailTitle}>{selected.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <Stars value={selected.avg_rating} size={14} />
                        <Text style={s.detailMeta}>{selected.avg_rating.toFixed(1)} ({selected.review_count} مراجعة)</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelected(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* أزرار سريعة */}
                  <View style={s.quickRow}>
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${selected.phone}`)} style={[s.quickBtn, { backgroundColor: "#10B981" }]}>
                      <Ionicons name="call" size={16} color="#fff" /><Text style={s.quickBtnText}>اتصال</Text>
                    </TouchableOpacity>
                    {selected.whatsapp && (
                      <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${selected.whatsapp.replace(/\D/g,"")}`)} style={[s.quickBtn, { backgroundColor: "#25D366" }]}>
                        <Ionicons name="logo-whatsapp" size={16} color="#fff" /><Text style={s.quickBtnText}>واتساب</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => printLawyerCard(selected, services)} style={[s.quickBtn, { backgroundColor: "#14213D" }]}>
                      <Ionicons name="print-outline" size={16} color="#fff" /><Text style={s.quickBtnText}>طباعة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRateOpen(true)} style={[s.quickBtn, { backgroundColor: "#F59E0B" }]}>
                      <Ionicons name="star" size={16} color="#fff" /><Text style={s.quickBtnText}>تقييم</Text>
                    </TouchableOpacity>
                  </View>

                  {/* معلومات */}
                  <View style={s.infoBox}>
                    <InfoLine icon="briefcase-outline" label="التخصصات" value={selected.specialties} />
                    <InfoLine icon="location-outline"  label="العنوان"   value={selected.office_addr || selected.district || "—"} />
                    <InfoLine icon="card-outline"      label="رقم النقابة" value={selected.bar_number || "—"} />
                    <InfoLine icon="time-outline"      label="الخبرة"    value={`${selected.experience_y} سنة`} />
                    <InfoLine icon="globe-outline"     label="اللغات"    value={selected.languages} />
                    <InfoLine icon="cash-outline"      label="الاستشارة" value={selected.consult_fee || "—"} />
                  </View>

                  {selected.bio && (
                    <View style={s.bioBox}>
                      <Text style={s.bioTitle}>نبذة</Text>
                      <Text style={s.bioText}>{selected.bio}</Text>
                    </View>
                  )}

                  {/* الخدمات */}
                  <View style={s.section}>
                    <Text style={s.sectionTitle}>الخدمات المتاحة</Text>
                    {detailLoading ? <ActivityIndicator color="#14213D" /> : services.length === 0 ? (
                      <Text style={s.emptyInline}>لم يضِف المحامي خدمات بعد</Text>
                    ) : services.map(svc => (
                      <View key={svc.id} style={s.svcCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.svcTitle}>{svc.title}</Text>
                          {svc.description && <Text style={s.svcDesc}>{svc.description}</Text>}
                          <View style={{ flexDirection: "row", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                            {svc.price_text && <View style={s.svcChip}><Text style={s.svcChipText}>💰 {svc.price_text}</Text></View>}
                            {svc.duration   && <View style={s.svcChip}><Text style={s.svcChipText}>⏱ {svc.duration}</Text></View>}
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => setContractFor(svc)} style={s.contractBtn}>
                          <MaterialCommunityIcons name="handshake" size={14} color="#fff" />
                          <Text style={s.contractBtnText}>تعاقد</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {/* تواصل عام */}
                    <TouchableOpacity onPress={() => setContractFor({ id: 0, lawyer_id: selected.id, title: "تواصل عام", description: "", price_text: "", duration: "" })}
                      style={s.contactGenBtn}>
                      <MaterialCommunityIcons name="email-plus-outline" size={16} color="#14213D" />
                      <Text style={s.contactGenText}>طلب خدمة أخرى / تواصل عام</Text>
                    </TouchableOpacity>
                  </View>

                  {/* المراجعات */}
                  {reviews.length > 0 && (
                    <View style={s.section}>
                      <Text style={s.sectionTitle}>آخر المراجعات</Text>
                      {reviews.slice(0, 8).map(r => (
                        <View key={r.id} style={s.reviewCard}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={s.reviewName}>{r.user_name}</Text>
                            <Stars value={r.rating} size={11} />
                          </View>
                          {r.comment && <Text style={s.reviewText}>{r.comment}</Text>}
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ Contract Modal ═══ */}
      <Modal visible={!!contractFor} animationType="fade" onRequestClose={() => setContractFor(null)} transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalOverlay2}>
          <View style={s.contractModal}>
            <View style={s.contractHeader}>
              <MaterialCommunityIcons name="handshake" size={20} color="#14213D" />
              <Text style={s.contractTitle}>طلب: {contractFor?.title}</Text>
            </View>
            <Text style={s.contractSubt}>سيتواصل معك المحامي لتأكيد التفاصيل والموعد.</Text>

            <Field label="الاسم *" value={contract.name} onChange={(v: string) => setContract(c => ({ ...c, name: v }))} placeholder="اسمك الكامل" />
            <Field label="رقم الهاتف *" value={contract.phone} onChange={(v: string) => setContract(c => ({ ...c, phone: v }))} placeholder="09xxxxxxxx" keyboardType="phone-pad" />
            <Field label="الموعد المطلوب" value={contract.date} onChange={(v: string) => setContract(c => ({ ...c, date: v }))} placeholder="YYYY-MM-DD (اختياري)" />
            <Field label="تفاصيل" value={contract.details} onChange={(v: string) => setContract(c => ({ ...c, details: v }))} placeholder="اكتب وصفاً موجزاً للقضية أو الخدمة المطلوبة" multiline />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setContractFor(null)} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitContract} disabled={submitting} style={[s.submitBtn, submitting && { opacity: 0.6 }]}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="send" size={14} color="#fff" /><Text style={s.submitBtnText}>إرسال الطلب</Text></>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Rights Guide ═══ */}
      <Modal visible={rightsOpen} animationType="slide" transparent onRequestClose={() => setRightsOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: "#FFFDF8" }]}>
            <View style={s.modalHandle} />
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <View style={[s.svcTileIcon, { backgroundColor: "#14213D" }]}><MaterialCommunityIcons name="shield-check-outline" size={20} color="#B08D3C" /></View>
              <Text style={[s.detailName, { flex: 1, textAlign: "right" }]}>اعرف حقوقك</Text>
              <TouchableOpacity onPress={() => setRightsOpen(false)} style={s.closeBtn}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30, gap: 10 }}>
              {RIGHTS_GUIDE.map(g => (
                <View key={g.title} style={s.rightsCard}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <MaterialCommunityIcons name={g.icon as any} size={18} color="#B08D3C" />
                    <Text style={s.rightsTitle}>{g.title}</Text>
                  </View>
                  {g.points.map((pt, i) => <Text key={i} style={s.rightsPoint}>• {pt}</Text>)}
                </View>
              ))}
              <Text style={s.rightsNote}>معلومات توعوية عامة وليست استشارة قانونية. لكل حالة تفاصيلها — تواصل مع محامٍ مرخّص من القائمة.</Text>
              <TouchableOpacity onPress={() => setRightsOpen(false)} style={[s.submitBtn, { flex: 0 }]}>
                <MaterialCommunityIcons name="account-tie" size={16} color="#fff" /><Text style={s.submitBtnText}>اختر محامياً للاستشارة</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ Rate Modal ═══ */}
      <Modal visible={rateOpen} animationType="fade" transparent onRequestClose={() => setRateOpen(false)}>
        <View style={s.modalOverlay2}>
          <View style={s.rateModal}>
            <Text style={s.rateTitle}>تقييم {selected?.full_name}</Text>
            <View style={{ marginVertical: 18 }}><StarPicker value={rateValue} onChange={setRateValue} /></View>
            <TextInput
              style={s.rateInput} placeholder="اكتب رأيك (اختياري)" placeholderTextColor="#6B7280"
              value={rateComment} onChangeText={setRateComment} multiline maxLength={500}
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setRateOpen(false)} style={s.cancelBtn}>
                <Text style={s.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitRating} style={s.submitBtn}>
                <Ionicons name="star" size={14} color="#fff" /><Text style={s.submitBtnText}>إرسال التقييم</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function InfoLine({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.infoLine}>
      <Ionicons name={icon} size={14} color="#7C7566" />
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
        style={[s.fieldInput, multiline && { height: 80, textAlignVertical: "top", paddingTop: 10 }]}
        placeholder={placeholder} placeholderTextColor="#6B7280"
        value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboardType}
      />
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  uploadBox: { borderWidth: 1, borderColor: "rgba(31,92,138,0.25)", backgroundColor: "rgba(31,92,138,0.08)", borderRadius: 14, padding: 12, gap: 8 },
  uploadHelp: { color: Colors.textMuted, fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18, textAlign: "right" },
  uploadBtn: { minHeight: 44, borderRadius: 12, backgroundColor: "#14213D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  uploadBtnOk: { backgroundColor: "#10B981" },
  uploadBtnWarn: { backgroundColor: "#F59E0B" },
  uploadBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },
  uploadFileName: { color: Colors.text, fontFamily: "Cairo_600SemiBold", fontSize: 11, textAlign: "right" },
  uploadWarn: { color: "#F59E0B", fontFamily: "Cairo_600SemiBold", fontSize: 11, textAlign: "right", lineHeight: 17 },
  container: { flex: 1, backgroundColor: "#F6F4EE" },
  tabsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: Colors.radius.md, padding: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: Colors.radius.sm },
  tabBtnActive: { backgroundColor: "#14213D" },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#B08D3C" },
  tabLabelActive: { color: "#fff" },

  adCard: { width: 270, padding: 12, borderRadius: Colors.radius.md, borderWidth: 1 },
  adBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Cairo_700Bold" },
  adTitle: { fontFamily: "Cairo_700Bold", color: "#1B2333", fontSize: 14, marginTop: 6 },
  adBody: { fontFamily: "Cairo_400Regular", color: "#4B5563", fontSize: 11, marginTop: 4, lineHeight: 16 },
  adCtaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  adCta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  adCtaText: { color: "#fff", fontSize: 11, fontFamily: "Cairo_700Bold" },
  adAuthor: { color: "#7C7566", fontSize: 10, fontFamily: "Cairo_400Regular", flex: 1, textAlign: "left", marginLeft: 8 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderRadius: Colors.radius.md, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: "#E7E1D3" },
  searchInput: { flex: 1, color: "#1B2333", fontFamily: "Cairo_400Regular", fontSize: 13, paddingVertical: 0, textAlign: "right" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Colors.radius.pill, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7E1D3" },
  chipActive: { backgroundColor: "#14213D", borderColor: "#14213D" },
  chipText: { color: "#7C7566", fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  chipTextActive: { color: "#fff" },

  lawyerCard: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 14, marginHorizontal: 14, marginVertical: 6, borderWidth: 1, borderColor: "#E7E1D3" },
  featBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FBBF2422", borderColor: "#FBBF24", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  featBadgeText: { color: "#FBBF24", fontFamily: "Cairo_700Bold", fontSize: 9 },
  lawyerHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: Colors.radius.md, backgroundColor: "#14213D22", borderWidth: 1, borderColor: "#14213D55", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  lawyerName: { fontFamily: "Cairo_700Bold", color: "#1B2333", fontSize: 14, flexShrink: 1 },
  lawyerTitle: { fontFamily: "Cairo_400Regular", color: "#B08D3C", fontSize: 11, marginTop: 1 },
  lawyerMeta: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 10 },
  lawyerSpec: { color: "#4B5563", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 10, lineHeight: 17 },
  lawyerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E7E1D3" },
  lawyerLocPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E7E1D3", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  lawyerLocText: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 10 },
  lawyerFee: { color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 11, flex: 1, textAlign: "left", marginLeft: 8 },

  centerBox: { paddingVertical: 60, alignItems: "center", gap: 10 },
  emptyText: { color: "#6B7280", fontFamily: "Cairo_400Regular", fontSize: 13 },

  formsHeader: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#14213D12", borderRadius: Colors.radius.md, borderWidth: 1, borderColor: "#14213D33", marginBottom: 12 },
  formsHeaderText: { flex: 1, color: "#B08D3C", fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18 },
  svcHub: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#E7E1D3" },
  svcHubTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#14213D", textAlign: "right", marginBottom: 8 },
  svcGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  svcTile: { width: "31%", flexGrow: 1, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, backgroundColor: "#FBF8F1", borderWidth: 1, borderColor: "#EFE8D8" },
  svcTileOn: { borderColor: "#B08D3C", backgroundColor: "#F7EFD9" },
  svcTileIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#EDE6D3", alignItems: "center", justifyContent: "center" },
  svcTileText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#1B2333", textAlign: "center", lineHeight: 16 },
  rightsCard: { backgroundColor: "#fff", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#EFE8D8", borderRightWidth: 3, borderRightColor: "#B08D3C" },
  rightsTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#14213D", textAlign: "right", flex: 1 },
  rightsPoint: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#374151", textAlign: "right", lineHeight: 21 },
  rightsNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#8A8270", textAlign: "center", lineHeight: 18, marginTop: 4 },
  formsHero: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: "#14213D", borderRadius: Colors.radius.lg, padding: 14, borderWidth: 1, borderColor: "#B08D3C" },
  formsHeroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(176,141,60,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B08D3C" },
  formsHeroTitle: { color: "#F6F1E4", fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  formsHeroSub: { color: "#D9CFB7", fontFamily: "Cairo_400Regular", fontSize: 11.5, lineHeight: 18, textAlign: "right", marginTop: 2 },
  paperCard: { backgroundColor: "#FFFDF8", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#E7DFCB", borderRightWidth: 4, borderRightColor: "#B08D3C", overflow: "hidden",
    shadowColor: "#5C4A12", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  paperFold: { position: "absolute", top: 0, left: 0, width: 26, height: 26, backgroundColor: "#EFE6D0", borderBottomRightRadius: 10 },
  paperActions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EFE8D8", borderStyle: "dashed" },
  paperHint: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: "#8A8270" },
  formCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#E7E1D3" },
  formIconBox: { width: 44, height: 44, borderRadius: Colors.radius.md, backgroundColor: "#14213D22", alignItems: "center", justifyContent: "center" },
  formTitle: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  officialBadge: { backgroundColor: "#10B98122", borderColor: "#10B98155", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  officialBadgeText: { color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 9 },
  formCat: { color: "#B08D3C", fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  formDesc: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4, lineHeight: 16 },
  printBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#14213D", paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radius.sm },
  printBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11 },

  contractCard: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#E7E1D3" },
  contractNo: { color: "#7C7566", fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 14, borderWidth: 1 },
  statusPillText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  contractLawyer: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 14 },
  contractSvc: { color: "#B08D3C", fontFamily: "Cairo_600SemiBold", fontSize: 12, marginTop: 2 },
  contractMeta: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11 },
  contractActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Colors.radius.sm, borderWidth: 1 },
  miniBtnText: { fontFamily: "Cairo_700Bold", fontSize: 11 },

  // detail modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#F6F4EE", borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, paddingHorizontal: 16, paddingTop: 8, maxHeight: "92%", borderWidth: 1, borderColor: "#E7E1D3" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D8D0BE", alignSelf: "center", marginBottom: 12 },
  detailHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E7E1D3" },
  avatarLg: { width: 70, height: 70, borderRadius: Colors.radius.lg, backgroundColor: "#14213D22", borderWidth: 1, borderColor: "#14213D55", alignItems: "center", justifyContent: "center" },
  detailName: { fontFamily: "Cairo_700Bold", color: "#1B2333", fontSize: 16, flexShrink: 1 },
  detailTitle: { fontFamily: "Cairo_400Regular", color: "#B08D3C", fontSize: 12, marginTop: 2 },
  detailMeta: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#14213D", alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  quickBtn: { flex: 1, minWidth: "22%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: Colors.radius.sm },
  quickBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 12 },

  infoBox: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.md, padding: 12, marginTop: 14, borderWidth: 1, borderColor: "#E7E1D3" },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#E7E1D3" },
  infoLineLabel: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11, width: 90 },
  infoLineValue: { color: "#1B2333", fontFamily: "Cairo_600SemiBold", fontSize: 12, flex: 1, textAlign: "left" },

  bioBox: { backgroundColor: "#FBF7EE", borderRadius: Colors.radius.md, padding: 12, marginTop: 12, borderWidth: 1, borderColor: "#14213D33" },
  bioTitle: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 12, marginBottom: 6 },
  bioText: { color: "#374151", fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 20 },

  section: { marginTop: 18 },
  sectionTitle: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 10 },
  emptyInline: { color: "#6B7280", fontFamily: "Cairo_400Regular", fontSize: 12, fontStyle: "italic" },

  svcCard: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: Colors.radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E7E1D3" },
  svcTitle: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 13 },
  svcDesc: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 3, lineHeight: 16 },
  svcChip: { backgroundColor: "#E7E1D3", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  svcChipText: { color: "#4B5563", fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  contractBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#14213D", paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radius.sm },
  contractBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11 },
  contactGenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: "#14213D55", borderStyle: "dashed", marginTop: 4 },
  contactGenText: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 12 },

  reviewCard: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.sm, padding: 11, marginBottom: 7, borderWidth: 1, borderColor: "#E7E1D3" },
  reviewName: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 11 },
  reviewText: { color: "#4B5563", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4, lineHeight: 17 },

  // contract & rate modals
  modalOverlay2: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  contractModal: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 18, borderWidth: 1, borderColor: "#E7E1D3" },
  contractHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  contractTitle: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 14, flex: 1 },
  contractSubt: { color: "#7C7566", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 6, lineHeight: 16 },
  fieldLabel: { color: "#B08D3C", fontFamily: "Cairo_600SemiBold", fontSize: 11, marginBottom: 5 },
  fieldInput: { backgroundColor: "#F6F4EE", borderRadius: Colors.radius.sm, paddingHorizontal: 12, height: 44, color: "#1B2333", fontFamily: "Cairo_400Regular", fontSize: 13, borderWidth: 1, borderColor: "#E7E1D3", textAlign: "right" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Colors.radius.sm, backgroundColor: "#E7E1D3", alignItems: "center" },
  cancelBtnText: { color: "#7C7566", fontFamily: "Cairo_700Bold", fontSize: 13 },
  submitBtn: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: Colors.radius.sm, backgroundColor: "#14213D" },
  submitBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },

  rateModal: { backgroundColor: "#FFFFFF", borderRadius: Colors.radius.lg, padding: 22, borderWidth: 1, borderColor: "#E7E1D3" },
  rateTitle: { color: "#1B2333", fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "center" },
  rateInput: { backgroundColor: "#F6F4EE", borderRadius: Colors.radius.sm, padding: 12, color: "#1B2333", fontFamily: "Cairo_400Regular", fontSize: 12, borderWidth: 1, borderColor: "#E7E1D3", height: 80, textAlignVertical: "top", textAlign: "right" },

  joinBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#14213D", padding: 14, borderRadius: Colors.radius.md, marginBottom: 14 },
  joinIcon: { width: 40, height: 40, borderRadius: Colors.radius.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  joinTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },
  joinSub: { color: "#E9E2CF", fontFamily: "Cairo_400Regular", fontSize: 10, marginTop: 2 },
  joinHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E7E1D3" },
  joinHeadIcon: { width: 56, height: 56, borderRadius: Colors.radius.md, backgroundColor: "#14213D", alignItems: "center", justifyContent: "center" },
  joinSectionTitle: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 13, marginTop: 18, marginBottom: 4, paddingRight: 4, borderRightWidth: 3, borderRightColor: "#14213D" },
  termsBox: { backgroundColor: "#FBF7EE", borderRadius: Colors.radius.md, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "#14213D55" },
  termsTitle: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 8 },
  termsText: { color: "#4B5563", fontFamily: "Cairo_400Regular", fontSize: 11, lineHeight: 22 },
  agreeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 10, backgroundColor: "#FFFFFF", borderRadius: Colors.radius.sm, borderWidth: 1, borderColor: "#E7E1D3" },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#14213D", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#14213D" },
  agreeText: { color: "#1B2333", fontFamily: "Cairo_600SemiBold", fontSize: 12, flex: 1 },
  contractsSectionTitle: { color: "#B08D3C", fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 8, paddingRight: 4, borderRightWidth: 3, borderRightColor: "#14213D" },
  contractDownloadBtn: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Colors.radius.sm, backgroundColor: "#14213D" },
  contractDownloadText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 12, flex: 1, textAlign: "center" },
});
