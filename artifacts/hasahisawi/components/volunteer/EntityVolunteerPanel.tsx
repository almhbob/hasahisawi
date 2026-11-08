// مهام التطوع للجهات (المنظمات واتحاد الطلاب): نقاط حسب حجم المهمة، سقف شهري، واعتماد الإدارة للكبرى
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, RefreshControl, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { notify, confirmAction } from "@/lib/xplatform";
import { DateInput } from "@/components/ui/DateTimeField";

const GOLD = "#E8A900";
type Size = "small" | "medium" | "large" | "major";
type SizeDef = { label: string; hint: string; min: number; max: number; def: number; approval?: boolean };
type VTask = {
  id: number; title: string; description: string | null; category: string; location: string | null; starts_at: string | null;
  points: number; size: Size | null; size_label: string | null; slots: number | null; status: "open" | "closed" | "done";
  approval: "approved" | "pending" | "rejected"; review_note: string | null; archived_at: string | null;
  joined_count: number; completed_count: number; awarded: number;
};
type Signup = { id: number; user_id: number; name: string; phone?: string; avatar_url?: string | null; status: string; points_awarded: number; hours: number | null };
const CATS: [string, string][] = [["social", "اجتماعي"], ["environment", "بيئة"], ["health", "صحة"], ["education", "تعليم"], ["events", "فعاليات"], ["relief", "إغاثة"], ["other", "أخرى"]];
const SIZE_ICON: Record<Size, string> = { small: "leaf-outline", medium: "people-outline", large: "flag-outline", major: "trophy-outline" };

async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `خطأ (${r.status})`);
  return j as T;
}

export default function EntityVolunteerPanel({ token, base, color = "#00966A", title = "مهام التطوع" }: { token: string; base: string; color?: string; title?: string }) {
  const [scope, setScope] = useState<"" | "archive">("");
  const [data, setData] = useState<{ tasks: VTask[]; budget: { cap: number; used: number; left: number }; sizes: Record<Size, SizeDef> } | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState<VTask | null>(null);

  const load = useCallback(async () => {
    try { setErr(""); setData(await api(token, `${base}/tasks${scope ? "?scope=archive" : ""}`)); } catch (e: any) { setErr(e.message); }
  }, [token, base, scope]);
  useEffect(() => { load(); }, [load]);

  const act = async (t: VTask, body: any, msg?: string) => {
    try { await api(token, `${base}/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify(body) }); if (msg) notify(msg); load(); } catch (e: any) { notify("تعذّر", e.message); }
  };
  const b = data?.budget;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={color} />}>
      <View style={st.head}>
        <Text style={st.h1}>{title}</Text>
        <Pressable onPress={() => setForm(true)} style={[st.add, { backgroundColor: color }]}><Ionicons name="add" size={18} color="#fff" /><Text style={st.addT}>مهمة جديدة</Text></Pressable>
      </View>

      {b ? (
        <View style={st.budget}>
          <View style={st.row}>
            <Ionicons name="star" size={16} color="#7A5900" />
            <Text style={st.budgetT}>نقاط هذا الشهر: {b.used} من {b.cap}</Text>
            <Text style={st.budgetLeft}>المتبقي {b.left}</Text>
          </View>
          <View style={st.bar}><View style={[st.barFill, { width: `${b.cap ? Math.min(100, (b.used / b.cap) * 100) : 0}%` }]} /></View>
          <Text style={st.fine}>النقاط تُحدَّد بحجم المهمة، والمهام الكبرى تعتمدها إدارة التطبيق قبل النشر. منح النقاط اليدوية وسحبها للإدارة فقط.</Text>
        </View>
      ) : null}

      <View style={st.seg}>
        {([["", "النشطة"], ["archive", "الأرشيف"]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setScope(k)} style={[st.segBtn, scope === k && { backgroundColor: color }]}><Text style={[st.segT, scope === k && { color: "#fff" }]}>{l}</Text></Pressable>
        ))}
      </View>

      {err ? <Text style={st.muted}>{err}</Text> : !data ? <ActivityIndicator color={color} style={{ marginTop: 20 }} /> : !data.tasks.length ? (
        <View style={st.empty}><Ionicons name="hand-left-outline" size={34} color={color} /><Text style={st.muted}>{scope ? "لا شيء في الأرشيف بعد" : "أضف أول مهمة تطوعية — يراها كل متطوعي المدينة ويكسبون عليها نقاطاً."}</Text></View>
      ) : data.tasks.map((t) => {
        const pill = t.approval === "pending" ? ["بانتظار اعتماد الإدارة", GOLD] : t.approval === "rejected" ? ["مرفوضة", "#C62828"] : t.status === "open" ? ["مفتوحة للتسجيل", color] : t.status === "done" ? ["منجزة", "#3B5BA9"] : ["مغلقة", "#6B7B74"];
        return (
          <Pressable key={t.id} onPress={() => setOpen(t)} style={st.card}>
            <View style={st.row}>
              <View style={[st.sizeIcon, { backgroundColor: color + "18" }]}><Ionicons name={(SIZE_ICON[t.size || "small"]) as any} size={18} color={color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.cardT} numberOfLines={2}>{t.title}</Text>
                <Text style={st.muted}>{t.size_label ? `مهمة ${t.size_label}` : ""}{t.starts_at ? ` · ${new Date(t.starts_at).toLocaleDateString("ar-EG")}` : ""}{t.location ? ` · ${t.location}` : ""}</Text>
              </View>
              <View style={st.pts}><Text style={st.ptsN}>{t.points}</Text><Text style={st.ptsL}>نقطة</Text></View>
            </View>
            <View style={st.row}>
              <View style={[st.pill, { backgroundColor: (pill[1] as string) + "1F" }]}><Text style={[st.pillT, { color: pill[1] as string }]}>{pill[0]}</Text></View>
              <Text style={[st.muted, { flex: 1 }]}>المسجّلون {t.joined_count}{t.slots ? `/${t.slots}` : ""} · أنجزوا {t.completed_count} · مُنح {t.awarded} نقطة</Text>
            </View>
            {t.approval === "rejected" && t.review_note ? <Text style={[st.muted, { color: "#C62828" }]}>سبب الرفض: {t.review_note}</Text> : null}
            <View style={st.actions}>
              {t.approval === "approved" && !t.archived_at ? (
                t.status === "open"
                  ? <Mini icon="lock-closed-outline" label="إغلاق التسجيل" onPress={() => act(t, { status: "closed" })} />
                  : t.status === "closed" ? <Mini icon="lock-open-outline" label="فتح التسجيل" onPress={() => act(t, { status: "open" })} /> : null
              ) : null}
              {t.approval === "approved" && t.status !== "done" && !t.archived_at ? <Mini icon="checkmark-done-outline" label="إنهاء المهمة" onPress={() => act(t, { status: "done" }, "انتقلت للأرشيف")} /> : null}
              {t.archived_at ? <Mini icon="refresh" label="استعادة" onPress={() => act(t, { action: "restore" })} />
                : <Mini icon="archive-outline" label="أرشفة" onPress={async () => { if (await confirmAction("أرشفة المهمة", "تُغلق المهمة وتنتقل للأرشيف مع حفظ سجلها ونقاطها.", "أرشفة")) act(t, { action: "archive" }); }} />}
            </View>
          </Pressable>
        );
      })}

      {form && data ? <TaskForm token={token} base={base} color={color} sizes={data.sizes} onClose={() => setForm(false)} onSaved={(m) => { setForm(false); notify("تم ✅", m); load(); }} /> : null}
      {open ? <SignupsSheet token={token} base={base} color={color} task={open} onClose={() => { setOpen(null); load(); }} /> : null}
    </ScrollView>
  );
}

function Mini({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={st.mini}><Ionicons name={icon} size={14} color={Colors.textSecondary} /><Text style={st.miniT}>{label}</Text></Pressable>;
}

function TaskForm({ token, base, color, sizes, onClose, onSaved }: { token: string; base: string; color: string; sizes: Record<Size, SizeDef>; onClose: () => void; onSaved: (msg: string) => void }) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState({ title: "", description: "", category: "social", location: "", starts_at: "", slots: "", size: "small" as Size, points: sizes.small.def });
  const [busy, setBusy] = useState(false);
  const S = sizes[f.size];
  const pick = (k: Size) => setF((x) => ({ ...x, size: k, points: sizes[k].def }));
  const step = (d: number) => setF((x) => ({ ...x, points: Math.max(S.min, Math.min(S.max, x.points + d)) }));
  const save = async () => {
    if (f.title.trim().length < 3) return notify("عنوان المهمة", "اكتب عنواناً واضحاً");
    setBusy(true);
    try {
      const r = await api(token, `${base}/tasks`, { method: "POST", body: JSON.stringify({ ...f, slots: f.slots ? Number(f.slots) : null, starts_at: f.starts_at || null }) });
      onSaved(r.message || "نُشرت المهمة");
    } catch (e: any) { notify("تعذّر", e.message); } finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={st.sheetT}>مهمة تطوعية جديدة</Text>
          <ScrollView contentContainerStyle={{ gap: 12, paddingTop: 6 }} keyboardShouldPersistTaps="handled">
            <TextInput value={f.title} onChangeText={(v) => setF({ ...f, title: v })} placeholder="عنوان المهمة (مثال: تنظيف سوق المدينة)" placeholderTextColor={Colors.textMuted} style={st.input} maxLength={160} />
            <Text style={st.lbl}>حجم المهمة — يحدد نطاق النقاط</Text>
            <View style={st.sizes}>
              {(Object.keys(sizes) as Size[]).map((k) => {
                const on = f.size === k; const d = sizes[k];
                return (
                  <Pressable key={k} onPress={() => pick(k)} style={[st.size, on && { borderColor: color, backgroundColor: color + "12" }]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Ionicons name={SIZE_ICON[k] as any} size={18} color={on ? color : Colors.textMuted} />
                    <Text style={[st.sizeT, on && { color }]}>{d.label}</Text>
                    <Text style={st.sizeR}>{d.min}–{d.max}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={st.hint}>{S.hint}{S.approval ? " · تُرسل لاعتماد إدارة التطبيق قبل النشر" : ""}</Text>
            <View style={st.pointsRow}>
              <Pressable onPress={() => step(-5)} style={st.stepBtn} accessibilityLabel="تقليل النقاط"><Ionicons name="remove" size={18} color={color} /></Pressable>
              <View style={{ alignItems: "center", flex: 1 }}><Text style={[st.pointsN, { color }]}>{f.points}</Text><Text style={st.muted}>نقطة لكل متطوع</Text></View>
              <Pressable onPress={() => step(5)} style={st.stepBtn} accessibilityLabel="زيادة النقاط"><Ionicons name="add" size={18} color={color} /></Pressable>
            </View>
            <TextInput value={f.description} onChangeText={(v) => setF({ ...f, description: v })} placeholder="التفاصيل: المطلوب من المتطوع، الأدوات، طريقة التواصل" placeholderTextColor={Colors.textMuted} style={[st.input, { minHeight: 80, textAlignVertical: "top" }]} multiline />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: "row-reverse" }}>
              {CATS.map(([k, l]) => <Pressable key={k} onPress={() => setF({ ...f, category: k })} style={[st.chip, f.category === k && { backgroundColor: color, borderColor: color }]}><Text style={[st.chipT, f.category === k && { color: "#fff" }]}>{l}</Text></Pressable>)}
            </ScrollView>
            <TextInput value={f.location} onChangeText={(v) => setF({ ...f, location: v })} placeholder="المكان (اختياري)" placeholderTextColor={Colors.textMuted} style={st.input} />
            <DateInput label="التاريخ (اختياري)" value={f.starts_at} onChange={(v) => setF({ ...f, starts_at: v })} minDate={new Date()} />
            <TextInput value={f.slots} onChangeText={(v) => setF({ ...f, slots: v.replace(/\D/g, "") })} placeholder="عدد المتطوعين المطلوب (اختياري)" placeholderTextColor={Colors.textMuted} keyboardType="number-pad" style={st.input} />
            <Pressable onPress={save} disabled={busy} style={[st.primary, { backgroundColor: color }, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryT}>{S.approval ? "إرسال للاعتماد" : "نشر المهمة"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SignupsSheet({ token, base, color, task, onClose }: { token: string; base: string; color: string; task: VTask; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Signup[] | null>(null);
  const [pts, setPts] = useState<Record<number, string>>({});
  const load = useCallback(async () => { try { setList((await api(token, `${base}/tasks/${task.id}/signups`)).signups); } catch (e: any) { notify("تعذّر", e.message); setList([]); } }, [token, base, task.id]);
  useEffect(() => { load(); }, [load]);
  const review = async (s: Signup, action: "complete" | "reject") => {
    try {
      const r = await api(token, `${base}/signups/${s.id}/review`, { method: "POST", body: JSON.stringify({ action, points: pts[s.id] ? Number(pts[s.id]) : undefined }) });
      if (action === "complete") notify("اعتُمد الإنجاز ✅", `${r.points ?? task.points} نقطة لـ ${s.name}`);
      load();
    } catch (e: any) { notify("تعذّر", e.message); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={st.sheetT}>{task.title}</Text>
          <Text style={st.muted}>اعتمد إنجاز المتطوعين بعد التنفيذ — حتى {task.points} نقطة لكل متطوع.</Text>
          <ScrollView contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
            {list === null ? <ActivityIndicator color={color} /> : !list.length ? <Text style={[st.muted, { textAlign: "center", padding: 20 }]}>لم يسجّل أحد بعد</Text> : list.map((s) => (
              <View key={s.id} style={st.signup}>
                {s.avatar_url ? <Image source={{ uri: s.avatar_url }} style={st.av} /> : <View style={[st.av, { alignItems: "center", justifyContent: "center", backgroundColor: color + "18" }]}><Ionicons name="person" size={16} color={color} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={st.cardT}>{s.name}</Text>
                  <Text style={st.muted}>{s.status === "completed" ? `✅ أنجز · ${s.points_awarded} نقطة` : s.status === "rejected" ? "لم يُعتمد" : "مسجّل"}</Text>
                </View>
                {s.status === "joined" ? (
                  <>
                    <TextInput value={pts[s.id] ?? ""} onChangeText={(v) => setPts({ ...pts, [s.id]: v.replace(/\D/g, "") })} placeholder={String(task.points)} placeholderTextColor={Colors.textMuted} keyboardType="number-pad" style={st.ptsIn} accessibilityLabel="النقاط" />
                    <Pressable onPress={() => review(s, "complete")} style={[st.okBtn, { backgroundColor: color }]}><Ionicons name="checkmark" size={16} color="#fff" /></Pressable>
                    <Pressable onPress={() => review(s, "reject")} style={st.noBtn}><Ionicons name="close" size={16} color="#C62828" /></Pressable>
                  </>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  h1: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  add: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  addT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  fine: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "#8A7740", textAlign: "right", lineHeight: 18 },
  budget: { backgroundColor: "#FFFBEF", borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: GOLD + "60" },
  budgetT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#3D2C00", textAlign: "right" },
  budgetLeft: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#7A5900" },
  bar: { height: 7, borderRadius: 4, backgroundColor: GOLD + "30", overflow: "hidden", transform: [{ scaleX: -1 }] },
  barFill: { height: 7, borderRadius: 4, backgroundColor: GOLD },
  seg: { flexDirection: "row-reverse", gap: 6, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  empty: { alignItems: "center", gap: 8, padding: 24, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 12, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  sizeIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  pts: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: GOLD + "26" },
  ptsN: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#7A5900" },
  ptsL: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#7A5900", marginTop: -4 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  mini: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.bg },
  miniT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textSecondary },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { maxHeight: "92%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 6 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  hint: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#7A5900", textAlign: "right" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 11 },
  sizes: { flexDirection: "row-reverse", gap: 6 },
  size: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  sizeT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  sizeR: { fontFamily: "Cairo_500Medium", fontSize: 10.5, color: Colors.textMuted },
  pointsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: Colors.divider },
  stepBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  pointsN: { fontFamily: "Cairo_700Bold", fontSize: 26 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  chipT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  primary: { borderRadius: 16, paddingVertical: 14, alignItems: "center", marginBottom: 6 },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  signup: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: Colors.divider },
  av: { width: 38, height: 38, borderRadius: 19 },
  ptsIn: { width: 54, fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center", color: Colors.textPrimary, backgroundColor: Colors.bg, borderRadius: 10, paddingVertical: 7 },
  okBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  noBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#C628281A" },
});
