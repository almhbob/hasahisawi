// رحلة المريض: مراحل الرحلة، السجل، الموعد القادم، فريق الرعاية، المستندات، والخط الزمني
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, ScrollView, TextInput, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { copyText, notify, confirmAction } from "@/lib/xplatform";
import { DocsGallery, UploadDocSheet } from "@/components/medical/MedicalDocs";
import { journeyApi, fmtDay, type Journey, type CareMember, type MedDoc } from "@/lib/patient-journey";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";
const TL_META: Record<string, { icon: string; color: string }> = {
  appointment: { icon: "calendar", color: GREEN }, prescription: { icon: "document-text", color: "#B7791F" },
  lab: { icon: "flask", color: "#1F5C8A" }, pharmacy: { icon: "medkit", color: "#0F766E" }, document: { icon: "image", color: DEEP },
};

export default function PatientJourneyPanel({ token, userId, view, reloadKey }: { token: string; userId: number; view: "journey" | "docs"; reloadKey?: number }) {
  const [j, setJ] = useState<Journey | null>(null);
  const [err, setErr] = useState("");
  const [upload, setUpload] = useState(false);
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    try { setErr(""); setJ(await journeyApi.journey(token)); } catch (e: any) { setErr(e?.message || "تعذّر تحميل رحلتك"); }
  }, [token]);
  useEffect(() => { load(); }, [load, reloadKey]);

  if (err && !j) return <View style={st.box}><Text style={st.muted}>{err}</Text><Pressable onPress={load} style={st.btnGhost}><Text style={st.btnGhostT}>إعادة المحاولة</Text></Pressable></View>;
  if (!j) return <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} />;

  const member = async (m: CareMember, action: "approve" | "revoke") => {
    if (action === "revoke" && !(await confirmAction(m.status === "pending" ? "رفض الطلب" : "إزالة من فريق الرعاية", `${m.name} لن يتمكن من الاطلاع على ملفك.`, m.status === "pending" ? "رفض" : "إزالة", true))) return;
    try { await journeyApi.member(token, m.id, action); load(); notify(action === "approve" ? "تم الربط ✅" : "تم", action === "approve" ? `${m.name} أصبح ضمن فريق رعايتك` : "أُزيل من فريق الرعاية"); }
    catch (e: any) { notify("تعذّر", e?.message); }
  };
  const toggleShare = async (d: MedDoc) => { try { await journeyApi.patchDoc(token, d.id, { shared: !d.shared }); load(); } catch (e: any) { notify("تعذّر", e?.message); } };
  const delDoc = async (d: MedDoc) => {
    if (!(await confirmAction("حذف المستند", `حذف «${d.title}» من ملفك نهائياً؟`, "حذف", true))) return;
    try { await journeyApi.delDoc(token, d.id); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  const uploadSheet = (
    <UploadDocSheet visible={upload} onClose={() => setUpload(false)} uploaderId={userId}
      onSubmit={async (d) => { await journeyApi.addDoc(token, d); notify("أُضيف المستند ✅", d.shared ? "يراه فريق رعايتك الآن" : "محفوظ في ملفك بشكل خاص"); load(); }} />
  );

  if (view === "docs") {
    return (
      <View style={{ gap: 12 }}>
        <UploadCta onPress={() => setUpload(true)} />
        <DocsGallery docs={j.documents} viewer="patient" onToggleShare={toggleShare} onDelete={delDoc} canDelete={() => true} />
        {uploadSheet}
      </View>
    );
  }

  const doneN = j.steps.filter((s) => s.done).length;
  const pending = j.care_team.filter((m) => m.status === "pending");
  const active = j.care_team.filter((m) => m.status === "active");

  return (
    <View style={{ gap: 14 }}>
      {/* مراحل الرحلة */}
      <Animated.View entering={FadeInDown.springify().damping(16)}>
        <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={st.progress}>
          <View style={st.progHead}>
            <Text style={st.progT}>رحلتك العلاجية</Text>
            <Text style={st.progN}>{doneN}/{j.steps.length}</Text>
          </View>
          <View style={st.bar}><View style={[st.barFill, { width: `${(doneN / j.steps.length) * 100}%` }]} /></View>
          <View style={st.stepsRow}>
            {j.steps.map((s, i) => (
              <View key={s.key} style={st.step}>
                <View style={[st.stepDot, s.done && { backgroundColor: GOLD, borderColor: GOLD }]}>
                  {s.done ? <Ionicons name="checkmark" size={12} color="#3D2C00" /> : <Text style={st.stepNum}>{i + 1}</Text>}
                </View>
                <Text style={st.stepT} numberOfLines={2}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* السجل الطبي */}
      <View style={st.box}>
        {j.record ? (
          <View style={st.recRow}>
            <View style={st.recIcon}><Ionicons name="id-card" size={22} color={GREEN} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>رقم سجلك الطبي — أعطه لطبيبك ليطلب الربط</Text>
              <Text style={st.recNo} selectable>{j.record.record_number}</Text>
              <Text style={st.muted}>{[j.record.blood_type && `فصيلة ${j.record.blood_type}`, j.record.allergies && `حساسية: ${j.record.allergies}`].filter(Boolean).join(" · ") || "أكمل بياناتك الصحية لتظهر لطبيبك"}</Text>
            </View>
            <Pressable onPress={async () => { const r = await copyText(j.record.record_number); if (r === "copied") notify("نُسخ رقم السجل"); }} style={st.iconBtn} accessibilityLabel="نسخ رقم السجل">
              <Ionicons name="copy-outline" size={18} color={DEEP} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.push("/medical-record-setup" as any)} style={st.recRow}>
            <View style={[st.recIcon, { backgroundColor: GOLD + "26" }]}><Ionicons name="add-circle" size={22} color="#7A5900" /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.h}>أنشئ سجلك الطبي</Text>
              <Text style={st.muted}>فصيلة الدم والحساسية والأمراض المزمنة — خطوة واحدة تختصر عليك كل زيارة.</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* الموعد القادم */}
      {j.upcoming ? (
        <View style={[st.box, { borderColor: GREEN + "40", backgroundColor: GREEN + "0A" }]}>
          <View style={st.recRow}>
            <View style={st.recIcon}><Ionicons name="calendar" size={22} color={GREEN} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.lbl}>موعدك القادم</Text>
              <Text style={st.h}>{j.upcoming.facility_name || "منشأة صحية"}</Text>
              <Text style={st.muted}>{fmtDay(j.upcoming.appointment_date)} · {j.upcoming.appointment_time}</Text>
            </View>
          </View>
          <Text style={st.tip}>💡 قبل الموعد: ارفع فحوصاتك القديمة في «مستنداتي» ليطّلع عليها الطبيب.</Text>
        </View>
      ) : null}

      {/* طلبات الربط */}
      {pending.length ? (
        <View style={[st.box, { borderColor: GOLD + "80", backgroundColor: "#FFFBEF" }]}>
          <Text style={st.h}>طلبات ربط بملفك ({pending.length})</Text>
          {pending.map((m) => (
            <View key={m.id} style={st.member}>
              <Avatar m={m} />
              <View style={{ flex: 1 }}>
                <Text style={st.mName}>{m.name}</Text>
                <Text style={st.muted} numberOfLines={1}>{m.type_label}{m.specialty ? ` · ${m.specialty}` : ""}{m.facility_name ? ` · ${m.facility_name}` : ""}</Text>
              </View>
              <Pressable onPress={() => member(m, "approve")} style={[st.small, { backgroundColor: GREEN }]}><Text style={st.smallT}>موافقة</Text></Pressable>
              <Pressable onPress={() => member(m, "revoke")} style={[st.small, { backgroundColor: Colors.bg }]}><Text style={[st.smallT, { color: "#C62828" }]}>رفض</Text></Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* فريق الرعاية */}
      <View style={st.box}>
        <View style={st.secHead}>
          <Text style={st.h}>فريق رعايتي</Text>
          <Pressable onPress={() => setPicker(true)} style={st.addBtn}><Ionicons name="person-add" size={14} color="#fff" /><Text style={st.addT}>إضافة طبيب</Text></Pressable>
        </View>
        {active.length ? active.map((m) => (
          <View key={m.id} style={st.member}>
            <Avatar m={m} />
            <View style={{ flex: 1 }}>
              <Text style={st.mName}>{m.name}</Text>
              <Text style={st.muted} numberOfLines={1}>{m.type_label}{m.specialty ? ` · ${m.specialty}` : ""}{m.facility_name ? ` · ${m.facility_name}` : ""}</Text>
            </View>
            <Pressable onPress={() => member(m, "revoke")} hitSlop={8} accessibilityLabel={`إزالة ${m.name}`}><Ionicons name="close-circle-outline" size={20} color={Colors.textMuted} /></Pressable>
          </View>
        )) : <Text style={st.muted}>أضف طبيبك ليطّلع على ملفك ومستنداتك ويرفع لك التقارير والصور. يمكنك إزالته في أي وقت.</Text>}
        {j.suggested.length ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            <Text style={st.lbl}>عالجوك مؤخراً</Text>
            {j.suggested.map((s) => (
              <Pressable key={s.staff_user_id} onPress={async () => { try { await journeyApi.addMember(token, s.staff_user_id); load(); notify("أُضيف لفريق رعايتك ✅"); } catch (e: any) { notify("تعذّر", e?.message); } }} style={st.suggest}>
                <Ionicons name="add-circle" size={18} color={GREEN} /><Text style={st.suggestT}>{s.name}{s.facility_name ? ` — ${s.facility_name}` : ""}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* المستندات (مختصر) */}
      <View style={st.box}>
        <View style={st.secHead}>
          <Text style={st.h}>مستنداتي ({j.documents.length})</Text>
          <Pressable onPress={() => setUpload(true)} style={[st.addBtn, { backgroundColor: DEEP }]}><Ionicons name="cloud-upload" size={14} color="#fff" /><Text style={st.addT}>رفع صور</Text></Pressable>
        </View>
        {j.documents.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
            {j.documents.slice(0, 8).map((d) => (
              <View key={d.id} style={{ width: 96, gap: 3 }}>
                <Image source={{ uri: d.images[0] }} style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: Colors.bg }} />
                <Text style={st.thumbT} numberOfLines={1}>{d.title}</Text>
              </View>
            ))}
          </ScrollView>
        ) : <UploadCta onPress={() => setUpload(true)} compact />}
      </View>

      {/* الخط الزمني */}
      {j.timeline.length ? (
        <View style={st.box}>
          <Text style={st.h}>السجل الزمني</Text>
          {j.timeline.slice(0, 25).map((t, i) => {
            const m = TL_META[t.type];
            return (
              <View key={`${t.type}-${t.id}`} style={st.tl}>
                <View style={st.tlRail}>
                  <View style={[st.tlDot, { backgroundColor: m.color }]}><Ionicons name={m.icon as any} size={12} color="#fff" /></View>
                  {i < Math.min(j.timeline.length, 25) - 1 ? <View style={st.tlLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 12 }}>
                  <Text style={st.tlT} numberOfLines={1}>{t.title}</Text>
                  <Text style={st.muted} numberOfLines={1}>{fmtDay(t.at)}{t.sub ? ` · ${t.sub}` : ""}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {uploadSheet}
      <DoctorPicker visible={picker} onClose={() => setPicker(false)} exclude={new Set(j.care_team.map((m) => m.staff_user_id))}
        onPick={async (id) => { try { await journeyApi.addMember(token, id); setPicker(false); load(); notify("أُضيف لفريق رعايتك ✅", "يمكنه الآن الاطلاع على ملفك ومستنداتك المشتركة."); } catch (e: any) { notify("تعذّر", e?.message); } }} />
    </View>
  );
}

function UploadCta({ onPress, compact }: { onPress: () => void; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.cta, compact && { paddingVertical: 14 }]} accessibilityRole="button">
      <View style={st.ctaIcon}><Ionicons name="camera" size={22} color={DEEP} /></View>
      <View style={{ flex: 1 }}>
        <Text style={st.h}>أضف فحوصاتك وروشتاتك القديمة</Text>
        <Text style={st.muted}>صوّرها أو اخترها من المعرض — تبقى في ملفك ويراها طبيبك.</Text>
      </View>
      <Ionicons name="add-circle" size={26} color={GREEN} />
    </Pressable>
  );
}

function Avatar({ m }: { m: { avatar_url?: string | null; type_label?: string } }) {
  return m.avatar_url
    ? <Image source={{ uri: m.avatar_url }} style={st.avatar} />
    : <View style={[st.avatar, { alignItems: "center", justifyContent: "center", backgroundColor: GREEN + "14" }]}><Ionicons name="medkit" size={18} color={GREEN} /></View>;
}

function DoctorPicker({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (id: number) => void; exclude: Set<number> }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { if (visible && !list) journeyApi.doctors().then((r) => setList(r.doctors)).catch(() => setList([])); }, [visible, list]);
  const shown = useMemo(() => (list ?? []).filter((d) => !exclude.has(d.user_id) && (!q.trim() || `${d.name} ${d.specialty || ""} ${d.facility_name || ""}`.includes(q.trim()))), [list, q, exclude]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={st.sheetT}>اختر طبيباً لفريق رعايتك</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو التخصص أو المنشأة" placeholderTextColor={Colors.textMuted} style={st.search} />
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {list === null ? <ActivityIndicator color={GREEN} /> : shown.length ? shown.map((d) => (
              <Pressable key={d.user_id} onPress={() => onPick(d.user_id)} style={st.member}>
                <Avatar m={d} />
                <View style={{ flex: 1 }}>
                  <Text style={st.mName}>{d.name}</Text>
                  <Text style={st.muted} numberOfLines={1}>{d.type_label}{d.specialty ? ` · ${d.specialty}` : ""}{d.facility_name ? ` · ${d.facility_name}` : ""}</Text>
                </View>
                <Ionicons name="add-circle" size={24} color={GREEN} />
              </Pressable>
            )) : <Text style={[st.muted, { textAlign: "center" }]}>لا يوجد أطباء مطابقون</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  tip: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: DEEP, textAlign: "right" },
  progress: { borderRadius: 24, padding: 16, gap: 12 },
  progHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  progT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  progN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: GOLD },
  bar: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden", transform: [{ scaleX: -1 }] },
  barFill: { height: 8, borderRadius: 4, backgroundColor: GOLD },
  stepsRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  step: { width: "19%", alignItems: "center", gap: 4 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  stepNum: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  stepT: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: "rgba(255,255,255,0.92)", textAlign: "center" },
  recRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  recIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: GREEN + "14", alignItems: "center", justifyContent: "center" },
  recNo: { fontFamily: "Cairo_700Bold", fontSize: 17, color: DEEP, textAlign: "right", letterSpacing: 0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  secHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: GREEN },
  addT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  member: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  mName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  small: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10 },
  smallT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  suggest: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingVertical: 4 },
  suggestT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: DEEP, textAlign: "right", flex: 1 },
  thumbT: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary, textAlign: "center" },
  cta: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: GREEN + "60", backgroundColor: GREEN + "0A" },
  ctaIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  tl: { flexDirection: "row-reverse", gap: 10 },
  tlRail: { alignItems: "center", width: 26 },
  tlDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tlLine: { flex: 1, width: 2, backgroundColor: Colors.divider, marginTop: 2 },
  tlT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  btnGhost: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.bg },
  btnGhostT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: DEEP },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "85%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 10 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  search: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10 },
});
