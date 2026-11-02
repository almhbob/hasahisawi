// إدارة الدورات والورش: إنشاء/تعديل بتاريخ ووقت ومكان، رفع ملفات الدورة،
// تسجيل الأعضاء (فرداً أو دفعة كاملة)، رصد النتائج وإعلانها، ومراجعة دفع الشهادات.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, ScrollView, Switch, KeyboardAvoidingView, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { uploadFile } from "@/lib/firebase/storage";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { srcsStyles } from "@/components/srcs/styles";
import DateTimeField, { fmtDateTime } from "@/components/srcs/DateTimeField";
import ZoomViewer from "@/components/srcs/ZoomViewer";
import { CERT_STATUS } from "@/components/srcs/DossierView";
import { srcsApi, SRCS_RED, type SrcsCourse, type SrcsEnrollment, type SrcsCohort, type SrcsFile, type SrcsPerm, type SrcsMember } from "@/lib/red-crescent";

export default function AdminCourses({ perms, isAppAdmin, cohorts, members }: { perms: SrcsPerm[]; isAppAdmin: boolean; cohorts: SrcsCohort[]; members: SrcsMember[] }) {
  const { token } = useAuth();
  const [courses, setCourses] = useState<SrcsCourse[] | null>(null);
  const [pending, setPending] = useState<SrcsEnrollment[]>([]);
  const [edit, setEdit] = useState<Partial<SrcsCourse> | null>(null);
  const [manage, setManage] = useState<SrcsCourse | null>(null);
  const canEdit = perms.includes("courses");
  const canCerts = perms.includes("certificates");
  const [proof, setProof] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [c, p] = await Promise.all([srcsApi.admin.courses(token), canCerts ? srcsApi.admin.pendingCerts(token) : Promise.resolve({ pending: [] })]);
      setCourses(c.courses); setPending(p.pending);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); setCourses([]); }
  }, [token, canCerts]);
  useEffect(() => { load(); }, [load]);

  const certAction = async (e: SrcsEnrollment, action: "approve" | "reject") => {
    try { await srcsApi.admin.certAction(token!, e.id, action, action === "reject" ? "لم يُعثر على التحويل" : undefined); notify(action === "approve" ? "صدرت الشهادة وأُضيفت لملف العضو" : "رُفض الطلب"); load(); }
    catch (err: any) { notify("تعذّر التنفيذ", err?.message); }
  };

  return (
    <View style={{ gap: 12 }}>
      {canCerts && pending.length ? (
        <View style={[s.card, { borderColor: "#B45309" + "66" }]}>
          <View style={s.row}><Ionicons name="card" size={18} color="#B45309" /><Text style={[s.cardTitle, { flex: 1 }]}>مدفوعات شهادات بانتظار المراجعة ({pending.length})</Text></View>
          {pending.map((e) => (
            <View key={e.id} style={s.payRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.itemTitle}>{e.name}</Text>
                <Text style={s.meta}>{e.title} · {Number(e.cert_amount ?? 0).toLocaleString("ar-EG")}{e.payment_ref ? ` · إيصال ${e.payment_ref}` : ""}</Text>
              </View>
              {e.payment_proof_url ? <TouchableOpacity onPress={() => setProof(e.payment_proof_url)} style={s.iconSm}><Ionicons name="image" size={18} color={SRCS_RED} /></TouchableOpacity> : null}
              <TouchableOpacity onPress={() => certAction(e, "approve")} style={[s.iconSm, { backgroundColor: "#16A34A" }]}><Ionicons name="checkmark" size={18} color="#fff" /></TouchableOpacity>
              <TouchableOpacity onPress={() => certAction(e, "reject")} style={s.iconSm}><Ionicons name="close" size={18} color={Colors.danger} /></TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {canEdit ? (
        <TouchableOpacity style={s.primary} onPress={() => setEdit({ kind: "course", audience: "public", registration_open: true, cert_enabled: true, published: true, pass_mark: 50, max_score: 100, files: [] })}>
          <Ionicons name="add" size={18} color="#fff" /><Text style={s.primaryTxt}>دورة أو ورشة جديدة</Text>
        </TouchableOpacity>
      ) : null}
      {!courses ? <ActivityIndicator color={SRCS_RED} /> : !courses.length ? <Text style={s.empty}>لا توجد دورات بعد.</Text> : courses.map((c) => (
        <View key={c.id} style={s.card}>
          {c.cover_url ? <Image source={{ uri: c.cover_url }} style={s.cover} /> : null}
          <View style={s.row}>
            <View style={s.kind}><Ionicons name={c.kind === "workshop" ? "construct" : "school"} size={12} color={SRCS_RED} /><Text style={s.kindTxt}>{c.kind === "workshop" ? "ورشة" : "دورة"}</Text></View>
            {!c.published ? <Text style={[s.meta, { color: Colors.accent }]}>مخفية</Text> : null}
            {c.results_published ? <Text style={[s.meta, { color: "#16A34A" }]}>النتيجة معلنة</Text> : null}
            <Text style={[s.meta, { flex: 1, textAlign: "left" }]}>{c.enrolled}{c.seats ? `/${c.seats}` : ""} مسجل</Text>
          </View>
          <Text style={s.itemTitle}>{c.title}</Text>
          <Text style={s.meta}>{fmtDateTime(c.starts_at)}{c.place ? ` · ${c.place}` : ""}{c.trainer ? ` · المدرب: ${c.trainer}` : ""}{c.cohort_name ? ` · ${c.cohort_name}` : ""}</Text>
          <Text style={s.meta}>{c.files?.length ?? 0} ملف · ناجحون {c.passed_count ?? 0}{c.cert_pending ? ` · ${c.cert_pending} دفع بانتظار المراجعة` : ""}</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <TouchableOpacity style={s.ghost} onPress={() => setManage(c)}><Ionicons name="people" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>المسجلون والنتائج</Text></TouchableOpacity>
            {canEdit ? <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 14 }]} onPress={() => setEdit(c)}><Ionicons name="create-outline" size={16} color={SRCS_RED} /></TouchableOpacity> : null}
            {canEdit ? <TouchableOpacity style={[s.ghost, { flex: 0, paddingHorizontal: 14 }]} onPress={async () => { if (await confirmAction("حذف الدورة", c.title, "حذف", true)) { try { await srcsApi.admin.deleteCourse(token!, c.id); load(); } catch (e: any) { notify("تعذّر الحذف", e?.message); } } }}><Ionicons name="trash-outline" size={16} color={SRCS_RED} /></TouchableOpacity> : null}
          </View>
        </View>
      ))}

      <CourseForm value={edit} cohorts={cohorts} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <EnrollmentsModal course={manage} perms={perms} isAppAdmin={isAppAdmin} cohorts={cohorts} members={members} onClose={() => { setManage(null); load(); }} />
      <ZoomViewer visible={!!proof} onClose={() => setProof(null)} title="إشعار الدفع" pages={proof ? [{ label: "إشعار الدفع", ratio: 1.3, render: (w) => <Image source={{ uri: proof }} style={{ width: w, height: w * 1.3 }} resizeMode="contain" /> }] : []} />
    </View>
  );
}

function CourseForm({ value, cohorts, onClose, onSaved }: { value: Partial<SrcsCourse> | null; cohorts: SrcsCohort[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [f, setF] = useState<Partial<SrcsCourse>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (value) setF({ ...value, files: [...(value.files || [])] }); }, [value]);
  const set = (k: keyof SrcsCourse, v: any) => setF((p) => ({ ...p, [k]: v }));

  const addFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: "*/*" });
    if (r.canceled || !r.assets?.length) return;
    setUploading(true);
    try {
      const added: SrcsFile[] = [];
      for (const a of r.assets.slice(0, 10)) {
        const safe = (a.name || `file_${Date.now()}`).replace(/[\\/]+/g, "_");
        const url = await uploadFile(`srcs_courses/${Date.now()}_${safe}`, a.uri, { fileName: safe, mimeType: a.mimeType || null });
        added.push({ name: a.name || "ملف", url, size: a.size ?? null, type: a.mimeType ?? null });
      }
      setF((p) => ({ ...p, files: [...(p.files || []), ...added] }));
    } catch (e: any) { notify("تعذّر رفع الملف", e?.message); }
    finally { setUploading(false); }
  };
  const addCover = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/*"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    try { set("cover_url", await uploadFile(`srcs_courses/cover_${Date.now()}.jpg`, r.assets[0].uri, { mimeType: r.assets[0].mimeType || "image/jpeg" })); }
    catch (e: any) { notify("تعذّر رفع الصورة", e?.message); } finally { setUploading(false); }
  };
  const save = async () => {
    if (!token) return;
    if (!f.title?.trim()) return notify("بيانات ناقصة", "اكتب عنوان الدورة");
    if (!f.starts_at) return notify("بيانات ناقصة", "حدّد تاريخ ووقت البدء");
    if (!f.place?.trim()) return notify("بيانات ناقصة", "حدّد مكان الانعقاد");
    setBusy(true);
    try {
      const b = { title: f.title, kind: f.kind, description: f.description, trainer: f.trainer, place: f.place, starts_at: f.starts_at, ends_at: f.ends_at,
        seats: Number(f.seats) || 0, cohort_id: f.cohort_id ?? null, cover_url: f.cover_url, files: f.files, audience: f.audience, registration_open: f.registration_open,
        pass_mark: Number(f.pass_mark) || 50, max_score: Number(f.max_score) || 100, cert_enabled: f.cert_enabled, cert_hours: Number(f.cert_hours) || null, published: f.published };
      if (f.id) await srcsApi.admin.updateCourse(token, f.id, b); else await srcsApi.admin.createCourse(token, b);
      onSaved();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={!!value} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.cardTitle}>{f.id ? "تعديل" : "إضافة"} {f.kind === "workshop" ? "ورشة" : "دورة"}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              {(["course", "workshop"] as const).map((k) => (
                <TouchableOpacity key={k} onPress={() => set("kind", k)} style={[s.chip, { flex: 1 }, f.kind === k && s.chipOn]}><Text style={[s.chipTxt, f.kind === k && { color: "#fff" }]}>{k === "course" ? "دورة تدريبية" : "ورشة عمل"}</Text></TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>العنوان *</Text>
            <TextInput value={f.title || ""} onChangeText={(v) => set("title", v)} placeholder="مثال: الإسعافات الأولية الأساسية" placeholderTextColor={Colors.textMuted} style={s.input} />
            <DateTimeField label="البداية" required value={f.starts_at} onChange={(v) => set("starts_at", v)} />
            <DateTimeField label="النهاية (اختياري)" value={f.ends_at} onChange={(v) => set("ends_at", v)} minDate={f.starts_at ? new Date(f.starts_at) : undefined} />
            <Text style={s.label}>المكان *</Text>
            <TextInput value={f.place || ""} onChangeText={(v) => set("place", v)} placeholder="القاعة أو العنوان" placeholderTextColor={Colors.textMuted} style={s.input} />
            <PlaceChips onPick={(p) => set("place", p)} />
            <Text style={s.label}>المدرب / الجهة المنفذة</Text>
            <TextInput value={f.trainer || ""} onChangeText={(v) => set("trainer", v)} placeholderTextColor={Colors.textMuted} style={s.input} />
            <Text style={s.label}>الوصف والمحاور</Text>
            <TextInput value={f.description || ""} onChangeText={(v) => set("description", v)} multiline placeholderTextColor={Colors.textMuted} placeholder="أهداف الدورة، المحاور، المتطلبات" style={[s.input, { height: 110, textAlignVertical: "top" }]} />
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <Num label="المقاعد (0 = مفتوح)" v={f.seats} on={(v) => set("seats", v)} />
              <Num label="ساعات الشهادة" v={f.cert_hours} on={(v) => set("cert_hours", v)} />
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <Num label="الدرجة الكاملة" v={f.max_score} on={(v) => set("max_score", v)} />
              <Num label="درجة النجاح" v={f.pass_mark} on={(v) => set("pass_mark", v)} />
            </View>
            {cohorts.length ? (
              <>
                <Text style={s.label}>الدفعة (اختياري)</Text>
                <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                  <TouchableOpacity onPress={() => set("cohort_id", null)} style={[s.chip, !f.cohort_id && s.chipOn]}><Text style={[s.chipTxt, !f.cohort_id && { color: "#fff" }]}>بلا دفعة</Text></TouchableOpacity>
                  {cohorts.map((c) => <TouchableOpacity key={c.id} onPress={() => set("cohort_id", c.id)} style={[s.chip, f.cohort_id === c.id && s.chipOn]}><Text style={[s.chipTxt, f.cohort_id === c.id && { color: "#fff" }]}>{c.name}</Text></TouchableOpacity>)}
                </RtlScrollRow>
              </>
            ) : null}
            <Text style={s.label}>متاحة لـ</Text>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              {([["public", "الجميع"], ["members", "أعضاء الجمعية"]] as const).map(([k, l]) => (
                <TouchableOpacity key={k} onPress={() => set("audience", k)} style={[s.chip, { flex: 1 }, f.audience === k && s.chipOn]}><Text style={[s.chipTxt, f.audience === k && { color: "#fff" }]}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            <Toggle label="التسجيل مفتوح" v={!!f.registration_open} on={(v) => set("registration_open", v)} />
            <Toggle label="تُصدر شهادة إلكترونية للناجحين" v={!!f.cert_enabled} on={(v) => set("cert_enabled", v)} />
            <Toggle label="منشورة للأعضاء" v={!!f.published} on={(v) => set("published", v)} />

            <View style={s.filesBox}>
              <View style={s.row}><Ionicons name="folder-open" size={18} color={SRCS_RED} /><Text style={[s.cardTitle, { flex: 1 }]}>ملفات الدورة ({f.files?.length ?? 0})</Text></View>
              <Text style={s.hint}>حقائب تدريبية، عروض، أدلة PDF… يحمّلها المسجلون من التطبيق.</Text>
              {(f.files || []).map((x, i) => (
                <View key={x.url} style={s.fileRow}>
                  <Ionicons name={/pdf/i.test(x.type || x.name) ? "document-text" : /image/i.test(x.type || "") ? "image" : /video/i.test(x.type || "") ? "videocam" : "document"} size={18} color={SRCS_RED} />
                  <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>{x.name}</Text>
                  <TouchableOpacity onPress={() => setF((p) => ({ ...p, files: (p.files || []).filter((_, j) => j !== i) }))} hitSlop={8}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></TouchableOpacity>
                </View>
              ))}
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <TouchableOpacity style={s.ghost} onPress={addFiles} disabled={uploading}>{uploading ? <ActivityIndicator color={SRCS_RED} /> : <><Ionicons name="cloud-upload" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>رفع ملفات</Text></>}</TouchableOpacity>
                <TouchableOpacity style={s.ghost} onPress={addCover} disabled={uploading}><Ionicons name="image" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>{f.cover_url ? "تغيير الغلاف" : "صورة غلاف"}</Text></TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={[s.primary, (busy || uploading) && { opacity: 0.6 }]} onPress={save} disabled={busy || uploading}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>{f.id ? "حفظ التعديلات" : "نشر وإشعار الأعضاء"}</Text>}</TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EnrollmentsModal({ course, perms, isAppAdmin, cohorts, members, onClose }: { course: SrcsCourse | null; perms: SrcsPerm[]; isAppAdmin: boolean; cohorts: SrcsCohort[]; members: SrcsMember[]; onClose: () => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<(SrcsEnrollment & { _score?: string })[] | null>(null);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const canResults = perms.includes("results") || perms.includes("courses");
  const canCerts = perms.includes("certificates");
  const load = useCallback(async () => {
    if (!course || !token) return;
    try { const r = await srcsApi.admin.enrollments(token, course.id); setRows(r.enrollments.map((e) => ({ ...e, _score: e.score === null ? "" : String(Number(e.score)) }))); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); setRows([]); }
  }, [course, token]);
  useEffect(() => { setRows(null); setPublished(!!course?.results_published); load(); }, [course, load]);

  const saveResults = async () => {
    if (!rows || !course) return;
    setBusy(true);
    try {
      const r = await srcsApi.admin.saveResults(token!, course.id, rows.map((e) => ({ id: e.id, score: e._score === "" || e._score === undefined ? null : Number(e._score), attended: e.attended })));
      notify("تم الحفظ", `رُصدت ${r.saved} نتيجة`); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  const togglePublish = async () => {
    try { await srcsApi.admin.updateCourse(token!, course!.id, { results_published: !published }); setPublished(!published); notify(!published ? "أُعلنت النتيجة وأُشعر المسجلون" : "أُخفيت النتيجة"); }
    catch (e: any) { notify("تعذّر", e?.message); }
  };
  const cert = async (e: SrcsEnrollment, action: "issue" | "revoke" | "restore") => {
    try { await srcsApi.admin.certAction(token!, e.id, action); load(); } catch (err: any) { notify("تعذّر", err?.message); }
  };
  const enrollCohort = async (cohortId: number) => {
    try { const r = await srcsApi.admin.enrollUsers(token!, course!.id, { cohort_id: cohortId }); notify("تم", `أُضيف ${r.added} عضو`); setAdding(false); load(); }
    catch (e: any) { notify("تعذّر", e?.message); }
  };
  const enrollMember = async (uid: number) => {
    try { await srcsApi.admin.enrollUsers(token!, course!.id, { user_ids: [uid] }); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const max = Number(course?.max_score ?? 100), pass = Number(course?.pass_mark ?? 50);

  return (
    <Modal visible={!!course} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={[s.sheet, { maxHeight: "94%" }]}>
          <View style={s.sheetHead}><Text style={s.cardTitle} numberOfLines={1}>{course?.title}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity></View>
          <Text style={s.meta}>الدرجة الكاملة {max} · النجاح من {pass} · {rows?.length ?? 0} مسجل</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            {perms.includes("courses") ? <TouchableOpacity style={s.ghost} onPress={() => setAdding((v) => !v)}><Ionicons name="person-add" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>إضافة مسجلين</Text></TouchableOpacity> : null}
            {canResults ? <TouchableOpacity style={[s.ghost, published && { backgroundColor: "#16A34A15", borderColor: "#16A34A" }]} onPress={togglePublish}><Ionicons name={published ? "eye" : "megaphone"} size={16} color={published ? "#16A34A" : SRCS_RED} /><Text style={[s.ghostTxt, published && { color: "#16A34A" }]}>{published ? "النتيجة معلنة" : "إعلان النتيجة"}</Text></TouchableOpacity> : null}
          </View>
          {adding ? (
            <View style={s.filesBox}>
              {cohorts.length ? <Text style={s.label}>تسجيل دفعة كاملة</Text> : null}
              <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
                {cohorts.map((c) => <TouchableOpacity key={c.id} style={s.chip} onPress={() => enrollCohort(c.id)}><Text style={s.chipTxt}>{c.name} ({c.members})</Text></TouchableOpacity>)}
              </RtlScrollRow>
              <Text style={s.label}>أو عضو بعينه</Text>
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                {members.filter((m) => m.status === "active" && !rows?.some((r) => r.user_id === m.user_id)).map((m) => (
                  <TouchableOpacity key={m.id} style={[s.row, { paddingVertical: 6 }]} onPress={() => enrollMember(m.user_id)}>
                    <Ionicons name="add-circle" size={18} color={SRCS_RED} /><Text style={[s.body, { flex: 1 }]}>{m.name}</Text><Text style={s.meta}>{m.cohort_name || ""}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            {!rows ? <ActivityIndicator color={SRCS_RED} /> : !rows.length ? <Text style={s.empty}>لا يوجد مسجلون بعد.</Text> : rows.map((e, i) => {
              const sc = e._score === "" || e._score === undefined ? null : Number(e._score);
              const ok = sc === null ? null : sc >= pass;
              const cs = CERT_STATUS[e.cert_status] ?? CERT_STATUS.none;
              return (
                <View key={e.id} style={s.enrRow}>
                  <TouchableOpacity onPress={() => canResults && setRows((p) => p!.map((x, j) => (j === i ? { ...x, attended: !x.attended } : x)))} hitSlop={6}>
                    <Ionicons name={e.attended ? "checkbox" : "square-outline"} size={22} color={SRCS_RED} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle} numberOfLines={1}>{e.name}</Text>
                    <Text style={[s.meta, { color: cs[1] }]} numberOfLines={1}>{e.cohort_name ? `${e.cohort_name} · ` : ""}{e.cert_status !== "none" ? `الشهادة: ${cs[0]}` : e.unit || ""}</Text>
                  </View>
                  {canResults ? (
                    <TextInput value={e._score} onChangeText={(v) => setRows((p) => p!.map((x, j) => (j === i ? { ...x, _score: v.replace(/[^\d.]/g, "") } : x)))}
                      keyboardType="decimal-pad" placeholder="—" placeholderTextColor={Colors.textMuted} style={[s.scoreIn, ok === true && { borderColor: "#16A34A" }, ok === false && { borderColor: Colors.danger }]} />
                  ) : <Text style={s.itemTitle}>{e.score ?? "—"}</Text>}
                  {canCerts && e.passed && e.cert_status !== "issued" && e.cert_status !== "revoked" ? (
                    <TouchableOpacity onPress={() => cert(e, "issue")} style={s.iconSm} accessibilityLabel="إصدار الشهادة مجاناً"><Ionicons name="ribbon" size={16} color={SRCS_RED} /></TouchableOpacity>
                  ) : null}
                  {e.cert_url ? <TouchableOpacity onPress={() => openExternal(e.cert_url!)} style={s.iconSm}><Ionicons name="open-outline" size={16} color={SRCS_RED} /></TouchableOpacity> : null}
                  {isAppAdmin && (e.cert_status === "issued" || e.cert_status === "revoked") ? (
                    <TouchableOpacity onPress={async () => { if (await confirmAction(e.cert_status === "issued" ? "إلغاء الشهادة" : "استعادة الشهادة", e.name || "", "تأكيد", e.cert_status === "issued")) cert(e, e.cert_status === "issued" ? "revoke" : "restore"); }} style={s.iconSm}>
                      <Ionicons name={e.cert_status === "issued" ? "ban" : "refresh"} size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          {canResults && rows?.length ? <TouchableOpacity style={s.primary} onPress={saveResults} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>حفظ الحضور والدرجات</Text>}</TouchableOpacity> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PlaceChips({ onPick }: { onPick: (p: string) => void }) {
  return (
    <RtlScrollRow contentContainerStyle={{ gap: 6 }}>
      {["مقر فرعية الهلال الأحمر — الحصاحيصا", "قاعة الاجتماعات بالفرعية", "مستشفى الحصاحيصا", "اجتماع عن بُعد (رابط)"].map((p) => (
        <TouchableOpacity key={p} style={[s.chip, { height: 32 }]} onPress={() => onPick(p)}><Text style={[s.chipTxt, { fontSize: 12 }]}>{p}</Text></TouchableOpacity>
      ))}
    </RtlScrollRow>
  );
}
function Num({ label, v, on }: { label: string; v: any; on: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={v === null || v === undefined ? "" : String(v)} onChangeText={(t) => on(t.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={[s.input, { textAlign: "center" }]} />
    </View>
  );
}
function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <View style={s.row}><Switch value={v} onValueChange={on} trackColor={{ true: SRCS_RED }} /><Text style={[s.label, { flex: 1 }]}>{label}</Text></View>;
}

const s = StyleSheet.create({
  ...srcsStyles,
  chipOn: { backgroundColor: SRCS_RED, borderColor: SRCS_RED },
  cover: { width: "100%", height: 130, borderRadius: 12 },
  kind: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: SRCS_RED + "14" },
  kindTxt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: SRCS_RED },
  filesBox: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  fileRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 4 },
  payRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  iconSm: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  enrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  scoreIn: { width: 64, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
});
