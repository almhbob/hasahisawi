// إدارة المسابقات: إنشاء (برعاية جهة أو موسمية من قالب جاهز)، الأسئلة، المشاركات، وإعلان الفائزين.
// للأدمن ولمن مُنح صلاحية قسم «المسابقات».
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { contestsApi, OCCASION_THEME, type Contest, type Occasion } from "@/lib/contests";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { confirmAction, notify } from "@/lib/xplatform";

type QDraft = { question: string; options: string[]; correct_index: number };
type Draft = {
  kind: "sponsored" | "seasonal"; occasion: string | null; type: "quiz" | "entry";
  title: string; description: string; sponsor_name: string; prize: string; terms: string; entry_prompt: string;
  winners_count: string; starts_at: string; ends_at: string; questions: QDraft[];
};
type Entry = Awaited<ReturnType<typeof contestsApi.entries>>[number];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const newQ = (): QDraft => ({ question: "", options: ["", ""], correct_index: 0 });
const blank = (): Draft => {
  const now = new Date();
  return {
    kind: "sponsored", occasion: null, type: "quiz", title: "", description: "", sponsor_name: "", prize: "", terms: "",
    entry_prompt: "", winners_count: "1", starts_at: ymd(now), ends_at: ymd(new Date(now.getTime() + 7 * 86400_000)), questions: [newQ()],
  };
};

export default function ContestsAdmin() {
  const insets = useSafeAreaInsets();
  const { token, isLoading: authLoading } = useAuth();
  const [list, setList] = useState<Contest[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) { if (!authLoading) setLoading(false); return; }
    try {
      const [l, o] = await Promise.all([contestsApi.list(token), contestsApi.occasions()]);
      setList(l);
      setOccasions(o);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, authLoading]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const fromOccasion = (o: Occasion) => {
    const start = new Date(o.date);
    // نبدأ قبل المناسبة بثلاثة أيام ونستمر أسبوعاً بعدها (رمضان: الشهر كله)
    const begin = new Date(start.getTime() - 3 * 86400_000);
    const end = new Date(start.getTime() + (o.key === "ramadan" ? 30 : 7) * 86400_000);
    setDraft({ ...blank(), kind: "seasonal", occasion: o.key, title: o.title, description: o.description, starts_at: ymd(begin < new Date() ? new Date() : begin), ends_at: ymd(end) });
  };

  const save = async () => {
    if (!draft) return;
    const qs = draft.questions
      .map((q) => ({ ...q, question: q.question.trim(), options: q.options.map((o) => o.trim()) }))
      .filter((q) => q.question && q.options.filter(Boolean).length >= 2);
    if (draft.title.trim().length < 3) { notify("العنوان", "اكتب عنوان المسابقة."); return; }
    if (draft.type === "quiz" && !qs.length) { notify("الأسئلة", "أضف سؤالاً واحداً على الأقل بخيارين."); return; }
    setSaving(true);
    try {
      await contestsApi.create(token, {
        ...draft,
        winners_count: Number(draft.winners_count) || 1,
        starts_at: new Date(draft.starts_at + "T00:00:00").toISOString(),
        ends_at: new Date(draft.ends_at + "T23:59:00").toISOString(),
        questions: draft.type === "quiz" ? qs.map((q) => {
          // نحذف الخيارات الفارغة مع الحفاظ على موضع الإجابة الصحيحة
          const kept = q.options.map((o, i) => ({ o, i })).filter((x) => x.o);
          return { question: q.question, options: kept.map((x) => x.o), correct_index: Math.max(0, kept.findIndex((x) => x.i === q.correct_index)) };
        }) : [],
      });
      setDraft(null);
      load();
      notify("نُشرت المسابقة 🏆", "شاركها الآن على مواقع التواصل من صفحتها.");
    } catch (e: any) { notify("تعذّر النشر", e?.message); }
    finally { setSaving(false); }
  };

  const openEntries = async (c: Contest) => {
    if (openId === c.id) { setOpenId(null); return; }
    setOpenId(c.id); setEntries([]); setPicked([]);
    try { setEntries(await contestsApi.entries(token, c.id)); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  };

  const announce = async (c: Contest, auto: boolean) => {
    const ok = await confirmAction("إعلان الفائزين وإنهاء المسابقة؟",
      auto ? `يُختار ${c.winners_count} بأعلى الدرجات، ومن تعادلوا يُسحب بينهم عشوائياً.` : `${picked.length} فائز مختار.`, "إعلان");
    if (!ok) return;
    try {
      const r = await contestsApi.winners(token, c.id, auto ? { auto: true } : { entry_ids: picked });
      notify("أُعلن الفائزون", `${r.winners} فائز — وصلهم إشعار.`);
      setOpenId(null);
      load();
    } catch (e: any) { notify("تعذّر الإعلان", e?.message); }
  };

  const remove = async (c: Contest) => {
    if (!(await confirmAction("حذف المسابقة؟", `«${c.title}» وكل مشاركاتها.`, "حذف", true))) return;
    try { await contestsApi.remove(token, c.id); load(); } catch (e: any) { notify("تعذّر الحذف", e?.message); }
  };

  const setQ = (qi: number, patch: Partial<QDraft>) => setDraft((d) => d && { ...d, questions: d.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/contests" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>إدارة المسابقات</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {!draft ? (
            <>
              <TouchableOpacity style={s.btn} onPress={() => setDraft(blank())}>
                <Ionicons name="add" size={20} color={Colors.onColor} />
                <Text style={s.btnText}>مسابقة برعاية جهة</Text>
              </TouchableOpacity>
              <Text style={s.section}>أو ابدأ من قالب موسمي</Text>
              <RtlScrollRow contentContainerStyle={{ gap: 10 }}>
                {occasions.map((o) => {
                  const t = OCCASION_THEME[o.key];
                  return (
                    <TouchableOpacity key={o.key} style={[s.tpl, { backgroundColor: t?.grad[0] ?? Colors.primary }]} onPress={() => fromOccasion(o)}>
                      <Ionicons name={(t?.icon ?? "trophy") as any} size={18} color={t?.accent ?? "#fff"} />
                      <Text style={s.tplName}>{o.name}</Text>
                      <Text style={[s.tplDate, { color: t?.accent ?? "#fff" }]}>{o.date}</Text>
                    </TouchableOpacity>
                  );
                })}
              </RtlScrollRow>
            </>
          ) : (
            <View style={s.card}>
              <Text style={s.cardTitle}>{draft.kind === "seasonal" ? `مسابقة موسمية · ${occasions.find((o) => o.key === draft.occasion)?.name ?? ""}` : "مسابقة برعاية جهة"}</Text>
              <Seg value={draft.type} options={[["quiz", "أسئلة (تصحيح تلقائي)"], ["entry", "مشاركة نص/صورة"]]} onChange={(v) => setDraft({ ...draft, type: v as Draft["type"] })} />
              <Field label="العنوان" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
              <Field label="الوصف" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} multiline />
              {draft.kind === "sponsored" && <Field label="الجهة الراعية" value={draft.sponsor_name} onChange={(v) => setDraft({ ...draft, sponsor_name: v })} />}
              <Field label="الجائزة" value={draft.prize} onChange={(v) => setDraft({ ...draft, prize: v })} />
              <View style={s.row}>
                <View style={{ flex: 1 }}><Field label="يبدأ (YYYY-MM-DD)" value={draft.starts_at} onChange={(v) => setDraft({ ...draft, starts_at: v })} /></View>
                <View style={{ flex: 1 }}><Field label="ينتهي" value={draft.ends_at} onChange={(v) => setDraft({ ...draft, ends_at: v })} /></View>
                <View style={{ width: 80 }}><Field label="الفائزون" value={draft.winners_count} onChange={(v) => setDraft({ ...draft, winners_count: v.replace(/\D/g, "") })} numeric /></View>
              </View>
              {draft.type === "entry" && <Field label="المطلوب من المشارك" value={draft.entry_prompt} onChange={(v) => setDraft({ ...draft, entry_prompt: v })} />}
              <Field label="الشروط (اختياري)" value={draft.terms} onChange={(v) => setDraft({ ...draft, terms: v })} multiline />

              {draft.type === "quiz" && (
                <View style={{ gap: 10 }}>
                  <Text style={s.section}>الأسئلة — اضغط الدائرة لتحديد الإجابة الصحيحة</Text>
                  {draft.questions.map((q, qi) => (
                    <View key={qi} style={s.qBox}>
                      <View style={s.row}>
                        <View style={{ flex: 1 }}><Field label={`السؤال ${qi + 1}`} value={q.question} onChange={(v) => setQ(qi, { question: v })} /></View>
                        {draft.questions.length > 1 && (
                          <TouchableOpacity style={s.del} onPress={() => setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })} accessibilityLabel="حذف السؤال">
                            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {q.options.map((o, oi) => (
                        <View key={oi} style={s.optRow}>
                          <TouchableOpacity onPress={() => setQ(qi, { correct_index: oi })} accessibilityLabel="الإجابة الصحيحة" hitSlop={8}>
                            <Ionicons name={q.correct_index === oi ? "checkmark-circle" : "ellipse-outline"} size={24} color={q.correct_index === oi ? Colors.primary : Colors.textMuted} />
                          </TouchableOpacity>
                          <TextInput style={[s.input, { flex: 1 }]} value={o} placeholder={`الخيار ${oi + 1}`} placeholderTextColor={Colors.textMuted} textAlign="right"
                            onChangeText={(v) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? v : x)) })} />
                        </View>
                      ))}
                      {q.options.length < 6 && (
                        <TouchableOpacity onPress={() => setQ(qi, { options: [...q.options, ""] })}><Text style={s.link}>+ خيار</Text></TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity style={s.btnGhost} onPress={() => setDraft({ ...draft, questions: [...draft.questions, newQ()] })}>
                    <Text style={s.btnGhostText}>+ سؤال جديد</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.row}>
                <TouchableOpacity style={[s.btn, { flex: 1 }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color={Colors.onColor} /> : <Text style={s.btnText}>نشر المسابقة</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={() => setDraft(null)}><Text style={s.btnGhostText}>إلغاء</Text></TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={s.section}>المسابقات</Text>
          {list.length === 0 && <Text style={s.muted}>لا توجد مسابقات بعد.</Text>}
          {list.map((c) => (
            <View key={c.id} style={s.card}>
              <View style={s.row}>
                <Text style={[s.cardTitle, { flex: 1 }]} numberOfLines={2}>{c.title}</Text>
                <Text style={[s.status, c.state === "active" && s.statusOn]}>{c.state === "active" ? "جارية" : c.state === "upcoming" ? "قادمة" : "منتهية"}</Text>
              </View>
              <Text style={s.muted}>{c.type === "quiz" ? "أسئلة" : "مشاركات"} · {c.entries_count} مشارك · {c.shares} مشاركة على التواصل</Text>
              <View style={s.actions}>
                <Small icon="eye-outline" label="الصفحة" onPress={() => router.push({ pathname: "/contest" as any, params: { id: String(c.id) } })} />
                <Small icon="people-outline" label={openId === c.id ? "إخفاء المشاركات" : "المشاركات والفائزون"} onPress={() => openEntries(c)} />
                <Small icon="trash-outline" label="حذف" danger onPress={() => remove(c)} />
              </View>
              {openId === c.id && (
                <View style={{ gap: 8 }}>
                  {entries.length === 0 ? <Text style={s.muted}>لا توجد مشاركات بعد.</Text> : entries.map((e) => {
                    const on = picked.includes(e.id);
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[s.entry, (on || e.is_winner) && { borderColor: Colors.primary, backgroundColor: Colors.primarySoft }]}
                        onPress={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : p.length < c.winners_count ? [...p, e.id] : p))}
                      >
                        <Ionicons name={e.is_winner ? "trophy" : on ? "checkbox" : "square-outline"} size={20} color={e.is_winner ? "#B8892B" : Colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.name}>{e.name}{c.type === "quiz" ? ` · ${e.score} درجة` : ""}</Text>
                          {e.content ? <Text style={s.muted} numberOfLines={3}>{e.content}</Text> : null}
                          {e.image_url ? <Text style={s.link} numberOfLines={1}>{e.image_url}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {entries.length > 0 && (
                    <View style={s.row}>
                      {c.type === "quiz" && (
                        <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => announce(c, true)}><Text style={s.btnText}>اختيار تلقائي</Text></TouchableOpacity>
                      )}
                      <TouchableOpacity style={[s.btnGhost, { flex: 1 }, !picked.length && { opacity: 0.5 }]} disabled={!picked.length} onPress={() => announce(c, false)}>
                        <Text style={s.btnGhostText}>إعلان المختارين ({picked.length}/{c.winners_count})</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Field({ label, value, onChange, multiline, numeric }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; numeric?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { height: 84, textAlignVertical: "top", paddingTop: 10 }]}
        value={value} onChangeText={onChange} multiline={multiline} keyboardType={numeric ? "numeric" : "default"}
        textAlign="right" placeholderTextColor={Colors.textMuted}
      />
    </View>
  );
}

function Seg({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <View style={s.seg}>
      {options.map(([k, l]) => (
        <TouchableOpacity key={k} style={[s.segItem, value === k && s.segOn]} onPress={() => onChange(k)}>
          <Text style={[s.segText, value === k && { color: Colors.onColor }]}>{l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Small({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.small} onPress={onPress}>
      <Ionicons name={icon} size={15} color={danger ? Colors.danger : Colors.primary} />
      <Text style={[s.smallText, danger && { color: Colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  tpl: { width: 130, padding: 12, borderRadius: 16, gap: 4 },
  tplName: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#FFFFFF", textAlign: "right" },
  tplDate: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  row: { flexDirection: "row-reverse", gap: 10, alignItems: "flex-end" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
  seg: { flexDirection: "row-reverse", padding: 4, borderRadius: 12, backgroundColor: Colors.bg, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: Colors.primary },
  segText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  qBox: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.bg },
  optRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  del: { width: 44, height: 46, alignItems: "center", justifyContent: "center" },
  link: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary, textAlign: "right" },
  btn: { height: 48, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.onColor },
  btnGhost: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  btnGhostText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },
  status: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: Colors.bg, overflow: "hidden" },
  statusOn: { color: Colors.primary, backgroundColor: Colors.primarySoft },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  small: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 36, borderRadius: 10, backgroundColor: Colors.bg },
  smallText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  entry: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  name: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
});
