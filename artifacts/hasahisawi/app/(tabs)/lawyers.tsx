import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Alert, Platform, ActivityIndicator, Pressable, Linking,
  KeyboardAvoidingView,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { fetch } from "expo/fetch";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────
type Lawyer = {
  id: number; full_name: string; title: string; specialties: string;
  bio: string; phone: string; whatsapp: string; email: string; office_addr: string;
  district: string; bar_number: string; experience_y: number; languages: string;
  consult_fee: string; is_featured: boolean; is_verified: boolean;
  avg_rating: number; review_count: number; entity_id: number | null;
  photo_url?: string;
};
type LawyerService = { id: number; lawyer_id: number; title: string; description: string; price_text: string; duration: string };
type LawyerReview  = { id: number; rating: number; comment: string | null; user_name: string; created_at: string };
type LawyerAd      = { id: number; title: string; body: string; cta_text: string; cta_phone: string; banner_color: string; lawyer_name?: string };
type LegalForm     = { id: number; title: string; category: string; description: string; is_official: boolean };
type LegalFormFull = LegalForm & { content_html: string };
type Contract      = { id: number; lawyer_id: number; lawyer_name: string; lawyer_phone: string; service_title: string; status: string; contract_no: string; created_at: string; preferred_date: string | null; details: string };
type MyApp         = { id: number; full_name: string; status: "pending"|"approved"|"rejected"; admin_note: string; lawyer_id: number | null; created_at: string; reviewed_at?: string };

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
  in_progress: { label: "قيد التنفيذ",  color: "#8B5CF6" },
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
          color={s <= Math.round(value) ? color : "#4A5568"} />
      ))}
    </View>
  );
}
function StarPicker({ value, onChange }: { value: number; onChange: (v:number)=>void }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
      {[1,2,3,4,5].map(s => (
        <Pressable key={s} onPress={() => { onChange(s); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
          <Ionicons name={s <= value ? "star" : "star-outline"} size={42} color={s <= value ? "#F59E0B" : "#4A5568"} />
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
  const insets = useSafeAreaInsets();
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
  const [forms, setForms] = useState<LegalForm[]>([]);
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
    const svcHtml = svcs.map((sv) => {
      const desc = sv.description ? '<div class="svc-desc">' + sv.description + '</div>' : '';
      const dur  = sv.duration ? ' · ⏱ ' + sv.duration : '';
      return '<div class="svc"><div class="svc-title">' + sv.title + '</div>' + desc +
             '<div class="svc-price">💰 ' + (sv.price_text || '—') + dur + '</div></div>';
    }).join('');
    const html = `
      <html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
      <style>
        body { font-family: -apple-system, "Helvetica Neue", Arial; padding: 32px; color: #1a1a1a; }
        .card { border: 2px solid #8B5CF6; border-radius: 14px; padding: 24px; max-width: 720px; margin: 0 auto; }
        h1 { color: #8B5CF6; margin: 0 0 4px; font-size: 26px; }
        .title { color: #555; font-size: 15px; margin-bottom: 16px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ddd; }
        .label { color: #666; font-size: 13px; } .val { color: #111; font-weight: 600; font-size: 13px; }
        h3 { color: #8B5CF6; margin-top: 22px; border-right: 4px solid #8B5CF6; padding-right: 10px; }
        .svc { padding: 10px 14px; background: #f7f5ff; border-radius: 8px; margin-bottom: 8px; }
        .svc-title { font-weight: 700; color: #6D28D9; }
        .svc-desc  { font-size: 12px; color: #555; margin-top: 4px; }
        .svc-price { font-size: 13px; color: #047857; font-weight: 700; margin-top: 6px; }
        .footer { margin-top: 24px; text-align: center; color: #888; font-size: 11px; }
      </style></head>
      <body><div class="card">
        <h1>${lw.full_name}</h1>
        <div class="title">${lw.title}${lw.is_verified ? " · ✓ موثّق" : ""}</div>
        <div class="row"><span class="label">التخصصات</span><span class="val">${lw.specialties}</span></div>
        <div class="row"><span class="label">الهاتف / واتساب</span><span class="val">${lw.phone || "—"}</span></div>
        <div class="row"><span class="label">العنوان</span><span class="val">${lw.office_addr || lw.district || "—"}</span></div>
        <div class="row"><span class="label">رقم النقابة</span><span class="val">${lw.bar_number || "—"}</span></div>
        <div class="row"><span class="label">الخبرة</span><span class="val">${lw.experience_y} سنة</span></div>
        <div class="row"><span class="label">اللغات</span><span class="val">${lw.languages}</span></div>
        <div class="row"><span class="label">رسوم الاستشارة</span><span class="val">${lw.consult_fee || "—"}</span></div>
        <div class="row"><span class="label">التقييم</span><span class="val">${lw.avg_rating} / 5 (${lw.review_count} مراجعة)</span></div>
        ${lw.bio ? '<h3>نبذة</h3><p style="font-size:13px;line-height:1.8;">' + lw.bio + '</p>' : ""}
        ${svcs.length ? '<h3>الخدمات المتاحة</h3>' + svcHtml : ""}
        <div class="footer">بطاقة محامي — تطبيق حصاحيصاوي · ${new Date().toLocaleDateString("ar-SD")}</div>
      </div></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "حفظ / طباعة بطاقة المحامي" });
      else await Print.printAsync({ html });
    } catch (e:any) { Alert.alert("تعذّر الطباعة", e?.message || "حاول مرة أخرى"); }
  };

  // ── طباعة استمارة قانونية ──
  const printForm = async (id: number) => {
    try {
      const r = await apiFetch(`/api/legal-forms/${id}`);
      if (!r.ok) throw new Error();
      const f: LegalFormFull = await r.json();
      const html = `<html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, "Helvetica Neue", Arial; padding: 36px; color: #111; line-height: 1.9; }
          h2 { color: #8B5CF6; }
          .meta { color: #666; font-size: 11px; text-align: center; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          .footer { margin-top: 30px; text-align: center; color: #888; font-size: 10px; border-top: 1px solid #eee; padding-top: 10px; }
          ol li, p { font-size: 14px; }
        </style></head><body>
        <div class="meta">${f.category}${f.is_official ? " · استمارة معتمدة" : ""}</div>
        ${f.content_html}
        <div class="footer">استمارة قانونية — تطبيق حصاحيصاوي · ${new Date().toLocaleDateString("ar-SD")}</div>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "حفظ / طباعة الاستمارة" });
      else await Print.printAsync({ html });
    } catch (e:any) { Alert.alert("تعذّر الطباعة", e?.message || "حاول مرة أخرى"); }
  };

  // ── طباعة عقد ──
  const printContract = async (c: Contract) => {
    const status = STATUS_AR[c.status] || { label: c.status, color: "#666" };
    const html = `<html dir="rtl"><head><meta charset="utf-8"/>
      <style>body{font-family:-apple-system,Arial;padding:32px;color:#111;line-height:1.8}
      .box{border:2px solid #8B5CF6;border-radius:12px;padding:24px;max-width:680px;margin:auto}
      h2{color:#8B5CF6;margin:0 0 6px}.no{color:#666;font-size:12px;margin-bottom:18px}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ddd}
      .label{color:#666}.val{font-weight:700}
      .status{display:inline-block;padding:5px 14px;border-radius:20px;background:${status.color}22;color:${status.color};font-weight:700;font-size:12px}</style>
      </head><body><div class="box">
      <h2>إيصال طلب خدمة قانونية</h2>
      <div class="no">رقم العقد: ${c.contract_no}</div>
      <div class="row"><span class="label">المحامي</span><span class="val">${c.lawyer_name}</span></div>
      <div class="row"><span class="label">الخدمة</span><span class="val">${c.service_title || "تواصل عام"}</span></div>
      <div class="row"><span class="label">التاريخ المطلوب</span><span class="val">${c.preferred_date || "—"}</span></div>
      <div class="row"><span class="label">الحالة</span><span class="status">${status.label}</span></div>
      <div class="row"><span class="label">تاريخ الطلب</span><span class="val">${new Date(c.created_at).toLocaleDateString("ar-SD")}</span></div>
      ${c.details ? `<p style="margin-top:14px"><b>التفاصيل:</b><br/>${c.details}</p>` : ""}
      <p style="margin-top:24px;color:#888;text-align:center;font-size:11px">تطبيق حصاحيصاوي · ${new Date().toLocaleDateString("ar-SD")}</p>
      </div></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "حفظ / طباعة الإيصال" });
      else await Print.printAsync({ html });
    } catch (e:any) { Alert.alert("تعذّر الطباعة", e?.message); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={["#1a0f2e", "#0F1A14"]} style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={s.headerTitleRow}>
              <MaterialCommunityIcons name="scale-balance" size={22} color="#C4B5FD" />
              <Text style={s.headerTitle}>الخدمات القانونية</Text>
            </View>
            <Text style={s.headerSub}>محامون · استشارات · استمارات</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Tabs */}
        <View style={s.tabsRow}>
          {[
            { key: "directory" as const, label: "المحامون", icon: "account-tie" as const },
            { key: "forms"     as const, label: "الاستمارات", icon: "file-document-outline" as const },
            { key: "contracts" as const, label: "تعاقداتي",  icon: "handshake-outline" as const },
          ].map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
              <MaterialCommunityIcons name={t.icon} size={16} color={tab === t.key ? "#fff" : "#C4B5FD"} />
              <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

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

              {/* انضم كمحامي */}
              <TouchableOpacity onPress={() => setJoinOpen(true)} activeOpacity={0.85} style={s.joinBanner}>
                <View style={s.joinIcon}>
                  <MaterialCommunityIcons name="briefcase-plus" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.joinTitle}>هل أنت محامي؟ انضم لقائمتنا</Text>
                  <Text style={s.joinSub}>قدّم طلب تعاقد · مراجعة من الإدارة · ظهور في القائمة</Text>
                </View>
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </TouchableOpacity>

              {/* بحث */}
              <View style={s.searchBox}>
                <Ionicons name="search" size={17} color="#9CA3AF" />
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
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(40 * index).springify()}>
              <TouchableOpacity onPress={() => openLawyer(item)} activeOpacity={0.85} style={s.lawyerCard}>
                {item.is_featured && (
                  <View style={s.featBadge}><MaterialCommunityIcons name="star-circle" size={11} color="#FBBF24" /><Text style={s.featBadgeText}>مميّز</Text></View>
                )}
                <View style={s.lawyerHead}>
                  <View style={s.avatar}>
                    <MaterialCommunityIcons name="account-tie" size={28} color="#C4B5FD" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.lawyerName} numberOfLines={1}>{item.full_name}</Text>
                      {item.is_verified && <Ionicons name="checkmark-circle" size={15} color="#3EFF9C" />}
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
                    <Ionicons name="location-outline" size={11} color="#9CA3AF" />
                    <Text style={s.lawyerLocText} numberOfLines={1}>{item.district || "الحصاحيصا"}</Text>
                  </View>
                  <Text style={s.lawyerFee} numberOfLines={1}>{item.consult_fee || "تواصل للتفاصيل"}</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
          ListEmptyComponent={loading ? (
            <View style={s.centerBox}><ActivityIndicator color="#8B5CF6" /></View>
          ) : (
            <View style={s.centerBox}>
              <MaterialCommunityIcons name="account-search" size={42} color="#4A5568" />
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
          data={forms} keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
          ListHeaderComponent={
            <View style={s.formsHeader}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#C4B5FD" />
              <Text style={s.formsHeaderText}>اختر استمارة لطباعتها أو حفظها كملف PDF — جاهزة للتعبئة بخط اليد أو رقمياً.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(30 * index).springify()}>
              <View style={s.formCard}>
                <View style={s.formIconBox}><MaterialCommunityIcons name="file-document-outline" size={24} color="#8B5CF6" /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={s.formTitle} numberOfLines={1}>{item.title}</Text>
                    {item.is_official && <View style={s.officialBadge}><Text style={s.officialBadgeText}>معتمدة</Text></View>}
                  </View>
                  <Text style={s.formCat}>{item.category}</Text>
                  <Text style={s.formDesc} numberOfLines={2}>{item.description}</Text>
                </View>
                <TouchableOpacity onPress={() => printForm(item.id)} style={s.printBtn} activeOpacity={0.8}>
                  <Ionicons name="print-outline" size={16} color="#fff" />
                  <Text style={s.printBtnText}>طباعة</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
          ListEmptyComponent={formsLoading
            ? <View style={s.centerBox}><ActivityIndicator color="#8B5CF6" /></View>
            : <View style={s.centerBox}><Text style={s.emptyText}>لا توجد استمارات</Text></View>}
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
                          <Text style={{ color: "#D1D5DB", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 2 }}>{a.admin_note}</Text>
                        </View>
                      )}
                      {a.status === "approved" && (
                        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                          <Text style={{ color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 11 }}>تم تفعيل ملفك في قائمة المحامين</Text>
                        </View>
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
                      <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
                      <Text style={s.contractMeta}>{item.preferred_date}</Text>
                    </View>
                  )}
                  <View style={s.contractActions}>
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.lawyer_phone}`)} style={[s.miniBtn, { backgroundColor: "#10B981" + "22", borderColor: "#10B981" + "55" }]}>
                      <Ionicons name="call" size={13} color="#10B981" /><Text style={[s.miniBtnText, { color: "#10B981" }]}>اتصال</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => printContract(item)} style={[s.miniBtn, { backgroundColor: "#8B5CF6" + "22", borderColor: "#8B5CF6" + "55" }]}>
                      <Ionicons name="print-outline" size={13} color="#8B5CF6" /><Text style={[s.miniBtnText, { color: "#8B5CF6" }]}>طباعة</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={contractsLoading
            ? <View style={s.centerBox}><ActivityIndicator color="#8B5CF6" /></View>
            : myApps.length === 0 ? (
              <View style={s.centerBox}>
                <MaterialCommunityIcons name="handshake-outline" size={42} color="#4A5568" />
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
              <Field label="رابط صورة كرت النقابة (اختياري)" value={appForm.bar_card_url} onChange={(v: string) => setAppForm(f => ({ ...f, bar_card_url: v }))} placeholder="https://..." />

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
                      <MaterialCommunityIcons name="account-tie" size={36} color="#C4B5FD" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.detailName}>{selected.full_name}</Text>
                        {selected.is_verified && <Ionicons name="checkmark-circle" size={17} color="#3EFF9C" />}
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
                    <TouchableOpacity onPress={() => printLawyerCard(selected, services)} style={[s.quickBtn, { backgroundColor: "#8B5CF6" }]}>
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
                    {detailLoading ? <ActivityIndicator color="#8B5CF6" /> : services.length === 0 ? (
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
                      <MaterialCommunityIcons name="email-plus-outline" size={16} color="#8B5CF6" />
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
              <MaterialCommunityIcons name="handshake" size={20} color="#8B5CF6" />
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
      <Ionicons name={icon} size={14} color="#9CA3AF" />
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
  container: { flex: 1, backgroundColor: "#0A0F0C" },
  header: { paddingHorizontal: 14, paddingBottom: 12 },
  headerTop: { flexDirection: "row", alignItems: "center", paddingTop: 6 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 17 },
  headerSub: { fontFamily: "Cairo_400Regular", color: "#9CA3AF", fontSize: 11, marginTop: 2 },
  tabsRow: { flexDirection: "row", backgroundColor: "#0F1A14", borderRadius: 12, padding: 4, marginTop: 14, borderWidth: 1, borderColor: "#1F2937" },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 9 },
  tabBtnActive: { backgroundColor: "#8B5CF6" },
  tabLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#C4B5FD" },
  tabLabelActive: { color: "#fff" },

  adCard: { width: 270, padding: 12, borderRadius: 14, borderWidth: 1 },
  adBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Cairo_700Bold" },
  adTitle: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 14, marginTop: 6 },
  adBody: { fontFamily: "Cairo_400Regular", color: "#D1D5DB", fontSize: 11, marginTop: 4, lineHeight: 16 },
  adCtaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  adCta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  adCtaText: { color: "#fff", fontSize: 11, fontFamily: "Cairo_700Bold" },
  adAuthor: { color: "#9CA3AF", fontSize: 10, fontFamily: "Cairo_400Regular", flex: 1, textAlign: "left", marginLeft: 8 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0F1A14", borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: "#1F2937" },
  searchInput: { flex: 1, color: "#fff", fontFamily: "Cairo_400Regular", fontSize: 13, paddingVertical: 0, textAlign: "right" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: "#0F1A14", borderWidth: 1, borderColor: "#1F2937" },
  chipActive: { backgroundColor: "#8B5CF6", borderColor: "#8B5CF6" },
  chipText: { color: "#9CA3AF", fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  chipTextActive: { color: "#fff" },

  lawyerCard: { backgroundColor: "#0F1A14", borderRadius: 14, padding: 14, marginHorizontal: 14, marginVertical: 6, borderWidth: 1, borderColor: "#1F2937" },
  featBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FBBF2422", borderColor: "#FBBF24", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  featBadgeText: { color: "#FBBF24", fontFamily: "Cairo_700Bold", fontSize: 9 },
  lawyerHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 14, backgroundColor: "#8B5CF622", borderWidth: 1, borderColor: "#8B5CF655", alignItems: "center", justifyContent: "center" },
  lawyerName: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 14, flexShrink: 1 },
  lawyerTitle: { fontFamily: "Cairo_400Regular", color: "#C4B5FD", fontSize: 11, marginTop: 1 },
  lawyerMeta: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 10 },
  lawyerSpec: { color: "#D1D5DB", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 10, lineHeight: 17 },
  lawyerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#1F2937" },
  lawyerLocPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#1F2937", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  lawyerLocText: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 10 },
  lawyerFee: { color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 11, flex: 1, textAlign: "left", marginLeft: 8 },

  centerBox: { paddingVertical: 60, alignItems: "center", gap: 10 },
  emptyText: { color: "#6B7280", fontFamily: "Cairo_400Regular", fontSize: 13 },

  formsHeader: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#8B5CF612", borderRadius: 10, borderWidth: 1, borderColor: "#8B5CF633", marginBottom: 12 },
  formsHeaderText: { flex: 1, color: "#C4B5FD", fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 18 },
  formCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#0F1A14", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#1F2937" },
  formIconBox: { width: 44, height: 44, borderRadius: 11, backgroundColor: "#8B5CF622", alignItems: "center", justifyContent: "center" },
  formTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },
  officialBadge: { backgroundColor: "#10B98122", borderColor: "#10B98155", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  officialBadgeText: { color: "#10B981", fontFamily: "Cairo_700Bold", fontSize: 9 },
  formCat: { color: "#C4B5FD", fontFamily: "Cairo_600SemiBold", fontSize: 10, marginTop: 2 },
  formDesc: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4, lineHeight: 16 },
  printBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#8B5CF6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  printBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11 },

  contractCard: { backgroundColor: "#0F1A14", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#1F2937" },
  contractNo: { color: "#9CA3AF", fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 14, borderWidth: 1 },
  statusPillText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  contractLawyer: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14 },
  contractSvc: { color: "#C4B5FD", fontFamily: "Cairo_600SemiBold", fontSize: 12, marginTop: 2 },
  contractMeta: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11 },
  contractActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  miniBtnText: { fontFamily: "Cairo_700Bold", fontSize: 11 },

  // detail modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#0A0F0C", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, maxHeight: "92%", borderWidth: 1, borderColor: "#1F2937" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#374151", alignSelf: "center", marginBottom: 12 },
  detailHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  avatarLg: { width: 70, height: 70, borderRadius: 18, backgroundColor: "#8B5CF622", borderWidth: 1, borderColor: "#8B5CF655", alignItems: "center", justifyContent: "center" },
  detailName: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 16, flexShrink: 1 },
  detailTitle: { fontFamily: "Cairo_400Regular", color: "#C4B5FD", fontSize: 12, marginTop: 2 },
  detailMeta: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  quickBtn: { flex: 1, minWidth: "22%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 10 },
  quickBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 12 },

  infoBox: { backgroundColor: "#0F1A14", borderRadius: 12, padding: 12, marginTop: 14, borderWidth: 1, borderColor: "#1F2937" },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  infoLineLabel: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11, width: 90 },
  infoLineValue: { color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 12, flex: 1, textAlign: "left" },

  bioBox: { backgroundColor: "#1a0f2e", borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: "#8B5CF633" },
  bioTitle: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 12, marginBottom: 6 },
  bioText: { color: "#E5E7EB", fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 20 },

  section: { marginTop: 18 },
  sectionTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 10 },
  emptyInline: { color: "#6B7280", fontFamily: "Cairo_400Regular", fontSize: 12, fontStyle: "italic" },

  svcCard: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#0F1A14", borderRadius: 11, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#1F2937" },
  svcTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },
  svcDesc: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 3, lineHeight: 16 },
  svcChip: { backgroundColor: "#1F2937", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  svcChipText: { color: "#D1D5DB", fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  contractBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#8B5CF6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  contractBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11 },
  contactGenBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#8B5CF655", borderStyle: "dashed", marginTop: 4 },
  contactGenText: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 12 },

  reviewCard: { backgroundColor: "#0F1A14", borderRadius: 10, padding: 11, marginBottom: 7, borderWidth: 1, borderColor: "#1F2937" },
  reviewName: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 11 },
  reviewText: { color: "#D1D5DB", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 4, lineHeight: 17 },

  // contract & rate modals
  modalOverlay2: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  contractModal: { backgroundColor: "#0F1A14", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#1F2937" },
  contractHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  contractTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14, flex: 1 },
  contractSubt: { color: "#9CA3AF", fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 6, lineHeight: 16 },
  fieldLabel: { color: "#C4B5FD", fontFamily: "Cairo_600SemiBold", fontSize: 11, marginBottom: 5 },
  fieldInput: { backgroundColor: "#0A0F0C", borderRadius: 10, paddingHorizontal: 12, height: 44, color: "#fff", fontFamily: "Cairo_400Regular", fontSize: 13, borderWidth: 1, borderColor: "#1F2937", textAlign: "right" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#1F2937", alignItems: "center" },
  cancelBtnText: { color: "#9CA3AF", fontFamily: "Cairo_700Bold", fontSize: 13 },
  submitBtn: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: "#8B5CF6" },
  submitBtnText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },

  rateModal: { backgroundColor: "#0F1A14", borderRadius: 18, padding: 22, borderWidth: 1, borderColor: "#1F2937" },
  rateTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "center" },
  rateInput: { backgroundColor: "#0A0F0C", borderRadius: 10, padding: 12, color: "#fff", fontFamily: "Cairo_400Regular", fontSize: 12, borderWidth: 1, borderColor: "#1F2937", height: 80, textAlignVertical: "top", textAlign: "right" },

  joinBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#8B5CF6", padding: 14, borderRadius: 14, marginBottom: 14 },
  joinIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  joinTitle: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 13 },
  joinSub: { color: "#EDE9FE", fontFamily: "Cairo_400Regular", fontSize: 10, marginTop: 2 },
  joinHead: { flexDirection: "row", gap: 12, alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  joinHeadIcon: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center" },
  joinSectionTitle: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 13, marginTop: 18, marginBottom: 4, paddingRight: 4, borderRightWidth: 3, borderRightColor: "#8B5CF6" },
  termsBox: { backgroundColor: "#1a0f2e", borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: "#8B5CF655" },
  termsTitle: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 8 },
  termsText: { color: "#D1D5DB", fontFamily: "Cairo_400Regular", fontSize: 11, lineHeight: 22 },
  agreeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 10, backgroundColor: "#0F1A14", borderRadius: 10, borderWidth: 1, borderColor: "#1F2937" },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: "#8B5CF6", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#8B5CF6" },
  agreeText: { color: "#fff", fontFamily: "Cairo_600SemiBold", fontSize: 12, flex: 1 },
  contractsSectionTitle: { color: "#C4B5FD", fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 8, paddingRight: 4, borderRightWidth: 3, borderRightColor: "#8B5CF6" },
});
