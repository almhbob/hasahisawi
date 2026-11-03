// «إثراء» — رفع كتاب أو كتابة مقال (وتعديل مساهمة قائمة). يُرسل للمراجعة ما لم يكن الرافع مشرفاً على الرف.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import {
  ithraaApi, uploadLibraryFile, fmtSize, ITHRAA, ITHRAA_GOLD, RIGHTS_OPTIONS, LANG_LABEL,
  type IthraaKind, type IthraaMeta, type IthraaSubmission,
} from "@/lib/ithraa";
import { Pill, ithraaStyles as u } from "@/components/ithraa/ui";

const BOOK_TYPES = [
  "application/pdf", "application/epub+zip", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "audio/*",
];

export default function IthraaSubmit() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ kind?: string; edit?: string }>();
  const editId = params.edit ? Number(params.edit) : null;
  const [meta, setMeta] = useState<IthraaMeta | null>(null);
  const [kind, setKind] = useState<IthraaKind>(params.kind === "article" ? "article" : "book");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState("ar");
  const [pages, setPages] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [rights, setRights] = useState("");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [existingFile, setExistingFile] = useState<{ url: string; size: number | null; format: string | null } | null>(null);
  const [cover, setCover] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; pct: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const m = await ithraaApi.meta(token);
        setMeta(m);
        if (editId) {
          const { item } = await ithraaApi.item(editId, token);
          setKind(item.kind); setCategory(item.category); setTitle(item.title); setAuthor(item.author_name || "");
          setDescription(item.description || ""); setBody(item.body || ""); setLanguage(item.language || "ar");
          setPages(item.pages ? String(item.pages) : ""); setYear(item.publish_year ? String(item.publish_year) : "");
          setTags(item.tags.join("، ")); setRights(item.rights); setCoverUrl(item.cover_url);
          if (item.file_url) {
            if (item.source === "link") { setMode("link"); setLink(item.file_url); }
            else setExistingFile({ url: item.file_url, size: item.file_size, format: item.file_format });
          }
        }
      } catch (e: any) { notify("تعذّر التحميل", e?.message); }
      finally { setLoading(false); }
    })();
  }, [editId, token]);

  const shelf = meta?.shelves.find((s) => s.key === category);
  const reviewer = !!meta?.me?.can_review && (meta.me.review_all || (meta.me.review_shelves ?? []).includes(category));
  const minBody = meta?.article_min ?? 300;
  const words = useMemo(() => body.trim().split(/\s+/).filter(Boolean).length, [body]);

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: BOOK_TYPES, copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const max = meta?.max_file_mb ?? 10;
    if (a.size && a.size > max * 1024 * 1024) return notify("الملف كبير جداً", `الحد الأقصى ${max} م.ب. يمكنك إضافته كرابط (Google Drive مثلاً).`);
    setFile(a); setExistingFile(null);
    if (!title.trim()) setTitle(a.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 200));
  };
  const pickCover = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) return notify("الصورة كبيرة", "اختر صورة غلاف أقل من 5 م.ب.");
    setCover(a);
  };

  const submit = async () => {
    if (!token || isGuest) return notify("سجّل الدخول", "سجّل الدخول للمساهمة.");
    if (!category) return notify("اختر الرف", "اختر التصنيف المناسب ليصل للمشرف المختص.");
    if (title.trim().length < 3) return notify("العنوان مطلوب", "اكتب عنواناً واضحاً.");
    if (kind === "book") {
      if (mode === "file" && !file && !existingFile) return notify("ملف الكتاب", "اختر ملف الكتاب من جهازك أو أضفه كرابط.");
      if (mode === "link" && !/^https:\/\/\S+$/i.test(link.trim())) return notify("رابط غير صالح", "الرابط يجب أن يبدأ بـ https://");
    } else if (body.trim().length < minBody) {
      return notify("المقال قصير", `اكتب ${minBody} حرفاً على الأقل (الآن ${body.trim().length}).`);
    }
    if (!rights) return notify("حقوق النشر", "حدّد صفتك في نشر هذا المحتوى.");
    setSaving(true);
    try {
      let fileUrl: string | null = null, size: number | null = null, format: string | null = null;
      if (kind === "book") {
        if (mode === "link") {
          fileUrl = link.trim();
          format = (fileUrl.match(/\.(pdf|epub|docx?)(\?|$)/i)?.[1] || "").toLowerCase() || null;
        } else if (file) {
          setProgress({ label: "رفع ملف الكتاب", pct: 0 });
          fileUrl = await uploadLibraryFile(token, file, (pct) => setProgress({ label: "رفع ملف الكتاب", pct }));
          size = file.size ?? null; format = (file.name.split(".").pop() || "").toLowerCase() || null;
        } else if (existingFile) {
          fileUrl = existingFile.url; size = existingFile.size; format = existingFile.format;
        }
      }
      let finalCover = coverUrl;
      if (cover) {
        setProgress({ label: "رفع صورة الغلاف", pct: 0 });
        finalCover = await uploadLibraryFile(token, cover, (pct) => setProgress({ label: "رفع صورة الغلاف", pct }));
      }
      setProgress({ label: "حفظ المساهمة", pct: null });
      const payload: IthraaSubmission = {
        kind, category, title: title.trim(), author_name: author.trim(), description: description.trim(),
        body: kind === "article" ? body.trim() : undefined, cover_url: finalCover,
        file_url: fileUrl, file_size: size, file_format: format, language,
        pages: pages ? Number(pages) : null, publish_year: year ? Number(year) : null, rights,
        tags: tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean),
      };
      const r = editId ? await ithraaApi.edit(token, editId, payload) : await ithraaApi.submit(token, payload);
      notify(editId ? "تم الحفظ" : "شكراً لمساهمتك", r.message);
      router.replace({ pathname: "/ithraa-item", params: { id: String(r.item.id) } } as any);
    } catch (e: any) {
      notify("تعذّر الإرسال", e?.message || "حاول مرة أخرى");
    } finally { setSaving(false); setProgress(null); }
  };

  if (loading) return <View style={st.center}><ActivityIndicator color={ITHRAA} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/ithraa" as any))} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={st.barTitle}>{editId ? "تعديل المساهمة" : "مساهمة في «إثراء»"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {!editId && (
          <View style={st.kindRow}>
            <KindCard on={kind === "book"} icon="book" title="رفع كتاب" sub="PDF · EPUB · Word · رابط" onPress={() => setKind("book")} />
            <KindCard on={kind === "article"} icon="create" title="كتابة مقال" sub="يُكتب ويُقرأ داخل التطبيق" onPress={() => setKind("article")} color={ITHRAA_GOLD} />
          </View>
        )}

        <View style={[st.notice, { backgroundColor: reviewer ? "#0E8A5F12" : ITHRAA + "10" }]}>
          <Ionicons name={reviewer ? "flash" : "shield-checkmark-outline"} size={16} color={reviewer ? "#0E8A5F" : ITHRAA} />
          <Text style={st.noticeT}>
            {reviewer ? "أنت مشرف على هذا الرف — ستُنشر المساهمة مباشرة." : `تُرسل لمشرف الرف للمراجعة، ويصلك إشعار عند النشر${meta?.points ? ` مع ${meta.points} نقاط تطوع` : ""}.`}
          </Text>
        </View>

        <Text style={u.label}>الرف (التصنيف) *</Text>
        <View style={u.wrap}>
          {(meta?.shelves ?? []).map((sh) => <Pill key={sh.key} label={sh.label} on={category === sh.key} onPress={() => setCategory(sh.key)} color={sh.color} />)}
        </View>

        <Text style={u.label}>{kind === "book" ? "عنوان الكتاب *" : "عنوان المقال *"}</Text>
        <TextInput value={title} onChangeText={setTitle} style={u.input} maxLength={200} placeholder={kind === "book" ? "مثال: موسم الهجرة إلى الشمال" : "عنوان جذاب وواضح"} placeholderTextColor={Colors.textMuted} />

        <Text style={u.label}>{kind === "book" ? "المؤلف" : "الكاتب (إن لم تكن أنت)"}</Text>
        <TextInput value={author} onChangeText={setAuthor} style={u.input} maxLength={160} placeholder={kind === "book" ? "اسم المؤلف" : "اتركه فارغاً ليظهر اسمك"} placeholderTextColor={Colors.textMuted} />

        {kind === "book" ? (
          <>
            <Text style={u.label}>ملف الكتاب *</Text>
            <View style={[u.rowR, { gap: 8 }]}>
              <Pill label="من جهازي" icon="phone-portrait-outline" on={mode === "file"} onPress={() => setMode("file")} />
              <Pill label="رابط خارجي" icon="link-outline" on={mode === "link"} onPress={() => setMode("link")} />
            </View>
            {mode === "file" ? (
              <Pressable onPress={pickFile} style={st.drop} accessibilityRole="button">
                <Ionicons name={file || existingFile ? "document-attach" : "cloud-upload-outline"} size={30} color={ITHRAA} />
                <Text style={st.dropT} numberOfLines={2}>{file ? file.name : existingFile ? "الملف الحالي مرفق — اضغط للاستبدال" : "اختر ملف الكتاب"}</Text>
                <Text style={u.hint}>{file ? fmtSize(file.size) : `PDF أو EPUB أو Word · حتى ${meta?.max_file_mb ?? 10} م.ب`}</Text>
              </Pressable>
            ) : (
              <TextInput value={link} onChangeText={setLink} style={[u.input, { marginTop: 8 }]} autoCapitalize="none" keyboardType="url" placeholder="https://drive.google.com/…" placeholderTextColor={Colors.textMuted} />
            )}

            <Text style={u.label}>صورة الغلاف (اختياري)</Text>
            <Pressable onPress={pickCover} style={[u.rowR, { gap: 12 }]}>
              {cover || coverUrl
                ? <Image source={{ uri: cover?.uri || coverUrl! }} style={st.coverThumb} />
                : <View style={[st.coverThumb, st.coverEmpty]}><Ionicons name="image-outline" size={24} color={Colors.textMuted} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.dropT}>{cover || coverUrl ? "تغيير الغلاف" : "إضافة غلاف"}</Text>
                <Text style={u.hint}>إن لم تُضف غلافاً سنصمّم غلافاً أنيقاً بلون الرف.</Text>
              </View>
            </Pressable>

            <View style={[u.rowR, { gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={u.label}>عدد الصفحات</Text>
                <TextInput value={pages} onChangeText={(t) => setPages(t.replace(/\D/g, "").slice(0, 5))} style={u.input} keyboardType="number-pad" placeholder="—" placeholderTextColor={Colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={u.label}>سنة النشر</Text>
                <TextInput value={year} onChangeText={(t) => setYear(t.replace(/\D/g, "").slice(0, 4))} style={u.input} keyboardType="number-pad" placeholder="—" placeholderTextColor={Colors.textMuted} />
              </View>
            </View>

            <Text style={u.label}>نبذة عن الكتاب</Text>
            <TextInput value={description} onChangeText={setDescription} style={[u.input, { minHeight: 90, textAlignVertical: "top" }]} multiline maxLength={1500} placeholder="عمّ يتحدث الكتاب؟ ولمن تنصح به؟" placeholderTextColor={Colors.textMuted} />
          </>
        ) : (
          <>
            <Text style={u.label}>ملخّص قصير (اختياري)</Text>
            <TextInput value={description} onChangeText={setDescription} style={[u.input, { minHeight: 60, textAlignVertical: "top" }]} multiline maxLength={600} placeholder="سطران يشجعان على القراءة" placeholderTextColor={Colors.textMuted} />
            <View style={[u.rowR, { justifyContent: "space-between" }]}>
              <Text style={u.label}>نص المقال *</Text>
              <Text style={[u.hint, { color: body.trim().length >= minBody ? "#0E8A5F" : Colors.textMuted }]}>{words} كلمة · {body.trim().length}/{minBody}+ حرف</Text>
            </View>
            <TextInput value={body} onChangeText={setBody} style={[u.input, { minHeight: 260, textAlignVertical: "top", lineHeight: 26 }]} multiline maxLength={40000}
              placeholder={"اكتب مقالك هنا…\n\nافصل الفقرات بسطر فارغ.\nابدأ السطر بـ # لعنوان فرعي."} placeholderTextColor={Colors.textMuted} />
          </>
        )}

        <Text style={u.label}>اللغة</Text>
        <View style={u.wrap}>{Object.entries(LANG_LABEL).map(([k, v]) => <Pill key={k} label={v} on={language === k} onPress={() => setLanguage(k)} />)}</View>

        <Text style={u.label}>وسوم (اختياري)</Text>
        <TextInput value={tags} onChangeText={setTags} style={u.input} placeholder="مثال: رواية، الطيب صالح، أدب سوداني" placeholderTextColor={Colors.textMuted} />

        <Text style={u.label}>حقوق النشر *</Text>
        <View style={{ gap: 8 }}>
          {RIGHTS_OPTIONS.map((r) => (
            <Pressable key={r.key} onPress={() => setRights(r.key)} style={[st.right, rights === r.key && { borderColor: ITHRAA, backgroundColor: ITHRAA + "0D" }]} accessibilityRole="radio" accessibilityState={{ checked: rights === r.key }}>
              <Ionicons name={rights === r.key ? "radio-button-on" : "radio-button-off"} size={20} color={rights === r.key ? ITHRAA : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={st.rightT}>{r.label}</Text>
                <Text style={u.hint}>{r.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={[u.hint, { marginTop: 8 }]}>المحتوى المخالف لحقوق المؤلفين أو للآداب العامة يُرفض. الكتب التجارية الحديثة لا تُرفع إلا بإذن ناشرها.</Text>

        {!!progress && (
          <View style={st.progress}>
            <Text style={st.progressT}>{progress.label}{progress.pct != null ? ` ${progress.pct}%` : "…"}</Text>
            <View style={st.track}><View style={[st.fill, { width: `${progress.pct ?? 100}%` }]} /></View>
          </View>
        )}

        <Pressable onPress={submit} disabled={saving} style={[u.primaryBtn, { marginTop: 18, opacity: saving ? 0.7 : 1, backgroundColor: shelf?.color || ITHRAA }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="paper-plane" size={18} color="#fff" />}
          <Text style={u.primaryText}>{editId ? "حفظ التعديلات" : reviewer ? "نشر الآن" : "إرسال للمراجعة"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function KindCard({ on, icon, title, sub, onPress, color = ITHRAA }: { on: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[st.kind, on && { borderColor: color, backgroundColor: color + "10" }]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <View style={[st.kindIcon, { backgroundColor: color + (on ? "" : "22") }]}><Ionicons name={icon} size={22} color={on ? "#fff" : color} /></View>
      <Text style={st.kindT}>{title}</Text>
      <Text style={[u.hint, { textAlign: "center" }]}>{sub}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "center" },
  kindRow: { flexDirection: "row-reverse", gap: 10 },
  kind: { flex: 1, alignItems: "center", gap: 6, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  kindIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kindT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary },
  notice: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderRadius: 12, padding: 10, marginTop: 12 },
  noticeT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  drop: { marginTop: 10, alignItems: "center", gap: 4, paddingVertical: 20, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: ITHRAA + "66", backgroundColor: ITHRAA + "08" },
  dropT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  coverThumb: { width: 62, height: 88, borderRadius: 8 },
  coverEmpty: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  right: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  rightT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  progress: { marginTop: 16, gap: 6 },
  progressT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: ITHRAA, textAlign: "right" },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: "hidden" },
  fill: { height: 6, backgroundColor: ITHRAA },
});
