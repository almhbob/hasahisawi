// بوابة إدارة الاتحاد — «المهام»: الرئاسة تُسند وتتابع، وكل موظف يدير مهامه
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { DateInput } from "@/components/ui/DateTimeField";

const UC = "#1F5C8A";
const UC2 = "#9DBBD6";
const RED = "#D93636";

async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `خطأ (${r.status})`);
  return j as T;
}

type TStatus = "todo" | "in_progress" | "review" | "done" | "blocked";
type Priority = "low" | "normal" | "high" | "urgent";
type Task = {
  id: number; title: string; description: string | null; assignee_staff_id: number; assignee_name: string | null; assignee_role: string | null;
  created_by_name: string | null; priority: Priority; status: TStatus; status_label: string; progress: number; due_date: string | null;
  overdue: boolean; comments: number; created_at: string; updated_at: string; completed_at: string | null;
};
type StaffLoad = { id: number; full_name: string; role: string; committee: string | null; open: number; done: number; overdue: number };
type Comment = { id: number; author_name: string; body: string; kind: "comment" | "event"; created_at: string };

const STATUS: Record<TStatus, { label: string; color: string; icon: any }> = {
  todo: { label: "جديدة", color: "#9DBBD6", icon: "ellipse-outline" },
  in_progress: { label: "قيد التنفيذ", color: "#E8A900", icon: "play-circle-outline" },
  review: { label: "بانتظار المراجعة", color: "#A78BFA", icon: "eye-outline" },
  done: { label: "مكتملة", color: "#22C55E", icon: "checkmark-circle" },
  blocked: { label: "متعثرة", color: RED, icon: "alert-circle-outline" },
};
const PRIORITY: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "عاجلة", color: RED }, high: { label: "مهمة", color: "#F97316" },
  normal: { label: "عادية", color: UC2 }, low: { label: "منخفضة", color: Colors.textMuted },
};
const fmtDay = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) : "");
const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  return m < 1 ? "الآن" : m < 60 ? `قبل ${m} د` : m < 1440 ? `قبل ${Math.round(m / 60)} س` : fmtDay(s);
};
const emptyTask = () => ({ title: "", description: "", assignee_staff_id: 0, priority: "normal" as Priority, due_date: "" });

/** base: مسار المهام (اتحاد الطلاب افتراضياً، أو ‎/org-workspace/ID لمساحة منظمة) */
export function TasksTab({ token, onOpenCount, base = "/union-manager" }: { token: string; onOpenCount?: (n: number) => void; base?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffLoad[]>([]);
  const [summary, setSummary] = useState({ open: 0, done: 0, overdue: 0, review: 0, due_today: 0 });
  const [lead, setLead] = useState(false);
  const [filter, setFilter] = useState<"open" | "review" | "done" | "all">("open");
  const [staffFilter, setStaffFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ReturnType<typeof emptyTask> | null>(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (filter !== "all") q.set("status", filter);
      if (staffFilter) q.set("staff", String(staffFilter));
      const d = await api(token, `${base}/tasks?${q}`);
      setTasks(d.tasks || []); setStaff(d.staff || []); setLead(!!d.lead);
      if (d.summary) { setSummary(d.summary); onOpenCount?.(d.summary.open); }
    } catch (e: any) { notify("تنبيه", e.message); } finally { setLoading(false); }
  }, [token, filter, staffFilter, base]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form) return;
    if (form.title.trim().length < 3) return notify("عنوان المهمة", "اكتب عنواناً واضحاً للمهمة.");
    if (!form.assignee_staff_id) return notify("الموظف", "اختر الموظف المسؤول عن المهمة.");
    setSaving(true);
    try {
      await api(token, `${base}/tasks`, { method: "POST", body: JSON.stringify({ ...form, due_date: form.due_date || null }) });
      setForm(null); load(); notify("تم الإسناد ✓", "وصل إشعار للموظف بالمهمة.");
    } catch (e: any) { notify("تنبيه", e.message); } finally { setSaving(false); }
  };

  const cards = [
    { n: summary.open, l: "مفتوحة", c: UC2, f: "open" as const },
    { n: summary.due_today, l: "تسليم اليوم", c: "#E8A900", f: "open" as const },
    { n: summary.overdue, l: "متأخرة", c: RED, f: "open" as const },
    { n: summary.review, l: "للمراجعة", c: "#A78BFA", f: "review" as const },
    { n: summary.done, l: "مكتملة", c: "#22C55E", f: "done" as const },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={UC} />}>
        <Text style={t.h1}>{lead ? (base.startsWith("/org-workspace") ? "مهام فريق المنظمة" : "مهام فريق الاتحاد") : "مهامي"}</Text>
        <View style={t.sumRow}>
          {cards.map((c) => (
            <TouchableOpacity key={c.l} style={t.sum} onPress={() => { setLoading(true); setFilter(c.f); }} accessibilityLabel={`${c.n} ${c.l}`}>
              <Text style={[t.sumN, { color: c.n ? c.c : Colors.textMuted }]}>{c.n}</Text>
              <Text style={t.sumL}>{c.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {lead && staff.length > 0 && (
          <>
            <Text style={t.h2}>عبء العمل على الفريق</Text>
            <RtlScrollRow contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              <TouchableOpacity onPress={() => { setLoading(true); setStaffFilter(null); }} style={[t.staffChip, !staffFilter && t.staffChipOn]}>
                <Text style={[t.staffName, !staffFilter && { color: UC2 }]}>الكل</Text>
              </TouchableOpacity>
              {staff.map((s) => (
                <TouchableOpacity key={s.id} onPress={() => { setLoading(true); setStaffFilter(staffFilter === s.id ? null : s.id); }} style={[t.staffChip, staffFilter === s.id && t.staffChipOn]}>
                  <Text style={[t.staffName, staffFilter === s.id && { color: UC2 }]} numberOfLines={1}>{s.full_name}</Text>
                  <Text style={t.staffMeta}>{s.open} مفتوحة{s.overdue ? ` · ${s.overdue} متأخرة` : ""}</Text>
                </TouchableOpacity>
              ))}
            </RtlScrollRow>
          </>
        )}

        <View style={t.filters}>
          {([["open", "المفتوحة"], ["review", "للمراجعة"], ["done", "المكتملة"], ["all", "الكل"]] as const).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => { setLoading(true); setFilter(k); }} style={[t.fChip, filter === k && t.fChipOn]} accessibilityRole="tab" accessibilityState={{ selected: filter === k }}>
              <Text style={[t.fChipT, filter === k && { color: "#fff" }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color={UC} style={{ marginTop: 30 }} /> : tasks.length === 0 ? (
          <View style={t.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.textMuted} />
            <Text style={t.emptyT}>{filter === "open" ? (lead ? "لا مهام مفتوحة. أسند مهمة لأحد أعضاء الفريق." : "لا مهام مفتوحة لديك الآن.") : "لا توجد مهام هنا."}</Text>
          </View>
        ) : tasks.map((x) => <TaskCard key={x.id} task={x} lead={lead} onPress={() => setOpenId(x.id)} />)}
      </ScrollView>

      {lead && (
        <TouchableOpacity style={t.fab} onPress={() => setForm({ ...emptyTask(), assignee_staff_id: staffFilter || 0 })}>
          <Ionicons name="add-circle" size={20} color="#fff" /><Text style={t.fabT}>إسناد مهمة</Text>
        </TouchableOpacity>
      )}

      <Modal visible={!!form} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <KeyboardAvoidingView style={t.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {form && (
            <ScrollView style={t.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={t.sheetT}>إسناد مهمة جديدة</Text>
              <Text style={t.label}>المهمة *</Text>
              <TextInput style={t.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="مثال: تجهيز قاعة ندوة الخميس" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={t.label}>التفاصيل</Text>
              <TextInput style={[t.input, { minHeight: 80, textAlignVertical: "top" }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="المطلوب بالتحديد وما يُعدّ إنجازاً للمهمة" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={t.label}>الموظف المسؤول *</Text>
              <View style={t.wrap}>
                {staff.map((s) => (
                  <TouchableOpacity key={s.id} onPress={() => setForm({ ...form, assignee_staff_id: s.id })} style={[t.chip, form.assignee_staff_id === s.id && t.chipOn]}>
                    <Text style={[t.chipT, form.assignee_staff_id === s.id && { color: UC2 }]}>{s.full_name} · {s.role}</Text>
                  </TouchableOpacity>
                ))}
                {staff.length === 0 && <Text style={t.meta}>{base.startsWith("/org-workspace") ? "أضف أعضاء من تبويب «الفريق» أولاً." : "أضف موظفين من تبويب «الموظفون» أولاً."}</Text>}
              </View>
              <Text style={t.label}>الأولوية</Text>
              <View style={t.wrap}>
                {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                  <TouchableOpacity key={p} onPress={() => setForm({ ...form, priority: p })} style={[t.chip, form.priority === p && { borderColor: PRIORITY[p].color, backgroundColor: PRIORITY[p].color + "22" }]}>
                    <Text style={[t.chipT, form.priority === p && { color: PRIORITY[p].color }]}>{PRIORITY[p].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <DateInput label="موعد التسليم" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} minDate={new Date()} />
              <View style={[t.rowR, { gap: 10, marginTop: 6 }]}>
                <TouchableOpacity style={[t.primary, { flex: 2 }, saving && { opacity: 0.6 }]} onPress={create} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={t.primaryT}>إسناد وإشعار الموظف</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[t.ghost, { flex: 1, justifyContent: "center" }]} onPress={() => setForm(null)}><Text style={t.ghostT}>إلغاء</Text></TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {openId != null && <TaskDetail token={token} base={base} id={openId} staff={staff} onClose={() => setOpenId(null)} onChanged={load} />}
    </View>
  );
}

function TaskCard({ task: x, lead, onPress }: { task: Task; lead: boolean; onPress: () => void }) {
  const s = STATUS[x.status]; const p = PRIORITY[x.priority];
  return (
    <TouchableOpacity style={[t.card, { borderRightColor: p.color }]} onPress={onPress} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={`${x.title}، ${s.label}، أولوية ${p.label}${x.due_date ? `، التسليم ${fmtDay(x.due_date)}` : ""}`}>
      <View style={t.rowR}>
        <View style={[t.pill, { backgroundColor: s.color + "22" }]}>
          <Ionicons name={s.icon} size={13} color={s.color} /><Text style={[t.pillT, { color: s.color }]}>{s.label}</Text>
        </View>
        {x.priority !== "normal" && <Text style={[t.prio, { color: p.color }]}>{p.label}</Text>}
      </View>
      <Text style={t.title}>{x.title}</Text>
      <View style={t.rowR}>
        <Text style={t.meta} numberOfLines={1}>{lead ? `${x.assignee_name ?? ""}${x.assignee_role ? ` · ${x.assignee_role}` : ""}` : x.created_by_name ? `من ${x.created_by_name}` : ""}</Text>
        {x.due_date ? (
          <Text style={[t.meta, x.overdue && { color: RED, fontFamily: "Cairo_700Bold" }]}>
            <Ionicons name={x.overdue ? "alarm" : "calendar-outline"} size={12} /> {x.overdue ? "متأخرة · " : ""}{fmtDay(x.due_date)}
          </Text>
        ) : null}
      </View>
      <View style={[t.rowR, { gap: 10 }]}>
        <View style={[t.barBg, { flex: 1 }]}><View style={[t.barFill, { width: `${x.progress}%`, backgroundColor: x.status === "done" ? "#22C55E" : UC }]} /></View>
        <Text style={t.meta}>{x.progress}%</Text>
        {x.comments > 0 && <Text style={t.meta}><Ionicons name="chatbubble-outline" size={12} /> {x.comments}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function TaskDetail({ token, base, id, staff, onClose, onChanged }: { token: string; base: string; id: number; staff: StaffLoad[]; onClose: () => void; onChanged: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [lead, setLead] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api(token, `${base}/tasks/${id}`); setTask(d.task); setComments(d.comments || []); setLead(!!d.lead); }
    catch (e: any) { notify("تنبيه", e.message); onClose(); }
  }, [token, id, base]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body: object) => {
    setBusy(true);
    try { const d = await api(token, `${base}/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }); setTask(d.task); await load(); onChanged(); }
    catch (e: any) { notify("تنبيه", e.message); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api(token, `${base}/tasks/${id}/comments`, { method: "POST", body: JSON.stringify({ body: text.trim() }) }); setText(""); await load(); onChanged(); }
    catch (e: any) { notify("تنبيه", e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!task || !(await confirmAction("حذف المهمة", `حذف «${task.title}» وسجلها نهائياً؟`, "حذف", true))) return;
    try { await api(token, `${base}/tasks/${id}`, { method: "DELETE" }); onChanged(); onClose(); } catch (e: any) { notify("تنبيه", e.message); }
  };

  const statuses: TStatus[] = useMemo(() => (lead ? ["todo", "in_progress", "review", "done", "blocked"] : ["in_progress", "blocked", "done"]), [lead]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={t.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[t.sheet, { paddingBottom: 10 }]}>
          {!task ? <ActivityIndicator color={UC} style={{ margin: 30 }} /> : (
            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
              <View style={t.rowR}>
                <TouchableOpacity onPress={onClose} accessibilityLabel="إغلاق"><Ionicons name="close" size={24} color={Colors.textMuted} /></TouchableOpacity>
                <Text style={[t.pillT, { color: PRIORITY[task.priority].color }]}>أولوية {PRIORITY[task.priority].label}</Text>
              </View>
              <Text style={[t.title, { fontSize: 18 }]}>{task.title}</Text>
              {task.description ? <Text style={t.body}>{task.description}</Text> : null}
              <View style={t.infoBox}>
                {[
                  ["person-outline", `المسؤول: ${task.assignee_name ?? "—"}`],
                  ["create-outline", `أسندها: ${task.created_by_name ?? "—"}`],
                  ["calendar-outline", task.due_date ? `التسليم: ${fmtDay(task.due_date)}${task.overdue ? " (متأخرة)" : ""}` : "بلا موعد تسليم"],
                ].map(([i, l]) => (
                  <View key={l} style={[t.rowR, { justifyContent: "flex-start", gap: 6 }]}><Ionicons name={i as any} size={14} color={UC2} /><Text style={t.meta}>{l}</Text></View>
                ))}
              </View>

              <Text style={t.label}>الحالة</Text>
              <View style={t.wrap}>
                {statuses.map((k) => {
                  const on = task.status === k || (k === "done" && !lead && task.status === "review");
                  return (
                    <TouchableOpacity key={k} disabled={busy || on} onPress={() => patch({ status: k })} style={[t.chip, on && { borderColor: STATUS[k].color, backgroundColor: STATUS[k].color + "22" }]}>
                      <Text style={[t.chipT, on && { color: STATUS[k].color }]}>{k === "done" && !lead ? "أنجزتها (للمراجعة)" : STATUS[k].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={t.label}>نسبة الإنجاز: {task.progress}%</Text>
              <View style={[t.barBg, { height: 10 }]}><View style={[t.barFill, { width: `${task.progress}%`, backgroundColor: task.status === "done" ? "#22C55E" : UC }]} /></View>
              <View style={t.wrap}>
                {[0, 25, 50, 75, 100].map((v) => (
                  <TouchableOpacity key={v} disabled={busy} onPress={() => patch({ progress: v, ...(v > 0 && task.status === "todo" ? { status: "in_progress" } : {}) })} style={[t.chip, task.progress === v && t.chipOn]}>
                    <Text style={[t.chipT, task.progress === v && { color: UC2 }]}>{v}%</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {lead && staff.length > 1 && (
                <>
                  <Text style={t.label}>إعادة الإسناد</Text>
                  <View style={t.wrap}>
                    {staff.map((s) => (
                      <TouchableOpacity key={s.id} disabled={busy || s.id === task.assignee_staff_id} onPress={() => patch({ assignee_staff_id: s.id })} style={[t.chip, s.id === task.assignee_staff_id && t.chipOn]}>
                        <Text style={[t.chipT, s.id === task.assignee_staff_id && { color: UC2 }]}>{s.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={t.label}>السجل والتعليقات</Text>
              {comments.map((c) => (
                <View key={c.id} style={c.kind === "event" ? t.event : t.comment}>
                  {c.kind === "event"
                    ? <Text style={t.eventT}>{c.author_name} {c.body} · {ago(c.created_at)}</Text>
                    : <>
                        <View style={t.rowR}><Text style={t.cAuthor}>{c.author_name}</Text><Text style={t.meta}>{ago(c.created_at)}</Text></View>
                        <Text style={t.body}>{c.body}</Text>
                      </>}
                </View>
              ))}
              <View style={[t.rowR, { gap: 8 }]}>
                <TextInput style={[t.input, { flex: 1 }]} value={text} onChangeText={setText} placeholder="اكتب تحديثاً أو استفساراً…" placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
                <TouchableOpacity style={[t.send, (!text.trim() || busy) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || busy} accessibilityLabel="إرسال التعليق">
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>
              {lead && (
                <TouchableOpacity style={[t.ghost, { borderColor: RED + "55", justifyContent: "center", marginTop: 4 }]} onPress={remove}>
                  <Ionicons name="trash-outline" size={15} color={RED} /><Text style={[t.ghostT, { color: RED }]}>حذف المهمة</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const t = StyleSheet.create({
  h1: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "right" },
  h2: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary, textAlign: "right" },
  rowR: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  sumRow: { flexDirection: "row-reverse", gap: 6 },
  sum: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, paddingVertical: 9, alignItems: "center" },
  sumN: { fontFamily: "Cairo_700Bold", fontSize: 19 },
  sumL: { fontFamily: "Cairo_500Medium", fontSize: 10.5, color: Colors.textMuted, textAlign: "center" },
  staffChip: { minWidth: 110, maxWidth: 170, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  staffChipOn: { borderColor: UC, backgroundColor: UC + "25" },
  staffName: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, textAlign: "right" },
  staffMeta: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  filters: { flexDirection: "row-reverse", gap: 6, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.borderSubtle },
  fChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  fChipOn: { backgroundColor: UC },
  fChipT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textMuted },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyT: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, borderRightWidth: 4, padding: 12, gap: 6 },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  prio: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  barBg: { height: 7, borderRadius: 4, backgroundColor: Colors.borderSubtle, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
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
  ghost: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  ghostT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.text },
  infoBox: { backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10, gap: 5, borderWidth: 1, borderColor: Colors.borderSubtle },
  event: { paddingVertical: 2 },
  eventT: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  comment: { backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10, gap: 2, borderWidth: 1, borderColor: Colors.borderSubtle },
  cAuthor: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: UC2 },
  send: { width: 44, height: 44, borderRadius: 12, backgroundColor: UC, alignItems: "center", justifyContent: "center" },
});
