// بوابة إدارة الاتحاد — تبويبا «الأنشطة» (نشر وأرشفة) و«الانتخابات»
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, RefreshControl, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import DateTimeField, { DateInput, formatDateTime } from "@/components/ui/DateTimeField";
import { ImagesUploadField } from "@/components/union/ImageUploadField";

const UC = "#1F5C8A";
const UC2 = "#9DBBD6";
const GREEN = "#22C55E";
const RED = "#EF4444";
const AMBER = "#F59E0B";

async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `خطأ (${r.status})`);
  return j as T;
}
const fmtDay = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "");

// ═══════════════════════ الأنشطة: مسودة ← منشور ← مؤرشف ═══════════════════════
type ActStatus = "draft" | "published" | "archived";
type Activity = {
  id: number; title: string; body: string | null; category: string; category_label: string; activity_date: string;
  location: string | null; cover_url: string | null; images: string[]; attendees: number | null;
  status?: ActStatus; author_name?: string | null; published_at?: string | null; archived_at?: string | null;
};
const CATS: [string, string][] = [
  ["seminar", "ندوة ومحاضرة"], ["course", "دورة وورشة"], ["trip", "رحلة"], ["sports", "نشاط رياضي"], ["culture", "نشاط ثقافي وفني"],
  ["volunteer", "عمل طوعي"], ["meeting", "جمعية عمومية"], ["celebration", "احتفال وتكريم"], ["other", "أخرى"],
];
const ACT_STATUS: Record<ActStatus, { label: string; color: string; icon: any }> = {
  draft: { label: "مسودة", color: "#946B00", icon: "create-outline" },
  published: { label: "منشور", color: "#00966A", icon: "megaphone-outline" },
  archived: { label: "مؤرشف", color: "#4A5E55", icon: "archive-outline" },
};
const emptyAct = () => ({ title: "", body: "", category: "seminar", activity_date: new Date().toISOString().slice(0, 10), location: "", images: [] as string[], attendees: "" });

/**
 * إدارة الأنشطة: بوابة الاتحاد (base الافتراضي) أو إدارة التطبيق (base="/admin/student-union/activities").
 * من لا يملك صلاحية التعديل يرى الأرشيف العام فقط.
 */
export function ArchiveTab({ token, canEdit, base = "/union-manager/activities" }: { token: string; canEdit: boolean; base?: string }) {
  const [list, setList] = useState<Activity[]>([]);
  const [stats, setStats] = useState<{ total: number; attendees: number; photos: number }>({ total: 0, attendees: 0, photos: 0 });
  const [counts, setCounts] = useState<Record<ActStatus, number>>({ draft: 0, published: 0, archived: 0 });
  const [filter, setFilter] = useState<ActStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ReturnType<typeof emptyAct> | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [announce, setAnnounce] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api(token, canEdit ? `${base}${filter === "all" ? "" : `?status=${filter}`}` : "/union/activities");
      setList(d.activities || []); setStats(d.stats || stats); if (d.counts) setCounts(d.counts);
    } catch (e: any) { notify("تنبيه", e.message); } finally { setLoading(false); }
  }, [token, canEdit, base, filter]);
  useEffect(() => { load(); }, [load]);

  const save = async (status: ActStatus) => {
    if (!form) return;
    setSaving(true);
    try {
      const body = { ...form, attendees: form.attendees === "" ? null : Number(form.attendees), cover_url: form.images[0] || null };
      if (editId) await api(token, `${base}/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api(token, base, { method: "POST", body: JSON.stringify({ ...body, status, announce: status === "published" && announce }) });
      setForm(null); setEditId(null); load();
      if (!editId) notify(status === "draft" ? "حُفظت المسودة" : "تم النشر ✓", status === "draft" ? "يمكنك نشرها متى شئت." : announce ? "نُشر النشاط وأُعلن في أخبار الاتحاد." : "نُشر النشاط.");
    } catch (e: any) { notify("تنبيه", e.message); } finally { setSaving(false); }
  };
  const setStatus = async (a: Activity, status: ActStatus) => {
    const msg = status === "archived" ? `نقل «${a.title}» إلى الأرشيف؟ يبقى متاحاً في أرشيف الاتحاد ويخرج من الأنشطة الحالية.`
      : status === "published" && a.status === "draft" ? `نشر «${a.title}» وإعلانه في أخبار الاتحاد؟`
      : status === "published" ? `إعادة نشر «${a.title}» ضمن الأنشطة الحالية؟` : `إعادة «${a.title}» إلى المسودات وإخفاؤه عن الأعضاء؟`;
    if (!(await confirmAction(ACT_STATUS[status].label, msg, "تأكيد"))) return;
    try { await api(token, `${base}/${a.id}/status`, { method: "POST", body: JSON.stringify({ status, announce: a.status === "draft" && status === "published" }) }); load(); }
    catch (e: any) { notify("تنبيه", e.message); }
  };
  const remove = async (a: Activity) => {
    if (!(await confirmAction("حذف النشاط", `حذف «${a.title}» نهائياً؟ للإخفاء دون حذف استخدم الأرشفة أو المسودة.`, "حذف", true))) return;
    try { await api(token, `${base}/${a.id}`, { method: "DELETE" }); load(); } catch (e: any) { notify("تنبيه", e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={UC} />}>
        <View style={st.statsRow}>
          {[[stats.total, "نشاطاً"], [stats.attendees, "مشاركاً"], [stats.photos, "صورة"]].map(([n, l], i) => (
            <View key={i} style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{l}</Text></View>
          ))}
        </View>
        {canEdit && (
          <View style={st.wrap}>
            {(["all", "draft", "published", "archived"] as const).map((k) => {
              const on = filter === k;
              const n = k === "all" ? counts.draft + counts.published + counts.archived : counts[k];
              return (
                <TouchableOpacity key={k} onPress={() => { setLoading(true); setFilter(k); }} style={[st.chip, on && st.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[st.chipT, on && { color: UC2 }]}>{k === "all" ? "الكل" : ACT_STATUS[k].label} ({n})</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {loading ? <ActivityIndicator color={UC} style={{ marginTop: 30 }} /> : list.length === 0 ? (
          <View style={st.empty}><Ionicons name="images-outline" size={44} color={Colors.textMuted} /><Text style={st.emptyT}>{filter === "draft" ? "لا توجد مسودات." : "لا توجد أنشطة بعد. وثّق أول نشاط للاتحاد."}</Text></View>
        ) : list.map((a) => {
          const s = ACT_STATUS[a.status || "published"];
          return (
            <View key={a.id} style={[st.card, a.status === "draft" && { borderColor: s.color + "70", borderStyle: "dashed" }]}>
              {a.cover_url ? <Image source={{ uri: a.cover_url }} style={[st.cover, a.status === "archived" && { opacity: 0.85 }]} /> : null}
              <View style={{ padding: 12, gap: 4 }}>
                <View style={st.rowR}>
                  <View style={[st.rowR, { gap: 6 }]}>
                    {canEdit && (
                      <View style={[st.tag, { backgroundColor: s.color + "1F", flexDirection: "row-reverse", alignItems: "center", gap: 4 }]}>
                        <Ionicons name={s.icon} size={12} color={s.color} /><Text style={[st.tagT, { color: s.color }]}>{s.label}</Text>
                      </View>
                    )}
                    <View style={st.tag}><Text style={st.tagT}>{a.category_label}</Text></View>
                  </View>
                  <Text style={st.meta}>{fmtDay(a.activity_date)}</Text>
                </View>
                <Text style={st.title}>{a.title}</Text>
                <Text style={st.meta}>{[a.location, a.attendees ? `${a.attendees} مشارك` : "", a.images.length ? `${a.images.length} صورة` : ""].filter(Boolean).join(" · ")}</Text>
                {canEdit && a.author_name ? <Text style={st.meta}>بواسطة {a.author_name}</Text> : null}
                {canEdit && (
                  <View style={[st.wrap, { gap: 8, marginTop: 6 }]}>
                    {a.status === "draft" && (
                      <TouchableOpacity style={[st.ghost, { backgroundColor: "#00966A", borderColor: "#00966A" }]} onPress={() => setStatus(a, "published")}>
                        <Ionicons name="megaphone-outline" size={15} color="#fff" /><Text style={[st.ghostT, { color: "#fff" }]}>نشر</Text>
                      </TouchableOpacity>
                    )}
                    {a.status !== "archived" && a.status !== "draft" && (
                      <TouchableOpacity style={st.ghost} onPress={() => setStatus(a, "archived")}>
                        <Ionicons name="archive-outline" size={15} color={UC2} /><Text style={st.ghostT}>أرشفة</Text>
                      </TouchableOpacity>
                    )}
                    {a.status === "archived" && (
                      <TouchableOpacity style={st.ghost} onPress={() => setStatus(a, "published")}>
                        <Ionicons name="refresh-outline" size={15} color={UC2} /><Text style={st.ghostT}>إعادة النشر</Text>
                      </TouchableOpacity>
                    )}
                    {a.status !== "draft" && (
                      <TouchableOpacity style={st.ghost} onPress={() => setStatus(a, "draft")}>
                        <Ionicons name="eye-off-outline" size={15} color={UC2} /><Text style={st.ghostT}>إخفاء كمسودة</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={st.ghost} onPress={() => { setEditId(a.id); setForm({ title: a.title, body: a.body || "", category: a.category, activity_date: a.activity_date.slice(0, 10), location: a.location || "", images: a.images, attendees: a.attendees == null ? "" : String(a.attendees) }); }}>
                      <Ionicons name="pencil-outline" size={15} color={UC2} /><Text style={st.ghostT}>تعديل</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.ghost, { borderColor: RED + "50" }]} onPress={() => remove(a)}>
                      <Ionicons name="trash-outline" size={15} color={RED} /><Text style={[st.ghostT, { color: RED }]}>حذف</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {canEdit && (
        <TouchableOpacity style={st.fab} onPress={() => { setEditId(null); setAnnounce(true); setForm(emptyAct()); }}>
          <Ionicons name="add-circle" size={20} color="#fff" /><Text style={st.fabT}>نشاط جديد</Text>
        </TouchableOpacity>
      )}

      <Modal visible={!!form} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {form && (
            <ScrollView style={st.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={st.sheetT}>{editId ? "تعديل النشاط" : "نشاط جديد"}</Text>
              <Text style={st.label}>عنوان النشاط *</Text>
              <TextInput style={st.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: ورشة كتابة السيرة الذاتية" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={st.label}>التصنيف</Text>
              <View style={st.wrap}>
                {CATS.map(([k, l]) => (
                  <TouchableOpacity key={k} onPress={() => setForm({ ...form, category: k })} style={[st.chip, form.category === k && st.chipOn]}>
                    <Text style={[st.chipT, form.category === k && { color: UC2 }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[st.rowR, { gap: 10, alignItems: "flex-start" }]}>
                <View style={{ flex: 1.4 }}><DateInput label="التاريخ *" value={form.activity_date} onChange={(v) => setForm({ ...form, activity_date: v })} clearable={false} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.label}>عدد المشاركين</Text>
                  <TextInput style={st.input} value={form.attendees} onChangeText={(v) => setForm({ ...form, attendees: v.replace(/\D/g, "") })} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textMuted} textAlign="right" />
                </View>
              </View>
              <Text style={st.label}>المكان</Text>
              <TextInput style={st.input} value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} placeholder="مثال: قاعة جامعة الجزيرة" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={st.label}>وصف النشاط</Text>
              <TextInput style={[st.input, { minHeight: 100, textAlignVertical: "top" }]} multiline value={form.body} onChangeText={(v) => setForm({ ...form, body: v })} placeholder="ما الذي جرى، ومن شارك، وما الذي تحقق" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <ImagesUploadField label="صور النشاط (الأولى غلاف)" value={form.images} onChange={(v) => setForm({ ...form, images: v })} folder="union/activities" max={30} />
              {!editId && (
                <TouchableOpacity onPress={() => setAnnounce(!announce)} style={[st.rowR, { justifyContent: "flex-start", gap: 8, paddingVertical: 4 }]} accessibilityRole="checkbox" accessibilityState={{ checked: announce }}>
                  <Ionicons name={announce ? "checkbox" : "square-outline"} size={22} color={announce ? GREEN : Colors.textMuted} />
                  <Text style={st.label}>إعلان النشاط في أخبار الاتحاد عند النشر</Text>
                </TouchableOpacity>
              )}
              <View style={[st.rowR, { gap: 10, marginTop: 6 }]}>
                <TouchableOpacity style={[st.primary, { flex: 2 }, saving && { opacity: 0.6 }]} onPress={() => save("published")} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryT}>{editId ? "حفظ التعديلات" : "نشر الآن"}</Text>}
                </TouchableOpacity>
                {!editId && (
                  <TouchableOpacity style={[st.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => save("draft")} disabled={saving}><Text style={st.ghostT}>حفظ كمسودة</Text></TouchableOpacity>
                )}
                <TouchableOpacity style={[st.ghost, { flex: 0.8, justifyContent: "center" }]} onPress={() => setForm(null)}><Text style={st.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ═══════════════════════ الانتخابات ═══════════════════════
type Cand = { id: number; position_id: number; full_name: string; institution: string | null; major: string | null; photo_url: string | null; program: string | null; status: string; reject_reason: string | null };
type Election = {
  id: number; title: string; description: string | null; nominations_start: string; nominations_end: string; voting_start: string; voting_end: string;
  published_at: string | null; results_published_at: string | null; phase: string; phase_label: string; locked: boolean;
  turnout: { voters: number; eligible: number; percent: number };
  positions: { id: number; title: string; seats: number; candidates: Cand[] }[];
  results: any; log: { action: string; details: string | null; actor: string | null; created_at: string }[];
};
const PHASE_COLOR: Record<string, string> = { draft: Colors.textMuted, upcoming: UC2, nominations: AMBER, campaign: "#A78BFA", voting: GREEN, counting: "#F97316", results: UC };
const addH = (h: number, base = new Date()) => { const d = new Date(base); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + h); return d; };
const newDraft = () => {
  const ns = addH(24);
  return { title: "", description: "", ns, ne: addH(24 * 7, ns), vs: addH(24 * 10, ns), ve: addH(24 * 10 + 10, ns), positions: [{ title: "رئيس الاتحاد", seats: "1" }, { title: "أعضاء المكتب التنفيذي", seats: "6" }] };
};

export function ElectionsTab({ token, canManage }: { token: string; canManage: boolean }) {
  const [list, setList] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ReturnType<typeof newDraft> | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [tally, setTally] = useState<Record<number, any>>({});
  const [reject, setReject] = useState<{ cid: number; eid: number; reason: string } | null>(null);
  const [addC, setAddC] = useState<{ eid: number; member_no: string; position_id: number | null } | null>(null);
  const [sched, setSched] = useState<{ eid: number; ns: Date; ne: Date; vs: Date; ve: Date } | null>(null);

  const load = useCallback(async () => {
    try { const d = await api(token, "/union-manager/elections"); setList(d.elections || []); }
    catch (e: any) { notify("تنبيه", e.message); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const replace = (e: Election) => setList((l) => l.map((x) => (x.id === e.id ? e : x)));
  const act = async (e: Election, action: string, extra: object = {}, confirmMsg?: string) => {
    if (confirmMsg && !(await confirmAction(e.title, confirmMsg, "تأكيد"))) return;
    try { const d = await api(token, `/union-manager/elections/${e.id}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) }); replace(d.election); }
    catch (err: any) { notify("تنبيه", err.message); }
  };
  const create = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api(token, "/union-manager/elections", { method: "POST", body: JSON.stringify({
        title: draft.title, description: draft.description,
        nominations_start: draft.ns.toISOString(), nominations_end: draft.ne.toISOString(), voting_start: draft.vs.toISOString(), voting_end: draft.ve.toISOString(),
        positions: draft.positions.map((p) => ({ title: p.title, seats: Number(p.seats) || 1 })),
      }) });
      setDraft(null); load();
    } catch (e: any) { notify("تنبيه", e.message); } finally { setSaving(false); }
  };
  const loadTally = async (e: Election) => {
    try { const d = await api(token, `/union-manager/elections/${e.id}/tally`); setTally((t) => ({ ...t, [e.id]: d.tally })); }
    catch (err: any) { notify("تنبيه", err.message); }
  };
  const setCand = async (eid: number, cid: number, status: string, reason?: string) => {
    try { await api(token, `/union-manager/elections/${eid}/candidates/${cid}`, { method: "PATCH", body: JSON.stringify({ status, reason }) }); setReject(null); load(); }
    catch (e: any) { notify("تنبيه", e.message); }
  };
  const addCandidate = async () => {
    if (!addC?.position_id) { notify("تنبيه", "اختر المنصب"); return; }
    try { await api(token, `/union-manager/elections/${addC.eid}/candidates`, { method: "POST", body: JSON.stringify({ member_no: addC.member_no.trim(), position_id: addC.position_id }) }); setAddC(null); load(); }
    catch (e: any) { notify("تنبيه", e.message); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={UC} />}>
        <View style={st.note}>
          <Ionicons name="shield-checkmark-outline" size={17} color={GREEN} />
          <Text style={st.noteT}>الاقتراع سري، ولا يرى أحد أي عدّ قبل انتهاء التصويت. المواعيد والمرشحون يُجمَّدون عند بدء التصويت، وكل إجراء هنا يظهر في سجل علني للأعضاء.</Text>
        </View>
        {!canManage && <Text style={st.meta}>إدارة الانتخابات لرئاسة الاتحاد. يمكنك المتابعة فقط.</Text>}
        {loading ? <ActivityIndicator color={UC} style={{ marginTop: 30 }} /> : list.length === 0 ? (
          <View style={st.empty}><Ionicons name="file-tray-outline" size={44} color={Colors.textMuted} /><Text style={st.emptyT}>لا انتخابات بعد.</Text></View>
        ) : list.map((e) => {
          const color = PHASE_COLOR[e.phase] || UC2;
          const expanded = open === e.id;
          const pending = e.positions.flatMap((p) => p.candidates).filter((c) => c.status === "pending").length;
          const t = tally[e.id];
          return (
            <View key={e.id} style={st.card}>
              <TouchableOpacity onPress={() => setOpen(expanded ? null : e.id)} style={{ padding: 12, gap: 6 }}>
                <View style={st.rowR}>
                  <View style={[st.tag, { backgroundColor: color + "25" }]}><Text style={[st.tagT, { color }]}>{e.phase_label}</Text></View>
                  {pending > 0 && <View style={[st.tag, { backgroundColor: AMBER + "25" }]}><Text style={[st.tagT, { color: AMBER }]}>{pending} ترشح بانتظار المراجعة</Text></View>}
                </View>
                <Text style={st.title}>{e.title}</Text>
                <Text style={st.meta}>التصويت: {formatDateTime(new Date(e.voting_start))} ← {formatDateTime(new Date(e.voting_end))}</Text>
                <View style={st.barBg}><View style={[st.barFill, { width: `${Math.min(100, e.turnout.percent)}%`, backgroundColor: GREEN }]} /></View>
                <Text style={st.meta}>المشاركة: {e.turnout.voters} من {e.turnout.eligible} مؤهلاً ({e.turnout.percent}%)</Text>
              </TouchableOpacity>

              {expanded && (
                <View style={{ padding: 12, paddingTop: 0, gap: 10 }}>
                  {canManage && (
                    <View style={[st.rowR, { flexWrap: "wrap", gap: 8 }]}>
                      {e.phase === "draft" && <Btn icon="megaphone-outline" label="نشر للأعضاء" color={GREEN} onPress={() => act(e, "publish", {}, "بعد النشر يصل إشعار للأعضاء، ولا يمكن حذف الانتخاب. متابعة؟")} />}
                      {!e.locked && <Btn icon="time-outline" label="المواعيد" onPress={() => setSched({ eid: e.id, ns: new Date(e.nominations_start), ne: new Date(e.nominations_end), vs: new Date(e.voting_start), ve: new Date(e.voting_end) })} />}
                      {!e.locked && <Btn icon="person-add-outline" label="إضافة مرشح" onPress={() => setAddC({ eid: e.id, member_no: "", position_id: e.positions[0]?.id ?? null })} />}
                      {(e.phase === "counting" || e.phase === "results") && <Btn icon="calculator-outline" label="الفرز" onPress={() => loadTally(e)} />}
                      {e.phase === "counting" && <Btn icon="trophy-outline" label="إعلان النتائج" color={UC2} onPress={() => act(e, "publish_results", {}, "تُنشر النتائج للأعضاء نهائياً، ولا يمكن تعديلها. متابعة؟")} />}
                      {e.phase === "draft" && <Btn icon="trash-outline" label="حذف المسودة" color={RED} onPress={async () => { if (await confirmAction("حذف", "حذف المسودة؟", "حذف", true)) { try { await api(token, `/union-manager/elections/${e.id}`, { method: "DELETE" }); load(); } catch (err: any) { notify("تنبيه", err.message); } } }} />}
                    </View>
                  )}

                  {e.positions.map((p) => (
                    <View key={p.id} style={st.box}>
                      <Text style={st.boxT}>{p.title} <Text style={st.meta}>· {p.seats} {p.seats === 1 ? "مقعد" : "مقاعد"} · {p.candidates.filter((c) => c.status === "approved").length} مرشح معتمد</Text></Text>
                      {p.candidates.length === 0 ? <Text style={st.meta}>لا مرشحين بعد</Text> : p.candidates.map((c) => {
                        const sc = c.status === "approved" ? GREEN : c.status === "rejected" ? RED : AMBER;
                        return (
                          <View key={c.id} style={st.cand}>
                            {c.photo_url ? <Image source={{ uri: c.photo_url }} style={st.candImg} /> : <View style={[st.candImg, { alignItems: "center", justifyContent: "center", backgroundColor: UC + "25" }]}><Text style={{ color: UC2, fontFamily: "Cairo_700Bold" }}>{c.full_name.trim()[0]}</Text></View>}
                            <View style={{ flex: 1 }}>
                              <Text style={st.candN}>{c.full_name}</Text>
                              <Text style={st.meta} numberOfLines={1}>{[c.institution, c.major].filter(Boolean).join(" · ")}</Text>
                              {c.program ? <Text style={st.prog} numberOfLines={3}>{c.program}</Text> : null}
                              {c.status === "rejected" && c.reject_reason ? <Text style={[st.meta, { color: RED }]}>سبب الرفض: {c.reject_reason}</Text> : null}
                            </View>
                            <View style={{ gap: 4, alignItems: "center" }}>
                              <View style={[st.tag, { backgroundColor: sc + "25" }]}><Text style={[st.tagT, { color: sc }]}>{c.status === "approved" ? "معتمد" : c.status === "rejected" ? "مرفوض" : "بانتظار"}</Text></View>
                              {canManage && !e.locked && c.status !== "approved" && <TouchableOpacity onPress={() => setCand(e.id, c.id, "approved")}><Text style={[st.link, { color: GREEN }]}>اعتماد</Text></TouchableOpacity>}
                              {canManage && !e.locked && c.status !== "rejected" && <TouchableOpacity onPress={() => setReject({ eid: e.id, cid: c.id, reason: "" })}><Text style={[st.link, { color: RED }]}>رفض</Text></TouchableOpacity>}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}

                  {t && (
                    <View style={st.box}>
                      <Text style={st.boxT}>الفرز {e.phase === "results" ? "(معلن)" : "(مبدئي — لم يُعلن)"}</Text>
                      <Text style={[st.meta, { color: t.consistent ? GREEN : RED }]}>{t.consistent ? "✓" : "✗"} المقترعون {t.voters} · الإيصالات {t.receipts}</Text>
                      {t.positions.map((p: any) => (
                        <View key={p.position_id} style={{ gap: 4, marginTop: 6 }}>
                          <Text style={st.candN}>{p.title} <Text style={st.meta}>· صحيحة {p.valid_votes} · بيضاء {p.blank_votes}</Text></Text>
                          {p.tie && <Text style={[st.meta, { color: AMBER }]}>⚠ تعادل على آخر مقعد — يُحسم وفق اللائحة</Text>}
                          {p.candidates.map((c: any) => (
                            <View key={c.candidate_id} style={{ gap: 2 }}>
                              <View style={st.rowR}><Text style={st.prog}>{c.winner ? "🏆 " : ""}{c.full_name}</Text><Text style={st.meta}>{c.votes} ({c.percent}%)</Text></View>
                              <View style={st.barBg}><View style={[st.barFill, { width: `${c.percent}%`, backgroundColor: c.winner ? GREEN : UC2 }]} /></View>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={st.box}>
                    <Text style={st.boxT}>السجل العلني</Text>
                    {e.log.slice(0, 8).map((l, i) => <Text key={i} style={st.meta}>• {new Date(l.created_at).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} — {l.details || l.action}</Text>)}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {canManage && (
        <TouchableOpacity style={st.fab} onPress={() => setDraft(newDraft())}>
          <Ionicons name="add-circle" size={20} color="#fff" /><Text style={st.fabT}>انتخاب جديد</Text>
        </TouchableOpacity>
      )}

      {/* إنشاء انتخاب */}
      <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {draft && (
            <ScrollView style={st.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={st.sheetT}>انتخاب جديد</Text>
              <Text style={st.label}>العنوان *</Text>
              <TextInput style={st.input} value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder="مثال: انتخابات المكتب التنفيذي 2026" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={st.label}>الوصف واللائحة المختصرة</Text>
              <TextInput style={[st.input, { minHeight: 80, textAlignVertical: "top" }]} multiline value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} placeholder="الدورة، شروط الترشح، طريقة حسم التعادل" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={st.label}>المناصب وعدد المقاعد</Text>
              {draft.positions.map((p, i) => (
                <View key={i} style={[st.rowR, { gap: 8 }]}>
                  <TextInput style={[st.input, { flex: 1 }]} value={p.title} onChangeText={(v) => setDraft({ ...draft, positions: draft.positions.map((x, j) => (j === i ? { ...x, title: v } : x)) })} placeholder="المنصب" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <TextInput style={[st.input, { width: 64 }]} value={p.seats} onChangeText={(v) => setDraft({ ...draft, positions: draft.positions.map((x, j) => (j === i ? { ...x, seats: v.replace(/\D/g, "") } : x)) })} keyboardType="numeric" textAlign="center" />
                  <TouchableOpacity onPress={() => setDraft({ ...draft, positions: draft.positions.filter((_, j) => j !== i) })}><Ionicons name="close-circle" size={22} color={RED} /></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => setDraft({ ...draft, positions: [...draft.positions, { title: "", seats: "1" }] })}><Text style={st.link}>+ منصب آخر</Text></TouchableOpacity>
              <Schedule v={draft} set={(x) => setDraft({ ...draft, ...x })} />
              <View style={[st.rowR, { gap: 10, marginTop: 6 }]}>
                <TouchableOpacity style={[st.primary, { flex: 2 }, saving && { opacity: 0.6 }]} onPress={create} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryT}>حفظ كمسودة</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[st.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => setDraft(null)}><Text style={st.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
              <Text style={st.meta}>تبقى مسودة لا يراها الأعضاء حتى تضغط «نشر للأعضاء».</Text>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* تعديل المواعيد */}
      <Modal visible={!!sched} transparent animationType="slide" onRequestClose={() => setSched(null)}>
        <View style={st.overlay}>
          {sched && (
            <ScrollView style={st.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
              <Text style={st.sheetT}>مواعيد الانتخاب</Text>
              <Schedule v={sched} set={(x) => setSched({ ...sched, ...x })} />
              <Text style={st.meta}>يُسجَّل كل تعديل في السجل العلني. تُجمَّد المواعيد عند بدء التصويت.</Text>
              <View style={[st.rowR, { gap: 10 }]}>
                <TouchableOpacity style={[st.primary, { flex: 2 }]} onPress={async () => {
                  const e = list.find((x) => x.id === sched.eid); if (!e) return;
                  await act(e, "schedule", { nominations_start: sched.ns.toISOString(), nominations_end: sched.ne.toISOString(), voting_start: sched.vs.toISOString(), voting_end: sched.ve.toISOString() });
                  setSched(null);
                }}><Text style={st.primaryT}>حفظ المواعيد</Text></TouchableOpacity>
                <TouchableOpacity style={[st.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => setSched(null)}><Text style={st.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* رفض مرشح بسبب علني */}
      <Modal visible={!!reject} transparent animationType="fade" onRequestClose={() => setReject(null)}>
        <View style={[st.overlay, { justifyContent: "center", padding: 18 }]}>
          {reject && (
            <View style={[st.sheet, { borderRadius: 18, gap: 10 }]}>
              <Text style={st.sheetT}>سبب رفض الترشح</Text>
              <Text style={st.meta}>يظهر السبب للمرشح وفي السجل العلني.</Text>
              <TextInput style={[st.input, { minHeight: 70, textAlignVertical: "top" }]} multiline value={reject.reason} onChangeText={(v) => setReject({ ...reject, reason: v })} placeholder="مثال: لا يستوفي شرط سنة العضوية" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <View style={[st.rowR, { gap: 10 }]}>
                <TouchableOpacity style={[st.primary, { flex: 2, backgroundColor: RED }]} onPress={() => setCand(reject.eid, reject.cid, "rejected", reject.reason)}><Text style={st.primaryT}>رفض الترشح</Text></TouchableOpacity>
                <TouchableOpacity style={[st.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => setReject(null)}><Text style={st.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* إضافة مرشح برقم العضوية */}
      <Modal visible={!!addC} transparent animationType="fade" onRequestClose={() => setAddC(null)}>
        <View style={[st.overlay, { justifyContent: "center", padding: 18 }]}>
          {addC && (
            <View style={[st.sheet, { borderRadius: 18, gap: 10 }]}>
              <Text style={st.sheetT}>إضافة مرشح</Text>
              <TextInput style={st.input} value={addC.member_no} onChangeText={(v) => setAddC({ ...addC, member_no: v })} placeholder="رقم العضوية، مثل HSW-SU-2026-0001" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" textAlign="right" />
              <View style={st.wrap}>
                {(list.find((x) => x.id === addC.eid)?.positions || []).map((p) => (
                  <TouchableOpacity key={p.id} onPress={() => setAddC({ ...addC, position_id: p.id })} style={[st.chip, addC.position_id === p.id && st.chipOn]}>
                    <Text style={[st.chipT, addC.position_id === p.id && { color: UC2 }]}>{p.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[st.rowR, { gap: 10 }]}>
                <TouchableOpacity style={[st.primary, { flex: 2 }]} onPress={addCandidate}><Text style={st.primaryT}>إضافة</Text></TouchableOpacity>
                <TouchableOpacity style={[st.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => setAddC(null)}><Text style={st.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

function Schedule({ v, set }: { v: { ns: Date; ne: Date; vs: Date; ve: Date }; set: (x: Partial<{ ns: Date; ne: Date; vs: Date; ve: Date }>) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.label}>المواعيد</Text>
      <DateTimeField label="يفتح باب الترشح" value={v.ns} onChange={(d) => set({ ns: d })} />
      <DateTimeField label="يُغلق باب الترشح" value={v.ne} onChange={(d) => set({ ne: d })} minDate={v.ns} />
      <DateTimeField label="يبدأ التصويت" value={v.vs} onChange={(d) => set({ vs: d })} minDate={v.ne} />
      <DateTimeField label="ينتهي التصويت" value={v.ve} onChange={(d) => set({ ve: d })} minDate={v.vs}
        presets={[6, 8, 10, 12].map((h) => ({ label: `بعد ${h} ساعات من البدء`, get: () => addH(h, v.vs) }))} />
    </View>
  );
}

function Btn({ icon, label, onPress, color = UC2 }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.ghost, { borderColor: color + "60" }]}>
      <Ionicons name={icon as any} size={15} color={color} /><Text style={[st.ghostT, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  statsRow: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, paddingVertical: 10, alignItems: "center" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 20, color: UC2 },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyT: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: "hidden" },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: Colors.bg },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: UC + "25" },
  tagT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: UC2 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.text, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  ghost: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  ghostT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.text },
  fab: { position: "absolute", bottom: 16, left: 16, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 30, backgroundColor: UC },
  fabT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: "92%", width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  chipOn: { backgroundColor: UC + "30", borderColor: UC },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textMuted },
  primary: { backgroundColor: UC, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  note: { flexDirection: "row-reverse", gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: GREEN + "40" },
  noteT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.text, textAlign: "right", lineHeight: 20 },
  barBg: { height: 7, borderRadius: 4, backgroundColor: Colors.borderSubtle, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  box: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 10, gap: 8 },
  boxT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  cand: { flexDirection: "row-reverse", gap: 10, alignItems: "flex-start" },
  candImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardBg },
  candN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  prog: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: UC2 },
});
