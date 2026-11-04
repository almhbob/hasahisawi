// ⚖️ إدارة الاستمارات القانونية الجاهزة — للمدير فقط: إضافة وتعديل وحذف ونشر،
// مع نص قالب فيه خانات تعبئة {{الحقل}} ومعاينة فورية، وملف مرفق اختياري (https).
import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { uploadFile } from "@/lib/firebase/storage";
import { confirmAction, notify, openExternal } from "@/lib/xplatform";
import { paperDocument, printPaper, esc } from "@/lib/paper";

type Form = {
  id: number; title: string; category: string; description: string; body_text: string; file_url: string | null;
  is_official: boolean; is_published: boolean; sort_order: number; legacy_html?: boolean; content_html?: string;
};
type Draft = { id: number | null; title: string; category: string; description: string; body: string; file_url: string; is_official: boolean; is_published: boolean; sort_order: string };

const ACCENT = "#7C2D12";
const EMPTY: Draft = { id: null, title: "", category: "", description: "", body: "", file_url: "", is_official: false, is_published: true, sort_order: "99" };
const DEFAULT_CATS = ["عقود", "توكيلات", "إقرارات", "أحوال شخصية", "عمل", "عام"];
const SAMPLE = "# إقرار سكن\n\nأقر أنا {{الاسم الرباعي}} حامل الرقم الوطني {{الرقم الوطني}} بأنني أسكن في حي {{اسم الحي}} منذ {{تاريخ السكن}}.\n\nوهذا إقرار مني بذلك، والله على ما أقول شهيد.";

/** يطابق legalBodyToHtml في الخادم (admin-ops.ts) لمعاينة الطباعة قبل الحفظ. */
function bodyToHtml(body: string): string {
  return body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((block) => {
    const fill = (t: string) => esc(t).replace(/\{\{\s*([^{}]{1,60}?)\s*\}\}/g, (_m, l) => `<span style="white-space:nowrap"><b>${l}:</b> ____________________</span>`);
    const h = /^#{1,2}\s+(.+)$/.exec(block);
    if (h && !block.includes("\n")) return `<h2>${fill(h[1])}</h2>`;
    return `<p>${block.split("\n").map(fill).join("<br/>")}</p>`;
  }).join("\n");
}
/** استمارات قديمة محفوظة HTML فقط: نحوّلها لنص قالب قابل للتعديل. */
function htmlToBody(html: string): string {
  return html
    .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, "\n\n# $1\n\n")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr)>/gi, "\n\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const fieldsOf = (body: string) => Array.from(new Set(Array.from(body.matchAll(/\{\{\s*([^{}]{1,60}?)\s*\}\}/g)).map((m) => m[1])));

/** معاينة النص داخل التطبيق: العناوين، الفقرات، وخانات التعبئة. */
function Preview({ draft }: { draft: Draft }) {
  const blocks = draft.body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const renderLine = (line: string, k: number) => {
    const parts = line.split(/(\{\{\s*[^{}]{1,60}?\s*\}\})/g);
    return (
      <Text key={k} style={st.pvText}>
        {parts.map((p, i) => {
          const m = /^\{\{\s*([^{}]{1,60}?)\s*\}\}$/.exec(p);
          return m ? <Text key={i} style={st.pvField}>{` ${m[1]}: ________ `}</Text> : <Text key={i}>{p}</Text>;
        })}
      </Text>
    );
  };
  return (
    <View style={st.paper} accessibilityLabel="معاينة الاستمارة">
      <Text style={st.pvTitle}>{draft.title || "عنوان الاستمارة"}</Text>
      <Text style={st.pvSub}>{draft.category || "عام"}{draft.is_official ? " · نموذج معتمد" : ""}</Text>
      {draft.description ? <Text style={[st.pvText, { color: "#6b6253" }]}>{draft.description}</Text> : null}
      <View style={st.pvRule} />
      {blocks.length === 0 ? <Text style={[st.pvText, { color: "#8a8170" }]}>{draft.file_url ? "هذه الاستمارة ملف مرفق فقط — يفتحه المستخدم مباشرة." : "اكتب نص الاستمارة لتظهر المعاينة هنا."}</Text> : null}
      {blocks.map((b, i) => {
        const h = /^#{1,2}\s+(.+)$/.exec(b);
        if (h && !b.includes("\n")) return <Text key={i} style={st.pvH}>{h[1]}</Text>;
        return <View key={i} style={{ gap: 2 }}>{b.split("\n").map(renderLine)}</View>;
      })}
      {draft.file_url ? (
        <View style={st.pvFile}><Ionicons name="attach" size={14} color="#14213D" /><Text style={st.pvFileTxt} numberOfLines={1}>ملف مرفق</Text></View>
      ) : null}
    </View>
  );
}

export default function LegalFormsAdmin() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const base = getApiUrl().replace(/\/$/, "");
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bodyDirty, setBodyDirty] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [q, setQ] = useState("");

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(`${base}/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `خطأ (${r.status})`);
    return d;
  }, [base, token]);

  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return; }
    setError("");
    try { const d = await api("/admin/legal-forms"); setForms(d.forms || []); }
    catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [api, token, isAdmin]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cats = useMemo(() => Array.from(new Set([...forms.map((f) => f.category).filter(Boolean), ...DEFAULT_CATS])), [forms]);
  const shown = q.trim() ? forms.filter((f) => `${f.title} ${f.category} ${f.description}`.includes(q.trim())) : forms;
  const published = forms.filter((f) => f.is_published).length;

  async function openEditor(f?: Form) {
    setBodyDirty(false); setLegacy(false); setShowPreview(true);
    if (!f) { setDraft({ ...EMPTY }); return; }
    let body = f.body_text || "";
    if (!body && f.legacy_html) {
      try { const d = await api(`/admin/legal-forms/${f.id}`); body = htmlToBody(d.form?.content_html || ""); setLegacy(true); } catch {}
    }
    setDraft({ id: f.id, title: f.title, category: f.category, description: f.description, body, file_url: f.file_url || "",
      is_official: f.is_official, is_published: f.is_published, sort_order: String(f.sort_order ?? 99) });
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft) return;
    if (draft.title.trim().length < 3) { notify("بيانات ناقصة", "اكتب عنوان الاستمارة (3 أحرف على الأقل)"); return; }
    if (!draft.body.trim() && !draft.file_url.trim()) { notify("بيانات ناقصة", "اكتب نص الاستمارة أو أضف ملفها"); return; }
    if (draft.file_url.trim() && !/^https:\/\/\S+$/i.test(draft.file_url.trim())) { notify("رابط غير صالح", "رابط الملف يجب أن يبدأ بـ https://"); return; }
    const sort = Number(draft.sort_order.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))) || 99);
    const payload: Record<string, unknown> = {
      title: draft.title, category: draft.category, description: draft.description, file_url: draft.file_url.trim(),
      is_official: draft.is_official, is_published: draft.is_published, sort_order: Number.isFinite(sort) ? Math.round(sort) : 99,
    };
    // الاستمارة القديمة (HTML) لا يُعاد توليدها إلا إن عدّل المدير نصّها
    if (draft.id == null || bodyDirty) payload.body = draft.body;
    setSaving(true);
    try {
      await api(draft.id == null ? "/admin/legal-forms" : `/admin/legal-forms/${draft.id}`, { method: draft.id == null ? "POST" : "PUT", body: JSON.stringify(payload) });
      notify("تم الحفظ", draft.is_published ? "الاستمارة منشورة وتظهر في قسم المحامين." : "حُفظت كمسودة غير منشورة.");
      setDraft(null); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message || ""); }
    finally { setSaving(false); }
  }

  async function togglePublish(f: Form, v: boolean) {
    setBusy(f.id);
    setForms((all) => all.map((x) => (x.id === f.id ? { ...x, is_published: v } : x)));
    try { const d = await api(`/admin/legal-forms/${f.id}`, { method: "PUT", body: JSON.stringify({ is_published: v }) }); setForms((all) => all.map((x) => (x.id === f.id ? { ...x, ...d.form } : x))); }
    catch (e: any) { setForms((all) => all.map((x) => (x.id === f.id ? { ...x, is_published: !v } : x))); notify("تعذّر التحديث", e?.message || ""); }
    finally { setBusy(null); }
  }

  async function remove(f: Form) {
    const ok = await confirmAction("حذف الاستمارة", `حذف «${f.title}» نهائياً؟ لن تظهر للمستخدمين ولا يمكن التراجع.`, "حذف", true);
    if (!ok) return;
    setBusy(f.id);
    try { await api(`/admin/legal-forms/${f.id}`, { method: "DELETE" }); setForms((all) => all.filter((x) => x.id !== f.id)); }
    catch (e: any) { notify("تعذّر الحذف", e?.message || ""); }
    finally { setBusy(null); }
  }

  async function pickFile() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"], multiple: false, copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const name = (a.name || `form_${Date.now()}.pdf`).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
      setUploading(true);
      const url = await uploadFile(`legal-forms/${Date.now()}_${name}`, a.uri, { fileName: name, mimeType: a.mimeType || null });
      if (!/^https:\/\//i.test(url)) { notify("تعذّر استخدام الملف", "الخادم أعاد رابطاً غير آمن (ليس https). الصق رابط https يدوياً."); return; }
      set("file_url", url);
    } catch (e: any) { notify("تعذّر رفع الملف", e?.message || "حاول مرة أخرى"); }
    finally { setUploading(false); }
  }

  async function printPreview() {
    if (!draft) return;
    const html = paperDocument({
      theme: "legal", title: draft.title || "استمارة", subtitle: `${draft.category || "عام"}${draft.is_official ? " · نموذج معتمد" : ""}`,
      bodyHtml: `${draft.description ? `<p style="color:#6b6253">${esc(draft.description)}</p>` : ""}${bodyToHtml(draft.body)}`,
      signatures: ["توقيع مقدّم الطلب", "توقيع المحامي / الشاهد", "الختم"],
      note: "معاينة الإدارة — هكذا تُطبع الاستمارة للمستخدم.",
    });
    try { await printPaper(html, draft.title || "معاينة"); } catch (e: any) { notify("تعذّرت المعاينة", e?.message || ""); }
  }

  if (!isAdmin) {
    return (
      <View style={[st.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <Ionicons name="lock-closed" size={36} color={Colors.textMuted} />
        <Text style={[st.cardTitle, { textAlign: "center", marginTop: 10, flex: 0 }]}>هذه الصفحة لمدير التطبيق فقط</Text>
        <TouchableOpacity onPress={() => router.back()} style={[st.primaryBtn, { marginTop: 16, paddingHorizontal: 22 }]} accessibilityRole="button"><Text style={st.primaryTxt}>رجوع</Text></TouchableOpacity>
      </View>
    );
  }

  const header = (
    <View style={st.header}>
      <TouchableOpacity onPress={() => (draft ? setDraft(null) : router.back())} style={st.back} hitSlop={10} accessibilityRole="button" accessibilityLabel={draft ? "إغلاق المحرر" : "رجوع"}>
        <Ionicons name={draft ? "close" : "chevron-forward"} size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={st.hTitle}>{draft ? (draft.id == null ? "استمارة جديدة" : "تعديل الاستمارة") : "الاستمارات القانونية"}</Text>
        <Text style={st.hSub}>{draft ? "النص، الخانات، الملف المرفق، والنشر" : "النماذج الجاهزة التي تظهر في قسم المحامين ← الاستمارات"}</Text>
      </View>
    </View>
  );

  // ─── المحرر ───
  if (draft) {
    const fields = fieldsOf(draft.body);
    return (
      <View style={[st.root, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={st.card}>
            <Text style={st.lbl}>العنوان *</Text>
            <TextInput value={draft.title} onChangeText={(v) => set("title", v)} placeholder="مثال: عقد إيجار سكني" placeholderTextColor={Colors.textMuted} style={st.input} maxLength={200} accessibilityLabel="عنوان الاستمارة" />
            <Text style={st.lbl}>التصنيف</Text>
            <View style={st.chips}>
              {cats.map((c) => (
                <TouchableOpacity key={c} onPress={() => set("category", c)} style={[st.chip, draft.category === c && st.chipOn]} accessibilityRole="button" accessibilityState={{ selected: draft.category === c }}>
                  <Text style={[st.chipTxt, draft.category === c && { color: Colors.onColor }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={draft.category} onChangeText={(v) => set("category", v)} placeholder="أو اكتب تصنيفاً جديداً" placeholderTextColor={Colors.textMuted} style={st.input} maxLength={80} accessibilityLabel="التصنيف" />
            <Text style={st.lbl}>وصف مختصر</Text>
            <TextInput value={draft.description} onChangeText={(v) => set("description", v)} placeholder="متى تُستخدم هذه الاستمارة؟" placeholderTextColor={Colors.textMuted} style={[st.input, { minHeight: 64 }]} multiline maxLength={1000} accessibilityLabel="وصف الاستمارة" />
          </View>

          <View style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.cardTitle}>نص الاستمارة</Text>
              {!draft.body ? (
                <TouchableOpacity onPress={() => { set("body", SAMPLE); setBodyDirty(true); }} style={st.ghostBtn} accessibilityRole="button"><Text style={st.ghostTxt}>إدراج مثال</Text></TouchableOpacity>
              ) : null}
            </View>
            <Text style={st.help}>اكتب {"{{اسم الخانة}}"} لإضافة خانة تعبئة، و«# » في بداية السطر لعنوان فرعي، واترك سطراً فارغاً بين الفقرات.</Text>
            {legacy ? <Text style={[st.help, { color: Colors.accentDeep }]}>هذه استمارة قديمة محفوظة بتنسيق HTML. يبقى تنسيقها الأصلي كما هو ما لم تعدّل النص هنا.</Text> : null}
            <TextInput value={draft.body} onChangeText={(v) => { set("body", v); setBodyDirty(true); }} placeholder={"# عنوان الاستمارة\n\nأقر أنا {{الاسم}} …"} placeholderTextColor={Colors.textMuted}
              style={[st.input, st.bodyInput]} multiline textAlignVertical="top" maxLength={20000} accessibilityLabel="نص الاستمارة" />
            {fields.length ? (
              <View style={{ gap: 6 }}>
                <Text style={st.small}>خانات التعبئة ({fields.length})</Text>
                <View style={st.chips}>{fields.map((f) => <View key={f} style={st.fieldPill}><Text style={st.fieldPillTxt}>{f}</Text></View>)}</View>
              </View>
            ) : null}
          </View>

          <View style={st.card}>
            <Text style={st.cardTitle}>ملف مرفق (اختياري)</Text>
            <Text style={st.help}>نسخة PDF أو Word جاهزة. الروابط الآمنة فقط (https://).</Text>
            <View style={st.rowGap}>
              <TextInput value={draft.file_url} onChangeText={(v) => set("file_url", v)} placeholder="https://…" placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="url"
                style={[st.input, { flex: 1, textAlign: "left" }]} accessibilityLabel="رابط الملف" />
              <TouchableOpacity onPress={pickFile} disabled={uploading} style={st.iconSq} accessibilityRole="button" accessibilityLabel="رفع ملف">
                {uploading ? <ActivityIndicator size="small" color={ACCENT} /> : <Ionicons name="cloud-upload-outline" size={20} color={ACCENT} />}
              </TouchableOpacity>
            </View>
            {draft.file_url ? (
              <View style={st.rowGap}>
                <TouchableOpacity onPress={() => /^https:\/\//i.test(draft.file_url) && openExternal(draft.file_url)} style={st.ghostBtn} accessibilityRole="link"><Text style={st.ghostTxt}>فتح الملف</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => set("file_url", "")} style={st.ghostBtn} accessibilityRole="button"><Text style={[st.ghostTxt, { color: Colors.danger }]}>إزالة</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={st.card}>
            <View style={st.rowBetween}>
              <Text style={st.lbl}>منشورة للمستخدمين</Text>
              <Switch value={draft.is_published} onValueChange={(v) => set("is_published", v)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="نشر الاستمارة" />
            </View>
            <View style={st.rowBetween}>
              <Text style={st.lbl}>نموذج معتمد (شارة «معتمدة»)</Text>
              <Switch value={draft.is_official} onValueChange={(v) => set("is_official", v)} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="نموذج معتمد" />
            </View>
            <View style={st.rowBetween}>
              <Text style={st.lbl}>الترتيب (الأصغر أولاً)</Text>
              <TextInput value={draft.sort_order} onChangeText={(v) => set("sort_order", v)} keyboardType="number-pad" style={[st.input, { width: 90, textAlign: "center" }]} accessibilityLabel="ترتيب الاستمارة" />
            </View>
          </View>

          <View style={st.rowBetween}>
            <Text style={st.cardTitle}>المعاينة</Text>
            <View style={st.rowGap}>
              {draft.body.trim() ? (
                <TouchableOpacity onPress={printPreview} style={st.ghostBtn} accessibilityRole="button" accessibilityLabel="معاينة الطباعة">
                  <Ionicons name="print-outline" size={15} color={Colors.textPrimary} /><Text style={st.ghostTxt}>معاينة الطباعة</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setShowPreview((v) => !v)} style={st.ghostBtn} accessibilityRole="button" accessibilityState={{ expanded: showPreview }}>
                <Text style={st.ghostTxt}>{showPreview ? "إخفاء" : "إظهار"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {showPreview ? <Preview draft={draft} /> : null}
        </ScrollView>
        <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity onPress={() => setDraft(null)} style={[st.ghostBtn, { minHeight: 48, paddingHorizontal: 18 }]} accessibilityRole="button"><Text style={st.ghostTxt}>إلغاء</Text></TouchableOpacity>
          <TouchableOpacity onPress={save} disabled={saving} style={[st.primaryBtn, { flex: 1 }]} accessibilityRole="button">
            {saving ? <ActivityIndicator color={Colors.onColor} /> : <><Ionicons name="checkmark" size={18} color={Colors.onColor} /><Text style={st.primaryTxt}>{draft.is_published ? "حفظ ونشر" : "حفظ كمسودة"}</Text></>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── القائمة ───
  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 12 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <View style={st.tiles}>
          <View style={st.tile}><Text style={st.tileNum}>{forms.length}</Text><Text style={st.tileLbl}>كل الاستمارات</Text></View>
          <View style={st.tile}><Text style={st.tileNum}>{published}</Text><Text style={st.tileLbl}>منشورة</Text></View>
          <View style={st.tile}><Text style={st.tileNum}>{forms.length - published}</Text><Text style={st.tileLbl}>مسودات</Text></View>
        </View>
        <TouchableOpacity onPress={() => openEditor()} style={st.primaryBtn} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={Colors.onColor} /><Text style={st.primaryTxt}>إضافة استمارة</Text>
        </TouchableOpacity>
        {forms.length > 4 ? (
          <View style={st.searchBox}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث في الاستمارات" placeholderTextColor={Colors.textMuted} style={[st.input, { flex: 1, borderWidth: 0, backgroundColor: "transparent" }]} accessibilityLabel="بحث في الاستمارات" />
          </View>
        ) : null}
        {error ? (
          <View style={st.card}><Text style={[st.help, { color: Colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={[st.ghostBtn, { alignSelf: "flex-end" }]}><Text style={st.ghostTxt}>إعادة المحاولة</Text></TouchableOpacity></View>
        ) : null}
        {loading ? <ActivityIndicator style={{ marginTop: 30 }} color={Colors.primary} /> : null}
        {!loading && !error && forms.length === 0 ? (
          <View style={[st.card, { alignItems: "center", paddingVertical: 28 }]}>
            <Ionicons name="documents-outline" size={34} color={Colors.textMuted} />
            <Text style={[st.cardTitle, { textAlign: "center", flex: 0 }]}>لا توجد استمارات بعد</Text>
            <Text style={[st.help, { textAlign: "center" }]}>أضف أول نموذج جاهز ليظهر للمستخدمين في قسم المحامين.</Text>
          </View>
        ) : null}
        {shown.map((f) => (
          <View key={f.id} style={[st.card, !f.is_published && { borderStyle: "dashed" }]}>
            <View style={st.rowGap}>
              <View style={st.formIcon}><Ionicons name={f.file_url && !f.body_text && !f.legacy_html ? "attach" : "document-text-outline"} size={20} color={ACCENT} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.tName} numberOfLines={2}>{f.title}</Text>
                <View style={st.rowGap}>
                  <Text style={st.small}>{f.category}</Text>
                  <View style={[st.badge, { backgroundColor: f.is_published ? Colors.successSoft : Colors.warningSoft }]}>
                    <Text style={[st.badgeTxt, { color: f.is_published ? Colors.primaryDeep : Colors.accentDeep }]}>{f.is_published ? "منشورة" : "مسودة"}</Text>
                  </View>
                  {f.is_official ? <Text style={st.small}>· معتمدة</Text> : null}
                  {f.file_url ? <Ionicons name="attach" size={14} color={Colors.textMuted} accessibilityLabel="لها ملف مرفق" /> : null}
                </View>
                {f.description ? <Text style={st.help} numberOfLines={2}>{f.description}</Text> : null}
              </View>
              {busy === f.id ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
            </View>
            <View style={st.actions}>
              <View style={[st.rowGap, { flex: 1 }]}>
                <Switch value={f.is_published} onValueChange={(v) => togglePublish(f, v)} disabled={busy === f.id} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel={`نشر ${f.title}`} />
                <Text style={st.small}>{f.is_published ? "ظاهرة" : "مخفية"}</Text>
              </View>
              <TouchableOpacity onPress={() => openEditor(f)} style={st.ghostBtn} accessibilityRole="button" accessibilityLabel={`تعديل ${f.title}`}>
                <Ionicons name="create-outline" size={16} color={Colors.textPrimary} /><Text style={st.ghostTxt}>تعديل</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(f)} style={st.iconSq} hitSlop={6} accessibilityRole="button" accessibilityLabel={`حذف ${f.title}`}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  hTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  hSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  card: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.cardBg },
  cardTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  small: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  help: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: Colors.textMuted, textAlign: "right" },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14, paddingHorizontal: 12, paddingVertical: 8, textAlign: "right" },
  bodyInput: { minHeight: 200, lineHeight: 24, ...(Platform.OS === "web" ? ({ direction: "rtl" } as any) : null) },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  fieldPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.accentSoft },
  fieldPillTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.accentDeep },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44 },
  rowGap: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  actions: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  primaryBtn: { minHeight: 48, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, backgroundColor: ACCENT },
  primaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.onColor },
  ghostBtn: { minHeight: 40, flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, justifyContent: "center" },
  ghostTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  iconSq: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  formIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: ACCENT + "14" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTxt: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  tiles: { flexDirection: "row-reverse", gap: 8 },
  tile: { flex: 1, alignItems: "center", padding: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border },
  tileNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  tileLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  footer: { flexDirection: "row-reverse", gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bg },
  // الورق: ألوان ثابتة كالورقة المطبوعة (فاتحة في الوضعين)
  paper: { gap: 8, padding: 18, borderRadius: 14, backgroundColor: "#FFFDF7", borderWidth: 1, borderColor: "#E7DFCB" },
  pvTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#14213D", textAlign: "center" },
  pvSub: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#8B6D2C", textAlign: "center" },
  pvRule: { height: 1, backgroundColor: "#E7DFCB", marginVertical: 4 },
  pvH: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#14213D", textAlign: "right", marginTop: 4 },
  pvText: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 26, color: "#2B2A27", textAlign: "right" },
  pvField: { fontFamily: "Cairo_700Bold", color: "#14213D", textDecorationLine: "underline" },
  pvFile: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 6 },
  pvFileTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#14213D" },
});
