// «مرضاي» في بوابة الكادر الطبي: ربط مريض برقم سجله، قائمة المرضى، والملف الطبي الكامل مع تبادل الصور
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Modal, ScrollView, RefreshControl, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { DocsGallery, UploadDocSheet } from "@/components/medical/MedicalDocs";
import { journeyApi, fmtDay, type StaffPatient, type PatientFile, type MedDoc } from "@/lib/patient-journey";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";

function age(d?: string | null) {
  if (!d) return null;
  const a = Math.floor((Date.now() - new Date(d).getTime()) / (365.25 * 864e5));
  return a > 0 && a < 130 ? a : null;
}

export default function StaffPatients() {
  const { token, user } = useAuth();
  const [list, setList] = useState<StaffPatient[] | null>(null);
  const [err, setErr] = useState("");
  const [rn, setRn] = useState("");
  const [linking, setLinking] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<StaffPatient | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setErr(""); setList((await journeyApi.patients(token)).patients); }
    catch (e: any) { setErr(e?.message || "تعذّر التحميل"); setList([]); }
    finally { setRefreshing(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const link = async () => {
    if (!token || rn.trim().length < 4) return notify("اكتب رقم السجل", "يجده المريض في «رحلتي الطبية».");
    setLinking(true);
    try {
      const r = await journeyApi.link(token, rn.trim());
      setRn("");
      notify(r.already ? "المريض مرتبط بك مسبقاً" : "أُرسل طلب الربط ✅", r.already ? "" : `بانتظار موافقة ${r.patient_name || "المريض"} — يصله إشعار الآن.`);
      load();
    } catch (e: any) { notify("تعذّر الربط", e?.message); }
    finally { setLinking(false); }
  };

  const shown = (list ?? []).filter((p) => !q.trim() || `${p.name} ${p.record_number || ""}`.includes(q.trim()));
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={GREEN} />}>
      <View style={st.linkCard}>
        <View style={st.row}>
          <View style={st.linkIcon}><Ionicons name="link" size={20} color={DEEP} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.h}>ربط مريض جديد</Text>
            <Text style={st.muted}>اطلب رقم السجل الطبي من المريض — يوافق على الطلب من هاتفه فيُفتح لك ملفه.</Text>
          </View>
        </View>
        <View style={st.row}>
          <TextInput value={rn} onChangeText={setRn} placeholder="رقم السجل (مثال: PMR-12-…)" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" style={[st.input, { flex: 1 }]} />
          <Pressable onPress={link} disabled={linking} style={[st.btn, linking && { opacity: 0.6 }]}>
            {linking ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.btnT}>طلب ربط</Text>}
          </Pressable>
        </View>
      </View>

      <View style={st.row}>
        <Text style={[st.h, { flex: 1 }]}>مرضاي {list ? `(${list.filter((p) => p.status === "active").length})` : ""}</Text>
      </View>
      {list && list.length > 4 ? <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو رقم السجل" placeholderTextColor={Colors.textMuted} style={st.input} /> : null}

      {list === null ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : err ? <Text style={st.muted}>{err}</Text> : !shown.length ? (
        <View style={st.empty}>
          <Ionicons name="people-outline" size={34} color={Colors.textMuted} />
          <Text style={st.muted}>لا يوجد مرضى مرتبطون بك بعد. يظهر هنا من يضيفك لفريق رعايته، ومن توافق على طلب ربطه.</Text>
        </View>
      ) : shown.map((p) => (
        <Pressable key={p.link_id} onPress={() => p.status === "active" ? setOpen(p) : notify("بانتظار موافقة المريض", "يُفتح الملف فور موافقته على طلب الربط.")} style={st.patient}>
          <View style={[st.pAvatar, p.status === "pending" && { backgroundColor: GOLD + "26" }]}>
            {p.avatar_url ? <Image source={{ uri: p.avatar_url }} style={st.pAvatarImg} /> : <Ionicons name="person" size={20} color={p.status === "pending" ? "#7A5900" : GREEN} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.pName} numberOfLines={1}>{p.name}</Text>
            <Text style={st.muted} numberOfLines={1}>
              {[p.record_number, p.blood_type && `فصيلة ${p.blood_type}`, age(p.birth_date) && `${age(p.birth_date)} سنة`].filter(Boolean).join(" · ") || "بدون سجل طبي"}
            </Text>
          </View>
          {p.status === "pending" ? (
            <View style={st.pendingPill}><Text style={st.pendingT}>بانتظار الموافقة</Text></View>
          ) : (
            <View style={st.docsPill}><Ionicons name="images" size={12} color={DEEP} /><Text style={st.docsT}>{p.docs}</Text></View>
          )}
        </Pressable>
      ))}

      {open && token && user ? <PatientFileSheet patient={open} token={token} userId={Number(user.id)} onClose={() => { setOpen(null); load(); }} /> : null}
    </ScrollView>
  );
}

function PatientFileSheet({ patient, token, userId, onClose }: { patient: StaffPatient; token: string; userId: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<PatientFile | null>(null);
  const [err, setErr] = useState("");
  const [upload, setUpload] = useState(false);
  const [tab, setTab] = useState<"docs" | "rx" | "labs">("docs");
  const load = useCallback(async () => {
    try { setErr(""); setF(await journeyApi.file(token, patient.user_id)); } catch (e: any) { setErr(e?.message || "تعذّر فتح الملف"); }
  }, [token, patient.user_id]);
  useEffect(() => { load(); }, [load]);
  const del = async (d: MedDoc) => {
    if (!(await confirmAction("حذف المستند", `حذف «${d.title}» من ملف المريض؟`, "حذف", true))) return;
    try { await journeyApi.delDoc(token, d.id); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const rec = f?.record;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg, paddingTop: insets.top }}>
        <View style={st.fileHead}>
          <Pressable onPress={onClose} style={st.close} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.textPrimary} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.fileT} numberOfLines={1}>{rec?.full_name || patient.name}</Text>
            <Text style={st.muted}>{rec?.record_number || "ملف المريض"}</Text>
          </View>
          <Pressable onPress={() => setUpload(true)} style={[st.btn, { flexDirection: "row-reverse", gap: 5 }]}>
            <Ionicons name="cloud-upload" size={15} color="#fff" /><Text style={st.btnT}>رفع صورة</Text>
          </Pressable>
        </View>
        {!f ? (err ? <Text style={[st.muted, { padding: 20, textAlign: "center" }]}>{err}</Text> : <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 30 }}>
            {/* بطاقة المريض الصحية */}
            <View style={st.vitals}>
              {[
                ["water", "الفصيلة", rec?.blood_type || "—"],
                ["calendar", "العمر", age(rec?.birth_date) ? `${age(rec?.birth_date)} سنة` : "—"],
                ["person", "النوع", rec?.gender === "male" ? "ذكر" : rec?.gender === "female" ? "أنثى" : "—"],
              ].map(([ic, l, v]) => (
                <View key={l} style={st.vital}><Ionicons name={ic as any} size={16} color={GREEN} /><Text style={st.vitalL}>{l}</Text><Text style={st.vitalV}>{v}</Text></View>
              ))}
            </View>
            {rec?.allergies || rec?.chronic_diseases ? (
              <View style={st.alert}>
                <Ionicons name="warning" size={18} color="#B45309" />
                <View style={{ flex: 1 }}>
                  {rec?.allergies ? <Text style={st.alertT}>حساسية: {rec.allergies}</Text> : null}
                  {rec?.chronic_diseases ? <Text style={st.alertT}>أمراض مزمنة: {rec.chronic_diseases}</Text> : null}
                </View>
              </View>
            ) : null}
            {f.access === "care" ? <Text style={st.muted}>🔗 وصول عبر علاقة علاج حديثة (وصفة/تحليل). يستطيع المريض إلغاءه.</Text> : null}

            <View style={st.tabs}>
              {([["docs", `المستندات (${f.documents.length})`], ["rx", `الوصفات (${f.prescriptions.length})`], ["labs", `التحاليل (${f.lab_results.length})`]] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]}><Text style={[st.tabT, tab === k && { color: "#fff" }]}>{l}</Text></Pressable>
              ))}
            </View>

            {tab === "docs" ? (
              <DocsGallery docs={f.documents} viewer="staff" onDelete={del} canDelete={(d) => d.uploader_role === "staff" && d.uploaded_by === userId}
                emptyHint="لم يشارك المريض مستندات بعد. يمكنك رفع تقرير أو صورة أشعة أو روشتة لملفه." />
            ) : tab === "rx" ? (
              f.prescriptions.length ? f.prescriptions.map((r) => (
                <View key={r.id} style={st.item}>
                  <Text style={st.itemT}>{r.diagnosis || "وصفة طبية"}</Text>
                  <Text style={st.muted}>{r.doctor_name || ""}{r.facility_name ? ` · ${r.facility_name}` : ""} · {fmtDay(r.created_at)}</Text>
                  <Text style={st.meds}>{(Array.isArray(r.medications) ? r.medications : []).map((m: any) => `💊 ${m.name}${m.dosage ? ` ${m.dosage}` : ""}`).join("\n")}</Text>
                </View>
              )) : <Text style={st.muted}>لا توجد وصفات</Text>
            ) : (
              f.lab_results.length ? f.lab_results.map((l) => (
                <View key={l.id} style={st.item}>
                  <Text style={st.itemT}>نتيجة تحليل — {fmtDay(l.ready_at)}</Text>
                  {l.summary_notes ? <Text style={st.muted}>{l.summary_notes}</Text> : null}
                  <Text style={st.meds}>{(Array.isArray(l.results_data) ? l.results_data : []).map((x: any) => `• ${x.test_name || x.name}: ${x.value ?? "—"} ${x.unit || ""}${x.flag === "high" ? " ▲" : x.flag === "low" ? " ▼" : ""}`).join("\n")}</Text>
                </View>
              )) : <Text style={st.muted}>لا توجد نتائج تحاليل</Text>
            )}
          </ScrollView>
        )}
        <UploadDocSheet visible={upload} onClose={() => setUpload(false)} uploaderId={userId} forStaff patientName={rec?.full_name || patient.name}
          onSubmit={async (d) => { await journeyApi.staffDoc(token, patient.user_id, d); notify("أُضيف لملف المريض ✅", "وصله إشعار بالمستند."); setTab("docs"); load(); }} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  linkCard: { backgroundColor: "#FFFBEF", borderRadius: 22, padding: 14, gap: 12, borderWidth: 1, borderColor: GOLD + "70" },
  linkIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { backgroundColor: DEEP, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  empty: { alignItems: "center", gap: 8, padding: 22, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider },
  patient: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  pAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: GREEN + "14", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pAvatarImg: { width: 46, height: 46 },
  pName: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  pendingPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: GOLD + "26" },
  pendingT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#7A5900" },
  docsPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: GREEN + "14" },
  docsT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: DEEP },
  fileHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.cardBg },
  close: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  fileT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  vitals: { flexDirection: "row-reverse", gap: 8 },
  vital: { flex: 1, alignItems: "center", gap: 2, padding: 10, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  vitalL: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },
  vitalV: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  alert: { flexDirection: "row-reverse", gap: 8, padding: 12, borderRadius: 16, backgroundColor: "#FFF4E5", borderWidth: 1, borderColor: "#F5C77E" },
  alertT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#8A4B00", textAlign: "right" },
  tabs: { flexDirection: "row-reverse", gap: 6, padding: 4, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12 },
  tabOn: { backgroundColor: DEEP },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  item: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.divider },
  itemT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  meds: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
});
