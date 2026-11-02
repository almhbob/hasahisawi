// الدورات والورش التدريبية + «ملفي» (المستندات، النتائج، الشهادات الإلكترونية) — الهلال الأحمر، فرعية الحصاحيصا
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import { uploadFile } from "@/lib/firebase/storage";
import { srcsStyles } from "@/components/srcs/styles";
import { fmtDateTime } from "@/components/srcs/DateTimeField";
import DossierView from "@/components/srcs/DossierView";
import { srcsApi, uploadPrivateDoc, SRCS_RED, SRCS_RED_DEEP, DOC_KIND_LABEL, type SrcsCourse, type SrcsDossier, type SrcsSettings } from "@/lib/red-crescent";

type Tab = "courses" | "mine";

export default function SrcsCoursesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { token, isGuest } = useAuth();
  const [tab, setTab] = useState<Tab>(params.tab === "mine" ? "mine" : "courses");
  const [courses, setCourses] = useState<SrcsCourse[] | null>(null);
  const [dossier, setDossier] = useState<SrcsDossier | null>(null);
  const [settings, setSettings] = useState<SrcsSettings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<SrcsCourse | null>(null);
  const [filter, setFilter] = useState<"all" | "course" | "workshop" | "mine">("all");
  const [addDoc, setAddDoc] = useState(false);
  const authed = !!token && !isGuest;

  const load = useCallback(async () => {
    try {
      const [c, st, d] = await Promise.all([srcsApi.courses(authed ? token : null), srcsApi.settings(), authed ? srcsApi.dossier(token!) : Promise.resolve(null)]);
      setCourses(c.courses); setSettings(st); setDossier(d);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); setCourses((p) => p ?? []); }
    finally { setRefreshing(false); }
  }, [token, authed]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upcoming = (c: SrcsCourse) => !c.ends_at || new Date(c.ends_at) > new Date();
  const list = (courses || []).filter((c) => filter === "all" || (filter === "mine" ? !!c.my_enrollment_id : c.kind === filter));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/red-crescent" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>التدريب وملفي</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={s.seg}>
        {([["courses", "الدورات والورش", "school"], ["mine", "ملفي ونتائجي", "folder-open"]] as const).map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segOn]}>
            <Ionicons name={ic} size={16} color={tab === k ? "#fff" : Colors.textSecondary} /><Text style={[s.segTxt, tab === k && { color: "#fff" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SRCS_RED} />}>
        {tab === "courses" ? (
          <>
            <View style={s.banner}>
              <Ionicons name="school" size={26} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>مساحة التدريب</Text>
                <Text style={s.bannerSub}>دورات وورش معتمدة، ملفات تدريبية للتحميل، نتائج فورية وشهادات إلكترونية موثّقة برمز تحقق.</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" }}>
              {([["all", "الكل"], ["course", "دورات"], ["workshop", "ورش"], ["mine", "المسجّل بها"]] as const).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[s.chip, filter === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}><Text style={[s.chipTxt, filter === k && { color: "#fff" }]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            {!courses ? <ActivityIndicator color={SRCS_RED} style={{ marginTop: 20 }} /> : !list.length ? <Text style={s.empty}>لا توجد دورات حالياً.</Text> : list.map((c) => (
              <TouchableOpacity key={c.id} style={s.course} onPress={() => setOpen(c)} activeOpacity={0.9}>
                {c.cover_url ? <Image source={{ uri: c.cover_url }} style={s.cover} /> : (
                  <View style={[s.cover, s.coverPh]}><Ionicons name={c.kind === "workshop" ? "construct" : "school"} size={34} color="#fff" /></View>
                )}
                <View style={{ padding: 12, gap: 6 }}>
                  <View style={s.row}>
                    <View style={s.kind}><Text style={s.kindTxt}>{c.kind === "workshop" ? "ورشة عمل" : "دورة تدريبية"}</Text></View>
                    {upcoming(c) ? (c.registration_open ? <Text style={[s.meta, { color: "#16A34A" }]}>التسجيل مفتوح</Text> : <Text style={s.meta}>التسجيل مغلق</Text>) : <Text style={s.meta}>انتهت</Text>}
                    <View style={{ flex: 1 }} />
                    {c.my_enrollment_id ? <View style={s.enrolled}><Ionicons name="checkmark-circle" size={13} color="#16A34A" /><Text style={[s.meta, { color: "#16A34A" }]}>مسجّل</Text></View> : null}
                  </View>
                  <Text style={s.courseTitle}>{c.title}</Text>
                  <View style={s.row}><Ionicons name="calendar-outline" size={14} color={SRCS_RED} /><Text style={[s.meta, { flex: 1 }]}>{fmtDateTime(c.starts_at)}</Text></View>
                  {c.place ? <View style={s.row}><Ionicons name="location-outline" size={14} color={SRCS_RED} /><Text style={[s.meta, { flex: 1 }]}>{c.place}</Text></View> : null}
                  <View style={s.row}>
                    {c.trainer ? <Text style={s.meta}>المدرب: {c.trainer}</Text> : null}
                    {c.files_count ? <Text style={s.meta}>· {c.files_count} ملف</Text> : null}
                    {c.seats ? <Text style={s.meta}>· {Math.max(0, c.seats - c.enrolled)} مقعد متبقٍ</Text> : null}
                  </View>
                  {c.my_enrollment_id && c.results_published ? (
                    <View style={[s.result, { backgroundColor: c.my_passed ? "#16A34A12" : "#B91C1C10" }]}>
                      <Ionicons name={c.my_passed ? "trophy" : "alert-circle"} size={16} color={c.my_passed ? "#16A34A" : "#B91C1C"} />
                      <Text style={[s.resultTxt, { color: c.my_passed ? "#166534" : "#991B1B" }]}>{c.my_score !== null && c.my_score !== undefined ? `درجتك ${Number(c.my_score)} من ${Number(c.max_score)} — ` : ""}{c.my_passed ? "ناجح 🎉" : "لم تجتز"}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : !authed ? (
          <View style={s.card}><Text style={s.cardTitle}>سجّل الدخول لعرض ملفك</Text><TouchableOpacity style={[s.primary, { flex: 0 }]} onPress={() => router.push("/login" as any)}><Text style={s.primaryTxt}>تسجيل الدخول</Text></TouchableOpacity></View>
        ) : !dossier ? <ActivityIndicator color={SRCS_RED} /> : (
          <>
            <View style={s.syncCard}>
              <Ionicons name="sync-circle" size={22} color={SRCS_RED} />
              <Text style={[s.hint, { flex: 1 }]}>مستنداتك وشهاداتك محفوظة هنا، وتُنسخ الشهادات تلقائياً إلى «الشهادات» في ملفك الشخصي بحصاحيصاوي، وتظهر في حسابك بتطبيق «مسعف» بعد ربط رمز المستجيب في بطاقتك.</Text>
            </View>
            <TouchableOpacity style={s.primary} onPress={() => setAddDoc(true)}><Ionicons name="cloud-upload" size={18} color="#fff" /><Text style={s.primaryTxt}>إضافة مستند إلى ملفي</Text></TouchableOpacity>
            <DossierView data={dossier} showSensitive onDeleteDoc={async (doc) => { if (await confirmAction("حذف المستند", doc.title, "حذف", true)) { try { await srcsApi.deleteDoc(token!, doc.id); load(); } catch (e: any) { notify("تعذّر الحذف", e?.message); } } }} />
          </>
        )}
      </ScrollView>

      <CourseSheet course={open} settings={settings} onClose={() => setOpen(null)} onChanged={() => { load(); }} />
      <AddDocModal visible={addDoc} onClose={() => setAddDoc(false)} onSaved={() => { setAddDoc(false); load(); }} />
    </View>
  );
}

function CourseSheet({ course, settings, onClose, onChanged }: { course: SrcsCourse | null; settings: SrcsSettings | null; onClose: () => void; onChanged: () => void }) {
  const { token, isGuest } = useAuth();
  const [busy, setBusy] = useState(false);
  const [payRef, setPayRef] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [c, setC] = useState<SrcsCourse | null>(null);
  React.useEffect(() => { setC(course); setPayRef(""); setProof(null); }, [course]);
  if (!c) return null;
  const price = settings?.cert_price ?? 0;
  const enroll = async () => {
    if (!token || isGuest) { router.push("/login" as any); return; }
    setBusy(true);
    try { await srcsApi.enroll(token, c.id); notify("تم التسجيل", "ستصلك الإشعارات والملفات الخاصة بالدورة"); const r = await srcsApi.courses(token); setC(r.courses.find((x) => x.id === c.id) || c); onChanged(); }
    catch (e: any) { notify("تعذّر التسجيل", e?.message); } finally { setBusy(false); }
  };
  const unenroll = async () => {
    if (!(await confirmAction("إلغاء التسجيل", c.title, "إلغاء التسجيل", true))) return;
    try { await srcsApi.unenroll(token!, c.id); onChanged(); onClose(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const pickProof = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setBusy(true);
    try { setProof((await uploadPrivateDoc(token!, r.assets[0].uri, { name: r.assets[0].name, mime: r.assets[0].mimeType || null, kind: "payment_proof" })).ref); }
    catch (e: any) { notify("تعذّر الرفع", e?.message); } finally { setBusy(false); }
  };
  const requestCert = async () => {
    setBusy(true);
    try {
      const r = await srcsApi.requestCert(token!, c.id, { payment_ref: payRef.trim(), payment_proof_url: proof });
      if (r.cert_url) { notify("صدرت شهادتك 🎓", "أُضيفت إلى ملفك الشخصي"); openExternal(r.cert_url); }
      else notify("تم إرسال طلبك", "ستصدر الشهادة فور التحقق من الدفع");
      onChanged(); onClose();
    } catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const canCert = c.cert_enabled && c.results_published && c.my_passed;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={[s.sheet, { maxHeight: "94%" }]}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={2}>{c.title}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.infoGrid}>
              <Info icon="calendar" k="البداية" v={fmtDateTime(c.starts_at)} />
              {c.ends_at ? <Info icon="flag" k="النهاية" v={fmtDateTime(c.ends_at)} /> : null}
              <Info icon="location" k="المكان" v={c.place || "—"} />
              {c.trainer ? <Info icon="person" k="المدرب" v={c.trainer} /> : null}
              {c.cert_hours ? <Info icon="time" k="الساعات" v={`${c.cert_hours} ساعة`} /> : null}
              <Info icon="ribbon" k="الشهادة" v={c.cert_enabled ? (price > 0 ? `إلكترونية — ${price.toLocaleString("ar-EG")} ${settings?.cert_currency}` : "إلكترونية مجانية") : "بدون شهادة"} />
            </View>
            {c.description ? <Text style={s.body}>{c.description}</Text> : null}

            {c.my_enrollment_id ? (
              <View style={s.filesBox}>
                <View style={s.row}><Ionicons name="folder-open" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>ملفات الدورة</Text></View>
                {c.files?.length ? c.files.map((f) => (
                  <TouchableOpacity key={f.url} style={s.fileRow} onPress={() => openExternal(f.url)}>
                    <Ionicons name={/pdf/i.test(f.type || f.name) ? "document-text" : /image/i.test(f.type || "") ? "image" : /video/i.test(f.type || "") ? "videocam" : "document"} size={20} color={SRCS_RED} />
                    <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{f.name}</Text>
                    <Ionicons name="download-outline" size={18} color={SRCS_RED} />
                  </TouchableOpacity>
                )) : <Text style={s.meta}>لم تُرفع ملفات بعد.</Text>}
              </View>
            ) : c.files_count ? <Text style={s.hint}>🔒 {c.files_count} ملف تدريبي متاح للمسجلين.</Text> : null}

            {c.my_enrollment_id && c.results_published ? (
              <View style={[s.result, { backgroundColor: c.my_passed ? "#16A34A12" : "#B91C1C10", padding: 12 }]}>
                <Ionicons name={c.my_passed ? "trophy" : "alert-circle"} size={22} color={c.my_passed ? "#16A34A" : "#B91C1C"} />
                <Text style={[s.resultTxt, { fontSize: 14, color: c.my_passed ? "#166534" : "#991B1B" }]}>
                  {c.my_score !== null && c.my_score !== undefined ? `درجتك: ${Number(c.my_score)} من ${Number(c.max_score)}\n` : ""}{c.my_passed ? "مبروك! اجتزت بنجاح" : `لم تبلغ درجة النجاح (${Number(c.pass_mark)})`}
                </Text>
              </View>
            ) : c.my_enrollment_id ? <Text style={s.hint}>⏳ ستظهر نتيجتك هنا فور إعلانها من الإدارة.</Text> : null}

            {canCert ? (
              c.my_cert_status === "issued" && c.my_cert_url ? (
                <TouchableOpacity style={[s.primary, { backgroundColor: "#16A34A" }]} onPress={() => openExternal(c.my_cert_url!)}><Ionicons name="ribbon" size={18} color="#fff" /><Text style={s.primaryTxt}>عرض / طباعة شهادتي</Text></TouchableOpacity>
              ) : c.my_cert_status === "pending" ? (
                <View style={s.pendingBox}><Ionicons name="time" size={18} color="#B45309" /><Text style={[s.hint, { flex: 1 }]}>طلب الشهادة قيد مراجعة الدفع — ستصلك رسالة فور الإصدار.</Text></View>
              ) : c.my_cert_status === "revoked" ? (
                <Text style={[s.hint, { color: Colors.danger }]}>أُلغيت شهادتك — راجع الإدارة.</Text>
              ) : (
                <View style={s.certBox}>
                  <View style={s.row}><Ionicons name="ribbon" size={20} color={SRCS_RED_DEEP} /><Text style={[s.cardTitle, { flex: 1 }]}>الشهادة الإلكترونية الموثّقة</Text>{price > 0 ? <Text style={s.price}>{price.toLocaleString("ar-EG")} {settings?.cert_currency}</Text> : <Text style={[s.price, { color: "#16A34A" }]}>مجانية</Text>}</View>
                  <Text style={s.hint}>شهادة رسمية برمز تحقق QR، قابلة للطباعة، وتُضاف تلقائياً إلى ملفك الشخصي في حصاحيصاوي.</Text>
                  {c.my_cert_status === "rejected" ? <Text style={[s.hint, { color: Colors.danger }]}>لم يُعتمد إثبات الدفع السابق — أعد الإرسال.</Text> : null}
                  {price > 0 ? (
                    <>
                      {settings?.cert_payment_info ? <View style={s.payInfo}><Text style={s.body} selectable>{settings.cert_payment_info}</Text></View> : null}
                      <TextInput value={payRef} onChangeText={setPayRef} placeholder="رقم الإيصال / مرجع التحويل" placeholderTextColor={Colors.textMuted} style={s.input} />
                      <TouchableOpacity style={s.ghost} onPress={pickProof} disabled={busy}>
                        <Ionicons name={proof ? "checkmark-circle" : "image"} size={16} color={proof ? "#16A34A" : SRCS_RED} /><Text style={[s.ghostTxt, proof && { color: "#16A34A" }]}>{proof ? "أُرفق إشعار الدفع" : "إرفاق صورة إشعار الدفع"}</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  <TouchableOpacity style={s.primary} onPress={requestCert} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>{price > 0 ? "إرسال الدفع وطلب الشهادة" : "إصدار شهادتي الآن"}</Text>}</TouchableOpacity>
                </View>
              )
            ) : null}

            {!c.my_enrollment_id ? (
              c.registration_open && (!c.ends_at || new Date(c.ends_at) > new Date()) ? (
                <TouchableOpacity style={s.primary} onPress={enroll} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="person-add" size={18} color="#fff" /><Text style={s.primaryTxt}>سجّل الآن{c.audience === "members" ? " (للأعضاء)" : ""}</Text></>}</TouchableOpacity>
              ) : <Text style={[s.hint, { textAlign: "center" }]}>التسجيل مغلق</Text>
            ) : !c.results_published ? (
              <TouchableOpacity onPress={unenroll}><Text style={[s.meta, { textAlign: "center", color: Colors.danger }]}>إلغاء تسجيلي</Text></TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddDocModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { token, user } = useAuth();
  const [kind, setKind] = useState("certificate");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (visible) { setKind("certificate"); setTitle(""); setUrl(null); } }, [visible]);
  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setBusy(true);
    try {
      const a = r.assets[0];
      // الهوية تُحفظ خاصة؛ الشهادات والرخص عادية لأنها تُنسخ إلى ملفك الشخصي
      setUrl(kind === "national_id" || kind === "photo"
        ? (await uploadPrivateDoc(token!, a.uri, { name: a.name, mime: a.mimeType || null, kind: kind === "national_id" ? "national_id" : "other" })).ref
        : await uploadFile(`srcs_docs/${user?.id ?? "u"}/${Date.now()}_${a.name || "doc"}`, a.uri, { fileName: a.name, mimeType: a.mimeType || null }));
      if (!title) setTitle((a.name || "").replace(/\.[^.]+$/, ""));
    }
    catch (e: any) { notify("تعذّر الرفع", e?.message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!url || title.trim().length < 2) return notify("بيانات ناقصة", "اكتب اسم المستند وأرفق الملف");
    setBusy(true);
    try { await srcsApi.addDoc(token!, { kind, title: title.trim(), url }); notify("أُضيف المستند", kind === "certificate" || kind === "license" ? "ونُسخ إلى شهادات ملفك الشخصي (خاصة)" : ""); onSaved(); }
    catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.cardTitle}>مستند جديد</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
              {["certificate", "license", "national_id", "photo", "other"].map((k) => (
                <TouchableOpacity key={k} onPress={() => setKind(k)} style={[s.chip, kind === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}><Text style={[s.chipTxt, kind === k && { color: "#fff" }]}>{DOC_KIND_LABEL[k]}</Text></TouchableOpacity>
              ))}
            </View>
            <TextInput value={title} onChangeText={setTitle} placeholder="اسم المستند" placeholderTextColor={Colors.textMuted} style={s.input} />
            <TouchableOpacity style={s.ghost} onPress={pick} disabled={busy}>{busy ? <ActivityIndicator color={SRCS_RED} /> : <><Ionicons name={url ? "checkmark-circle" : "cloud-upload"} size={18} color={url ? "#16A34A" : SRCS_RED} /><Text style={[s.ghostTxt, url && { color: "#16A34A" }]}>{url ? "تم رفع الملف — تغيير" : "اختيار صورة أو PDF"}</Text></>}</TouchableOpacity>
            <TouchableOpacity style={s.primary} onPress={save} disabled={busy}><Text style={s.primaryTxt}>حفظ في ملفي</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Info({ icon, k, v }: { icon: any; k: string; v: string }) {
  return (
    <View style={s.info}><Ionicons name={icon} size={15} color={SRCS_RED} /><View style={{ flex: 1 }}><Text style={s.infoK}>{k}</Text><Text style={s.infoV}>{v}</Text></View></View>
  );
}

const s = StyleSheet.create({
  ...srcsStyles,
  seg: { flexDirection: "row-reverse", marginHorizontal: 16, padding: 4, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12 },
  segOn: { backgroundColor: SRCS_RED },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  banner: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: SRCS_RED_DEEP },
  bannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  bannerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  course: { borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  cover: { width: "100%", height: 110 },
  coverPh: { backgroundColor: SRCS_RED, alignItems: "center", justifyContent: "center" },
  kind: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: SRCS_RED + "14" },
  kindTxt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: SRCS_RED },
  enrolled: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  courseTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  result: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 8, borderRadius: 12 },
  resultTxt: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  infoGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  info: { width: "48.5%", flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.bg },
  infoK: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  infoV: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, textAlign: "right" },
  filesBox: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  fileRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  certBox: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: "#FFF7D6", borderWidth: 1, borderColor: "#FACC15" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 15, color: SRCS_RED_DEEP },
  payInfo: { padding: 10, borderRadius: 10, backgroundColor: "#fff" },
  pendingBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: "#B4530912" },
  syncCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: SRCS_RED + "0A", borderWidth: 1, borderColor: SRCS_RED + "30" },
});
