// لوحة الأمانة الإعلامية — نشر البيانات والأخبار (مع التنبيه العاجل)، إدارة المنشورات، الأرشيف الرقمي،
// اعتماد الصحفيين في الدليل، والطاقم والإعدادات (حالة الشراكة ومرحلة التنفيذ لإدارة التطبيق).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { uploadLibraryFile } from "@/lib/ithraa";
import { pressApi, PRESS_INK, PRESS_RED, PARTNER_STATUS, fmtDay, type PressOverview, type PressPost, type PressFile, type Journalist } from "@/lib/press";
import { Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "compose" | "posts" | "archive" | "accredit" | "settings";

export default function PressAdmin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [ov, setOv] = useState<PressOverview | null>(null);
  const [tab, setTab] = useState<Tab>("compose");
  const [editId, setEditId] = useState<number | null>(params.edit ? Number(params.edit) : null);
  useFocusEffect(useCallback(() => { pressApi.overview(token).then(setOv).catch(() => {}); }, [token]));

  if (!ov || !token) return <View style={st.center}><ActivityIndicator color={PRESS_RED} /></View>;
  if (!ov.me) return <View style={st.center}><Empty icon="lock-closed-outline" title="للأمانة الإعلامية فقط" sub="تمنح إدارة التطبيق صلاحيات النشر والتحكم." /></View>;
  const tabs: [Tab, string, keyof typeof Ionicons.glyphMap][] = [
    ["compose", editId ? "تعديل" : "نشر جديد", "create-outline"], ["posts", "المنشورات", "list-outline"], ["archive", "الأرشيف", "archive-outline"],
    ...(ov.me.can_publish ? [["accredit", "اعتماد الصحفيين", "shield-checkmark-outline"] as [Tab, string, keyof typeof Ionicons.glyphMap]] : []),
    ...(ov.me.can_manage ? [["settings", "الطاقم والإعدادات", "settings-outline"] as [Tab, string, keyof typeof Ionicons.glyphMap]] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/press" as any))} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.barTitle}>لوحة الأمانة الإعلامية</Text>
          <Text style={st.barSub}>{ov.me.role_label}{ov.me.can_push ? " · صلاحية التنبيه العاجل" : ""}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={st.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          {tabs.map(([k, l, i]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, { transform: [{ scaleX: -1 }] }, tab === k && { backgroundColor: PRESS_RED, borderColor: PRESS_RED }]}>
              <Ionicons name={i} size={15} color={tab === k ? "#fff" : Colors.textSecondary} /><Text style={[st.tabT, tab === k && { color: "#fff" }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {tab === "compose" && <Compose token={token} ov={ov} editId={editId} onDone={() => { setEditId(null); setTab("posts"); }} />}
      {tab === "posts" && <Posts token={token} onEdit={(id) => { setEditId(id); setTab("compose"); }} />}
      {tab === "archive" && <Archive token={token} ov={ov} />}
      {tab === "accredit" && <Accredit token={token} />}
      {tab === "settings" && <Settings token={token} ov={ov} />}
    </View>
  );
}

// ─── النشر ───────────────────────────────────────────────────
function useUploader(token: string) {
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (types: string[]): Promise<PressFile | null> => {
    const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    setBusy("0%");
    try { const url = await uploadLibraryFile(token, a, (p) => setBusy(`${p}%`)); return { name: a.name, url, type: a.mimeType || null, size: a.size || null }; }
    catch (e: any) { notify("تعذّر الرفع", e?.message); return null; } finally { setBusy(null); }
  };
  return { busy, pick };
}

function Compose({ token, ov, editId, onDone }: { token: string; ov: PressOverview; editId: number | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState("statement");
  const [title, setTitle] = useState(""); const [summary, setSummary] = useState(""); const [body, setBody] = useState("");
  const [signed, setSigned] = useState("الأمانة الإعلامية");
  const [cover, setCover] = useState<string | null>(null);
  const [files, setFiles] = useState<PressFile[]>([]);
  const [urgent, setUrgent] = useState(false); const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const up = useUploader(token);
  useEffect(() => {
    if (!editId) return;
    pressApi.post(editId, token).then(({ post: p }) => { setKind(p.kind); setTitle(p.title); setSummary(p.summary || ""); setBody(p.body || ""); setSigned(p.signed_by || ""); setCover(p.cover_url); setFiles(p.attachments); setUrgent(p.urgent); setPinned(p.pinned); }).catch(() => {});
  }, [editId, token]);
  const save = async (draft: boolean) => {
    if (urgent && !draft && !(await confirmAction("تنبيه عاجل", "سيصل إشعار عاجل إلى كل هواتف مستخدمي التطبيق. هل البيان يستحق ذلك؟", "نشر وإرسال"))) return;
    setSaving(true);
    const b = { kind, title, summary, body, signed_by: signed, cover_url: cover, attachments: files, urgent, pinned, status: draft ? "draft" : "published" };
    try {
      const r = editId ? await pressApi.update(token, editId, b) : await pressApi.create(token, b);
      notify(draft ? "حُفظت المسودة" : "تم", (r as any).message || (r.push?.sent ? `أُرسل التنبيه إلى ${r.push.sent} جهاز` : r.push?.skipped || "حُفظ المنشور"));
      onDone();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setSaving(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={u.label}>نوع المنشور</Text>
      <View style={u.wrap}>{Object.entries(ov.kinds).map(([k, v]) => <Pill key={k} label={v.label} on={kind === k} onPress={() => setKind(k)} color={PRESS_INK} />)}</View>
      <Text style={u.label}>العنوان</Text>
      <TextInput value={title} onChangeText={setTitle} style={u.input} placeholder="عنوان البيان أو الخبر" placeholderTextColor={Colors.textMuted} maxLength={220} />
      <Text style={u.label}>ملخص (يظهر في القائمة)</Text>
      <TextInput value={summary} onChangeText={setSummary} style={u.input} maxLength={400} />
      <Text style={u.label}>النص</Text>
      <TextInput value={body} onChangeText={setBody} multiline style={[u.input, { minHeight: 220, textAlignVertical: "top", lineHeight: 26 }]} placeholder="افصل الفقرات بسطر جديد" placeholderTextColor={Colors.textMuted} />
      <Text style={u.label}>جهة التوقيع</Text>
      <TextInput value={signed} onChangeText={setSigned} style={u.input} />
      <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
        <Pressable onPress={async () => { const f = await up.pick(["image/jpeg", "image/png"]); if (f) setCover(f.url); }} style={[u.ghostBtn, { flex: 1 }]}><Ionicons name="image-outline" size={16} color={PRESS_INK} /><Text style={u.ghostText}>{cover ? "تغيير صورة الغلاف" : "صورة غلاف"}</Text></Pressable>
        <Pressable onPress={async () => { const f = await up.pick(["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]); if (f) setFiles([...files, f]); }} style={[u.ghostBtn, { flex: 1 }]}><Ionicons name="attach" size={16} color={PRESS_INK} /><Text style={u.ghostText}>إرفاق ملف (PDF/صورة)</Text></Pressable>
      </View>
      {!!up.busy && <Text style={[u.hint, { color: PRESS_RED }]}>جارٍ الرفع… {up.busy}</Text>}
      {files.map((f, i) => (
        <View key={i} style={st.fileRow}><Ionicons name="document-attach" size={16} color={PRESS_RED} /><Text style={st.fileT} numberOfLines={1}>{f.name}</Text><Pressable accessibilityRole="button" accessibilityLabel="إغلاق" hitSlop={8} onPress={() => setFiles(files.filter((_, j) => j !== i))}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable></View>
      ))}
      <Pressable onPress={() => setPinned(!pinned)} style={[u.rowR, { gap: 8, marginTop: 14 }]}><Ionicons name={pinned ? "checkbox" : "square-outline"} size={22} color={PRESS_INK} /><Text style={st.chk}>تثبيت في أعلى النافذة</Text></Pressable>
      <Pressable onPress={() => ov.me?.can_push ? setUrgent(!urgent) : notify("صلاحية", "التنبيه العاجل لمن منحتهم الإدارة هذه الصلاحية")} style={[st.urgentBox, urgent && { borderColor: PRESS_RED, backgroundColor: PRESS_RED + "0D" }]}>
        <Ionicons name={urgent ? "notifications" : "notifications-outline"} size={22} color={urgent ? PRESS_RED : Colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[st.chk, urgent && { color: PRESS_RED }]}>عاجل — إرسال تنبيه فوري لكل الهواتف</Text>
          <Text style={u.hint}>للبيانات الهامة فقط · بحد أقصى 3 تنبيهات يومياً{!ov.me?.can_push ? " · غير متاح لصلاحيتك" : ""}</Text>
        </View>
      </Pressable>
      <View style={[u.rowR, { gap: 8, marginTop: 18 }]}>
        {ov.me?.can_publish && <Pressable onPress={() => save(false)} disabled={saving} style={[u.primaryBtn, { flex: 1, backgroundColor: urgent ? PRESS_RED : PRESS_INK }]}>{saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}<Text style={u.primaryText}>{urgent ? "نشر عاجل" : "نشر"}</Text></Pressable>}
        <Pressable onPress={() => save(true)} disabled={saving} style={[u.ghostBtn, { flex: ov.me?.can_publish ? 0 : 1, paddingHorizontal: 16 }]}><Text style={u.ghostText}>حفظ كمسودة</Text></Pressable>
      </View>
      {!ov.me?.can_publish && <Text style={[u.hint, { marginTop: 8, textAlign: "center" }]}>بصفتك محرراً تُحفظ منشوراتك مسودات، ويعتمدها الناشر.</Text>}
    </ScrollView>
  );
}

function Posts({ token, onEdit }: { token: string; onEdit: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PressPost[] | null>(null);
  const load = useCallback(() => { pressApi.posts({ all: true, limit: 60 }, token).then((r) => setPosts(r.posts)).catch(() => setPosts([])); }, [token]);
  useEffect(() => { load(); }, [load]);
  if (!posts) return <ActivityIndicator color={PRESS_RED} style={{ marginTop: 30 }} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
      {posts.map((p) => (
        <View key={p.id} style={[u.card, { marginBottom: 10, gap: 4 }]}>
          <View style={[u.rowR, { gap: 6, flexWrap: "wrap" }]}>
            <Text style={[st.status, { color: p.status === "published" ? "#0E8A5F" : p.status === "draft" ? "#B7791F" : Colors.textMuted }]}>{p.status === "published" ? "منشور" : p.status === "draft" ? "مسودة" : "مسحوب"}</Text>
            <Text style={st.kind}>{p.kind_label}</Text><Text style={u.hint}>{p.ref_no}</Text>
            {p.urgent && <Text style={[st.status, { color: PRESS_RED }]}>عاجل{p.push_count != null ? ` · ${p.push_count} جهاز` : ""}</Text>}
          </View>
          <Text style={st.pTitle}>{p.title}</Text>
          <Text style={u.hint}>{fmtDay(p.published_at || p.created_at, true)} · {p.views} قراءة{p.author_name ? ` · ${p.author_name}` : ""}</Text>
          <View style={[u.rowR, { gap: 8, marginTop: 4 }]}>
            <Pressable onPress={() => onEdit(p.id)} style={st.sBtn}><Text style={st.sBtnT}>تعديل</Text></Pressable>
            <Pressable onPress={() => router.push({ pathname: "/press-post", params: { id: String(p.id) } } as any)} style={st.sBtn}><Text style={st.sBtnT}>عرض</Text></Pressable>
            {p.status !== "withdrawn" && <Pressable onPress={async () => { if (await confirmAction("سحب المنشور", "يُخفى ويبقى رقمه المرجعي محفوظاً.", "سحب", true)) { await pressApi.withdraw(token, p.id).catch((e) => notify("تعذّر", e?.message)); load(); } }} style={st.sBtn}><Text style={[st.sBtnT, { color: PRESS_RED }]}>سحب</Text></Pressable>}
          </View>
        </View>
      ))}
      {!posts.length && <Empty icon="megaphone-outline" title="لا منشورات بعد" />}
    </ScrollView>
  );
}

function Archive({ token, ov }: { token: string; ov: PressOverview }) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState({ kind: "coverage", title: "", description: "", event_date: "", place: "الحصاحيصا", tags: "", source: "" });
  const [files, setFiles] = useState<PressFile[]>([]);
  const [saving, setSaving] = useState(false);
  const up = useUploader(token);
  const save = async () => {
    setSaving(true);
    try { await pressApi.addArchive(token, { ...f, files }); notify("أُضيفت للأرشيف", f.title); setF({ ...f, title: "", description: "", tags: "" }); setFiles([]); }
    catch (e: any) { notify("تعذّر", e?.message); } finally { setSaving(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={u.hint}>احفظ التغطيات والتقارير والصور والوثائق التاريخية للمنطقة. تُرفع الملفات إلى التخزين السحابي (حتى 500 م.ب).</Text>
      <Text style={u.label}>النوع</Text>
      <View style={u.wrap}>{Object.entries(ov.archive_kinds).map(([k, l]) => <Pill key={k} label={l} on={f.kind === k} onPress={() => setF({ ...f, kind: k })} color={PRESS_INK} />)}</View>
      <Text style={u.label}>العنوان</Text><TextInput value={f.title} onChangeText={(t) => setF({ ...f, title: t })} style={u.input} />
      <View style={[u.rowR, { gap: 8 }]}>
        <View style={{ flex: 1 }}><Text style={u.label}>التاريخ (2015-03-12)</Text><TextInput value={f.event_date} onChangeText={(t) => setF({ ...f, event_date: t })} style={u.input} /></View>
        <View style={{ flex: 1 }}><Text style={u.label}>المكان</Text><TextInput value={f.place} onChangeText={(t) => setF({ ...f, place: t })} style={u.input} /></View>
      </View>
      <Text style={u.label}>الوصف</Text><TextInput value={f.description} onChangeText={(t) => setF({ ...f, description: t })} multiline style={[u.input, { minHeight: 110, textAlignVertical: "top" }]} />
      <Text style={u.label}>المصدر / الصحيفة</Text><TextInput value={f.source} onChangeText={(t) => setF({ ...f, source: t })} style={u.input} />
      <Text style={u.label}>وسوم</Text><TextInput value={f.tags} onChangeText={(t) => setF({ ...f, tags: t })} style={u.input} placeholder="كبري، انتخابات، فيضان…" placeholderTextColor={Colors.textMuted} />
      <Pressable onPress={async () => { const x = await up.pick(["application/pdf", "image/*", "video/mp4", "audio/*"]); if (x) setFiles([...files, x]); }} style={[u.ghostBtn, { marginTop: 12 }]}><Ionicons name="cloud-upload-outline" size={16} color={PRESS_INK} /><Text style={u.ghostText}>إرفاق ملف</Text></Pressable>
      {!!up.busy && <Text style={[u.hint, { color: PRESS_RED }]}>جارٍ الرفع… {up.busy}</Text>}
      {files.map((x, i) => <View key={i} style={st.fileRow}><Ionicons name="document-attach" size={16} color={PRESS_RED} /><Text style={st.fileT} numberOfLines={1}>{x.name}</Text></View>)}
      <Pressable onPress={save} disabled={saving} style={[u.primaryBtn, { backgroundColor: PRESS_INK, marginTop: 16 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="archive" size={17} color="#fff" />}<Text style={u.primaryText}>حفظ في الأرشيف</Text></Pressable>
    </ScrollView>
  );
}

function Accredit({ token }: { token: string }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Journalist[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [f, setF] = useState({ union_card_no: "", specialty: "", beat: "", whatsapp: "", public_email: "", contact_public: false });
  const load = useCallback(() => { pressApi.directory({}).then((r) => setList(r.journalists)).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (j: Journalist, status: "active" | "revoked") => {
    try { await pressApi.accredit(token, j.user_id, { ...f, status }); notify("تم", status === "active" ? "اعتُمد في الدليل" : "أُلغي الاعتماد"); setOpen(null); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  if (!list) return <ActivityIndicator color={PRESS_RED} style={{ marginTop: 30 }} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={u.hint}>يظهر هنا أصحاب العضوية الصحفية السارية في ديوان الكُتّاب. الاعتماد يمنحهم شارة «معتمد من النقابة» في الدليل، ويمكن إظهار وسائل تواصلهم بموافقتهم.</Text>
      {list.map((j) => (
        <View key={j.user_id} style={[u.card, { marginTop: 10 }]}>
          <Pressable onPress={() => { setOpen(open === j.user_id ? null : j.user_id); setF({ union_card_no: j.union_card_no || "", specialty: j.specialty || "", beat: j.beat || "", whatsapp: j.whatsapp || "", public_email: j.email || "", contact_public: !!(j.whatsapp || j.email) }); }} style={[u.rowR, { gap: 10 }]}>
            <UserAvatar name={j.name} avatarUrl={j.avatar_url} size={40} />
            <View style={{ flex: 1 }}><Text style={st.pTitle}>{j.name}</Text><Text style={u.hint}>{[j.press_role, j.press_org].filter(Boolean).join(" · ")}</Text></View>
            <Text style={[st.status, { color: j.accredited ? "#0E8A5F" : Colors.textMuted }]}>{j.accredited ? "معتمد" : "غير معتمد"}</Text>
          </Pressable>
          {open === j.user_id && (
            <View style={{ marginTop: 8 }}>
              {([["union_card_no", "رقم بطاقة النقابة"], ["specialty", "التخصص"], ["beat", "منطقة التغطية"], ["whatsapp", "واتساب (للظهور العام)"], ["public_email", "بريد (للظهور العام)"]] as const).map(([k, l]) => (
                <View key={k}><Text style={u.label}>{l}</Text><TextInput value={(f as any)[k]} onChangeText={(t) => setF({ ...f, [k]: t })} style={u.input} /></View>
              ))}
              <Pressable onPress={() => setF({ ...f, contact_public: !f.contact_public })} style={[u.rowR, { gap: 8, marginTop: 10 }]}><Ionicons name={f.contact_public ? "checkbox" : "square-outline"} size={22} color={PRESS_INK} /><Text style={st.chk}>إظهار وسائل التواصل في الدليل (بموافقة الصحفي)</Text></Pressable>
              <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
                <Pressable onPress={() => save(j, "active")} style={[u.primaryBtn, { flex: 1, backgroundColor: "#0E8A5F" }]}><Text style={u.primaryText}>{j.accredited ? "تحديث" : "اعتماد"}</Text></Pressable>
                {j.accredited && <Pressable onPress={() => save(j, "revoked")} style={[u.ghostBtn, { paddingHorizontal: 16 }]}><Text style={[u.ghostText, { color: PRESS_RED }]}>إلغاء الاعتماد</Text></Pressable>}
              </View>
            </View>
          )}
        </View>
      ))}
      {!list.length && <Empty icon="people-outline" title="لا توجد عضويات صحفية سارية" />}
    </ScrollView>
  );
}

function Settings({ token, ov }: { token: string; ov: PressOverview }) {
  const insets = useSafeAreaInsets();
  const app = ov.me?.role === "app";
  const [s, setS] = useState({ ...ov.settings });
  const [staff, setStaff] = useState<{ user_id: number; name: string; avatar_url: string | null; role: string; role_label: string; title: string | null; can_push: boolean }[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<{ id: number; name: string; avatar_url: string | null }[]>([]);
  const [newRole, setNewRole] = useState("publisher"); const [newTitle, setNewTitle] = useState(""); const [newPush, setNewPush] = useState(false);
  const loadStaff = useCallback(() => { pressApi.staff(token).then((r) => setStaff(r.staff)).catch(() => {}); }, [token]);
  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; } const t = setTimeout(() => pressApi.lookup(token, q.trim()).then((r) => setHits(r.users)).catch(() => {}), 350); return () => clearTimeout(t); }, [q, token]);
  const saveSettings = async () => { try { await pressApi.saveSettings(token, s); notify("تم", "حُفظت الإعدادات"); } catch (e: any) { notify("تعذّر", e?.message); } };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={st.h}>الطاقم والصلاحيات</Text>
      <Text style={u.hint}>الناشر (الأمانة الإعلامية) ينشر ويعتمد الصحفيين، والمحرر يكتب مسودات، ومدير النافذة يدير الطاقم.</Text>
      {staff.map((m) => (
        <View key={m.user_id} style={[u.card, { marginTop: 8, flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10 }]}>
          <UserAvatar name={m.name} avatarUrl={m.avatar_url} size={36} />
          <View style={{ flex: 1 }}><Text style={st.pTitle}>{m.name}</Text><Text style={u.hint}>{m.role_label}{m.title ? ` · ${m.title}` : ""}{m.can_push ? " · تنبيه عاجل" : ""}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="حذف" hitSlop={8} onPress={async () => { if (await confirmAction("إزالة", m.name, "إزالة", true)) { await pressApi.delStaff(token, m.user_id).catch((e) => notify("تعذّر", e?.message)); loadStaff(); } }}><Ionicons name="trash-outline" size={19} color={PRESS_RED} /></Pressable>
        </View>
      ))}
      <View style={[u.card, { marginTop: 10 }]}>
        <Text style={st.chk}>إضافة عضو للطاقم</Text>
        <View style={[u.wrap, { marginTop: 8 }]}>{[["publisher", "ناشر"], ["editor", "محرر"], ...(app ? [["admin", "مدير النافذة"]] : [])].map(([k, l]) => <Pill key={k} label={l} on={newRole === k} onPress={() => setNewRole(k)} color={PRESS_INK} />)}</View>
        <TextInput value={newTitle} onChangeText={setNewTitle} placeholder="الصفة (مثال: أمين الإعلام بالنقابة)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 8 }]} />
        {newRole !== "editor" && <Pressable onPress={() => setNewPush(!newPush)} style={[u.rowR, { gap: 8, marginTop: 8 }]}><Ionicons name={newPush ? "checkbox" : "square-outline"} size={20} color={PRESS_RED} /><Text style={u.hint}>صلاحية التنبيه العاجل</Text></Pressable>}
        <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن المستخدم" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 8 }]} />
        {hits.map((h) => (
          <Pressable key={h.id} onPress={async () => { try { await pressApi.setStaff(token, h.id, { role: newRole, title: newTitle, can_push: newPush }); setQ(""); setNewTitle(""); loadStaff(); notify("تم", `${h.name} في الطاقم`); } catch (e: any) { notify("تعذّر", e?.message); } }} style={st.hit}>
            <UserAvatar name={h.name} avatarUrl={h.avatar_url} size={30} /><Text style={[st.pTitle, { flex: 1 }]}>{h.name}</Text><Ionicons name="add-circle" size={22} color={PRESS_RED} />
          </Pressable>
        ))}
      </View>

      <Text style={[st.h, { marginTop: 20 }]}>إعدادات النافذة</Text>
      {app && (
        <>
          <Text style={u.label}>حالة الشراكة</Text>
          <View style={u.wrap}>{Object.entries(PARTNER_STATUS).map(([k, v]) => <Pill key={k} label={v.label} on={s.status === k} onPress={() => setS({ ...s, status: k as any })} color={v.color} />)}</View>
          <Text style={[u.hint, { marginTop: 4 }]}>اجعلها «معتمدة» بعد توقيع اتفاق التوأمة فقط.</Text>
          <Text style={u.label}>مرحلة التنفيذ</Text>
          <View style={u.wrap}>{[[1, "التنسيق والاعتماد"], [2, "التكامل التقني"], [3, "الإطلاق المشترك"]].map(([k, l]) => <Pill key={k} label={`${k}. ${l}`} on={s.phase === k} onPress={() => setS({ ...s, phase: k as number })} color={PRESS_RED} />)}</View>
          <Text style={u.label}>اسم الجهة الشريكة</Text><TextInput value={s.partner_name} onChangeText={(t) => setS({ ...s, partner_name: t })} style={u.input} />
        </>
      )}
      <Text style={u.label}>اسم النافذة</Text><TextInput value={s.window_title} onChangeText={(t) => setS({ ...s, window_title: t })} style={u.input} />
      <Text style={u.label}>نبذة / الرؤية</Text><TextInput value={s.about || ""} onChangeText={(t) => setS({ ...s, about: t })} multiline style={[u.input, { minHeight: 90, textAlignVertical: "top" }]} />
      <Text style={u.label}>بريد التواصل</Text><TextInput value={s.contact_email || ""} onChangeText={(t) => setS({ ...s, contact_email: t })} style={u.input} />
      <Text style={u.label}>هاتف/واتساب</Text><TextInput value={s.contact_phone || ""} onChangeText={(t) => setS({ ...s, contact_phone: t })} style={u.input} />
      <Text style={u.label}>رابط الشعار (https)</Text><TextInput value={s.logo_url || ""} onChangeText={(t) => setS({ ...s, logo_url: t })} style={u.input} autoCapitalize="none" />
      <Pressable onPress={saveSettings} style={[u.primaryBtn, { backgroundColor: PRESS_INK, marginTop: 16 }]}><Ionicons name="save" size={17} color="#fff" /><Text style={u.primaryText}>حفظ الإعدادات</Text></Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  bar: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, backgroundColor: PRESS_INK },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  barSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center" },
  tabs: { backgroundColor: Colors.cardBg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.textPrimary, textAlign: "right" },
  chk: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  urgentBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  fileRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: Colors.cardBg, marginTop: 6, borderWidth: 1, borderColor: Colors.divider },
  fileT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  status: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  kind: { fontFamily: "Cairo_700Bold", fontSize: 12, color: PRESS_INK },
  pTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  sBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider },
  sBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: PRESS_INK },
  hit: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
});
