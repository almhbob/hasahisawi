// معرض المستندات الطبية + نافذة رفع مستند (مشتركة بين المريض والكادر)
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Modal, ScrollView, TextInput, ActivityIndicator, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImageLightbox from "@/components/ImageLightbox";
import { DateInput } from "@/components/ui/DateTimeField";
import Colors from "@/constants/colors";
import { DOC_KIND_META, DOC_KINDS, fmtDay, pickImages, uploadMedicalImages, type DocKind, type MedDoc, type NewDoc } from "@/lib/patient-journey";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";

export function DocsGallery({ docs, viewer, onToggleShare, onDelete, canDelete, emptyHint }: {
  docs: MedDoc[]; viewer: "patient" | "staff";
  onToggleShare?: (d: MedDoc) => void; onDelete?: (d: MedDoc) => void; canDelete?: (d: MedDoc) => boolean; emptyHint?: string;
}) {
  const [filter, setFilter] = useState<DocKind | "all">("all");
  const [zoom, setZoom] = useState<{ uri: string; title: string } | null>(null);
  const kinds = useMemo(() => DOC_KINDS.filter((k) => docs.some((d) => d.kind === k)), [docs]);
  const shown = filter === "all" ? docs : docs.filter((d) => d.kind === filter);

  if (!docs.length) {
    return (
      <View style={st.empty}>
        <View style={st.emptyIcon}><Ionicons name="images-outline" size={30} color={GREEN} /></View>
        <Text style={st.emptyT}>لا توجد مستندات بعد</Text>
        <Text style={st.emptyS}>{emptyHint || "أضف صور فحوصاتك القديمة وروشتاتك وتقاريرك ليطّلع عليها طبيبك."}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {kinds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: "row-reverse" }}>
          {(["all", ...kinds] as const).map((k) => {
            const on = filter === k; const m = k === "all" ? null : DOC_KIND_META[k];
            return (
              <Pressable key={k} onPress={() => setFilter(k)} style={[st.chip, on && { backgroundColor: DEEP, borderColor: DEEP }]}>
                {m ? <Ionicons name={m.icon as any} size={13} color={on ? "#fff" : m.color} /> : null}
                <Text style={[st.chipT, on && { color: "#fff" }]}>{m ? m.label : `الكل (${docs.length})`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {shown.map((d) => {
        const m = DOC_KIND_META[d.kind] ?? DOC_KIND_META.other;
        return (
          <View key={d.id} style={st.doc}>
            <View style={st.docHead}>
              <View style={[st.docIcon, { backgroundColor: m.color + "18" }]}><Ionicons name={m.icon as any} size={18} color={m.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.docT} numberOfLines={2}>{d.title}</Text>
                <Text style={st.docS} numberOfLines={1}>
                  {m.label}{d.doc_date ? ` · ${fmtDay(d.doc_date)}` : ""} · {d.uploader_role === "staff" ? (d.uploader_name || "الكادر الطبي") : viewer === "patient" ? "رفعته أنت" : "رفعه المريض"}
                </Text>
              </View>
              {viewer === "patient" && !d.shared ? <View style={st.privatePill}><Ionicons name="eye-off" size={11} color="#7A5900" /><Text style={st.privateT}>خاص</Text></View> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
              {d.images.map((u, i) => (
                <Pressable key={i} onPress={() => setZoom({ uri: u, title: d.title })} accessibilityLabel={`عرض صورة ${i + 1} من ${d.title}`}>
                  <Image source={{ uri: u }} style={st.thumb} />
                </Pressable>
              ))}
            </ScrollView>
            {d.note ? <Text style={st.note}>{d.note}</Text> : null}
            {(onToggleShare && viewer === "patient") || (onDelete && canDelete?.(d)) ? (
              <View style={st.actions}>
                {onToggleShare && viewer === "patient" ? (
                  <Pressable onPress={() => onToggleShare(d)} style={st.act}>
                    <Ionicons name={d.shared ? "eye-off-outline" : "people-outline"} size={14} color={DEEP} />
                    <Text style={st.actT}>{d.shared ? "إخفاء عن فريق الرعاية" : "مشاركة مع فريق الرعاية"}</Text>
                  </Pressable>
                ) : null}
                {onDelete && canDelete?.(d) ? (
                  <Pressable onPress={() => onDelete(d)} style={st.act}>
                    <Ionicons name="trash-outline" size={14} color="#C62828" /><Text style={[st.actT, { color: "#C62828" }]}>حذف</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
      <ImageLightbox uri={zoom?.uri ?? null} title={zoom?.title} onClose={() => setZoom(null)} />
    </View>
  );
}

/** نافذة رفع مستند: صور متعددة + نوع + عنوان + تاريخ + ملاحظة (+ المشاركة للمريض) */
export function UploadDocSheet({ visible, onClose, onSubmit, uploaderId, forStaff, patientName }: {
  visible: boolean; onClose: () => void; onSubmit: (d: NewDoc) => Promise<void>; uploaderId: number | string; forStaff?: boolean; patientName?: string;
}) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<DocKind>(forStaff ? "report" : "lab");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [shared, setShared] = useState(true);
  const [uris, setUris] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const reset = () => { setTitle(""); setNote(""); setDate(""); setShared(true); setUris([]); setErr(""); setBusy(null); };
  const add = async (from: "library" | "camera") => {
    setErr("");
    try { const u = await pickImages(from); if (u.length) setUris((p) => [...p, ...u].slice(0, 10)); }
    catch (e: any) { setErr(e?.message || "تعذّر اختيار الصور"); }
  };
  const submit = async () => {
    setErr("");
    if (!uris.length) return setErr("أضف صورة واحدة على الأقل");
    try {
      setBusy(`جارٍ رفع الصور 0/${uris.length}`);
      const images = await uploadMedicalImages(uploaderId, uris, (d, t) => setBusy(`جارٍ رفع الصور ${d}/${t}`));
      setBusy("جارٍ الحفظ…");
      await onSubmit({ kind, title: title.trim() || DOC_KIND_META[kind].label, note: note.trim() || undefined, doc_date: date || undefined, images, shared });
      reset(); onClose();
    } catch (e: any) { setErr(e?.message || "تعذّر رفع المستند"); setBusy(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.handle} />
          <Text style={st.sheetT}>{forStaff ? `إضافة مستند لملف ${patientName || "المريض"}` : "إضافة مستند لملفك الطبي"}</Text>
          <Text style={st.sheetS}>{forStaff ? "يصل المريضَ إشعار، ويظهر المستند في ملفه وخطه الزمني." : "فحوصات قديمة، روشتات، أشعة، تقارير — كل ما يساعد طبيبك."}</Text>
          <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
            <View style={st.kinds}>
              {DOC_KINDS.map((k) => {
                const m = DOC_KIND_META[k]; const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => setKind(k)} style={[st.kind, on && { backgroundColor: m.color, borderColor: m.color }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Ionicons name={m.icon as any} size={16} color={on ? "#fff" : m.color} />
                    <Text style={[st.kindT, on && { color: "#fff" }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={st.picks}>
              <Pressable onPress={() => add("camera")} style={st.pick}><Ionicons name="camera" size={22} color={DEEP} /><Text style={st.pickT}>تصوير</Text></Pressable>
              <Pressable onPress={() => add("library")} style={st.pick}><Ionicons name="images" size={22} color={DEEP} /><Text style={st.pickT}>من المعرض</Text></Pressable>
            </View>
            {uris.length ? (
              <ScrollView horizontal contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
                {uris.map((u, i) => (
                  <View key={i}>
                    <Image source={{ uri: u }} style={st.thumb} />
                    <Pressable onPress={() => setUris((p) => p.filter((_, j) => j !== i))} style={st.rm} accessibilityLabel="إزالة الصورة"><Ionicons name="close" size={14} color="#fff" /></Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <TextInput value={title} onChangeText={setTitle} placeholder={`العنوان (مثال: ${kind === "lab" ? "تحليل سكر تراكمي" : kind === "xray" ? "أشعة صدر" : kind === "prescription" ? "روشتة د. فلان" : "تقرير طبي"})`}
              placeholderTextColor={Colors.textMuted} style={st.input} maxLength={200} />
            <DateInput label="تاريخ الفحص/المستند (اختياري)" value={date} onChange={setDate} maxDate={new Date()} />
            <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة (اختياري)" placeholderTextColor={Colors.textMuted} style={[st.input, { minHeight: 70, textAlignVertical: "top" }]} multiline maxLength={1000} />
            {!forStaff ? (
              <View style={st.shareRow}>
                <Switch value={shared} onValueChange={setShared} trackColor={{ true: GREEN + "80", false: Colors.divider }} thumbColor={shared ? GREEN : "#ccc"} />
                <View style={{ flex: 1 }}>
                  <Text style={st.shareT}>مشاركة مع فريق الرعاية</Text>
                  <Text style={st.shareS}>{shared ? "يراه الأطباء المرتبطون بك" : "يبقى خاصاً بك وحدك"}</Text>
                </View>
              </View>
            ) : null}
            {err ? <Text style={st.err}>{err}</Text> : null}
            <Pressable onPress={submit} disabled={!!busy} style={[st.submit, !!busy && { opacity: 0.7 }]}>
              {busy ? <><ActivityIndicator color="#fff" /><Text style={st.submitT}>{busy}</Text></> : <><Ionicons name="cloud-upload" size={19} color="#fff" /><Text style={st.submitT}>رفع المستند</Text></>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  empty: { alignItems: "center", gap: 6, padding: 22, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: GREEN + "14", alignItems: "center", justifyContent: "center" },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  emptyS: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "center", lineHeight: 20 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  chipT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  doc: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  docHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  docIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  docT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  docS: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  privatePill: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: GOLD + "26" },
  privateT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#7A5900" },
  thumb: { width: 92, height: 92, borderRadius: 14, backgroundColor: Colors.bg },
  note: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  actions: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.bg },
  actT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: DEEP },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "92%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 10 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  sheetS: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  kinds: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  kind: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  kindT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary },
  picks: { flexDirection: "row-reverse", gap: 10 },
  pick: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: GREEN + "60", backgroundColor: GREEN + "0A" },
  pickT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: DEEP },
  rm: { position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 11 },
  shareRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  shareT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  shareS: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
  submit: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 18, backgroundColor: DEEP, marginBottom: 6 },
  submitT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
