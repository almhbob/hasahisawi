// إدارة المسابقات: إنشاء (برعاية جهة أو موسمية من قالب جاهز)، الأسئلة، المشاركات، وإعلان الفائزين.
// للأدمن ولمن مُنح صلاحية قسم «المسابقات».
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, Switch } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { contestsApi, OCCASION_THEME, CATEGORIES, RANK_LABEL, type Contest, type Occasion, type ContestCategory } from "@/lib/contests";
import { pickAndUploadContestImage } from "@/lib/contest-image";
import { fetchViewCounts, formatViews } from "@/lib/views";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import DateTimeField, { formatDuration } from "@/components/ui/DateTimeField";
import { confirmAction, notify } from "@/lib/xplatform";

type QDraft = { question: string; options: string[]; correct_index: number };
type Draft = {
  kind: "sponsored" | "seasonal"; occasion: string | null; type: "quiz" | "entry";
  title: string; description: string; sponsor_name: string; prize: string; terms: string; entry_prompt: string;
  winners_count: string; starts_at: string; ends_at: string; questions: QDraft[];
  cover_image: string; sponsor_logo: string; category: ContestCategory | null; prizes: string[]; featured: boolean;
};
type Entry = Awaited<ReturnType<typeof contestsApi.entries>>[number];

// التواريخ تُحفظ في المسودة بصيغة ISO كاملة (تاريخ + وقت)
const iso = (d: Date) => d.toISOString();
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
const nextHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; };
const newQ = (): QDraft => ({ question: "", options: ["", ""], correct_index: 0 });
const blank = (): Draft => {
  const now = new Date();
  return {
    kind: "sponsored", occasion: null, type: "quiz", title: "", description: "", sponsor_name: "", prize: "", terms: "",
    entry_prompt: "", winners_count: "1", starts_at: iso(nextHour()), ends_at: iso(dayEnd(addDays(now, 7))), questions: [newQ()],
    cover_image: "", sponsor_logo: "", category: null, prizes: [""], featured: false,
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [views, setViews] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState<"" | "cover" | "logo">("");
  const params = useLocalSearchParams<{ occasion?: string; edit?: string }>();
  const handledParam = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!token) { if (!authLoading) setLoading(false); return; }
    try {
      const [l, o] = await Promise.all([contestsApi.list(token), contestsApi.occasions()]);
      setList(l);
      setOccasions(o);
      fetchViewCounts("contest", l.map((c) => c.id)).then(setViews);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, authLoading]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // فتح مباشر من صفحة المسابقة (?edit=) أو من بطاقة مناسبة (?occasion=)
  useEffect(() => {
    if (handledParam.current || loading) return;
    if (params.edit) {
      const c = list.find((x) => x.id === Number(params.edit));
      if (c) { handledParam.current = true; startEdit(c); }
    } else if (params.occasion) {
      const o = occasions.find((x) => x.key === params.occasion);
      if (o) { handledParam.current = true; fromOccasion(o); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, list, occasions, params.edit, params.occasion]);

  const startEdit = (c: Contest) => {
    setEditingId(c.id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setDraft({
      ...blank(), kind: c.kind, occasion: c.occasion, type: c.type, title: c.title, description: c.description ?? "",
      sponsor_name: c.sponsor_name ?? "", prize: c.prize ?? "", terms: c.terms ?? "", entry_prompt: c.entry_prompt ?? "",
      winners_count: String(c.winners_count), starts_at: c.starts_at, ends_at: c.ends_at, questions: [],
      cover_image: c.cover_image ?? "", sponsor_logo: c.sponsor_logo ?? "", category: c.category ?? null,
      prizes: c.prizes?.length ? c.prizes : [c.prize ?? ""], featured: !!c.featured,
    });
  };

  const upload = async (which: "cover" | "logo") => {
    setUploading(which);
    try {
      const url = await pickAndUploadContestImage(which === "cover" ? "covers" : "sponsors");
      if (url) setDraft((d) => d && (which === "cover" ? { ...d, cover_image: url } : { ...d, sponsor_logo: url }));
    } catch (e: any) { notify("تعذّر رفع الصورة", e?.message || "الصق رابط الصورة بدلاً من ذلك."); }
    finally { setUploading(""); }
  };

  const fromOccasion = (o: Occasion) => {
    const start = new Date(o.date);
    // نبدأ قبل المناسبة بثلاثة أيام ونستمر أسبوعاً بعدها (رمضان: الشهر كله)
    const begin = new Date(start.getTime() - 3 * 86400_000);
    const end = new Date(start.getTime() + (o.key === "ramadan" ? 30 : 7) * 86400_000);
    setEditingId(null);
    setDraft({ ...blank(), kind: "seasonal", occasion: o.key, title: o.title, description: o.description, starts_at: iso(begin < new Date() ? nextHour() : dayStart(begin)), ends_at: iso(dayEnd(end)) });
  };

  const save = async () => {
    if (!draft) return;
    const qs = draft.questions
      .map((q) => ({ ...q, question: q.question.trim(), options: q.options.map((o) => o.trim()) }))
      .filter((q) => q.question && q.options.filter(Boolean).length >= 2);
    if (draft.title.trim().length < 3) { notify("العنوان", "اكتب عنوان المسابقة."); return; }
    if (!editingId && draft.type === "quiz" && !qs.length) { notify("الأسئلة", "أضف سؤالاً واحداً على الأقل بخيارين."); return; }
    setSaving(true);
    try {
      const start = new Date(draft.starts_at);
      const end = new Date(draft.ends_at);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) { notify("التاريخ", "اختر تاريخ البداية والنهاية."); setSaving(false); return; }
      if (end <= start) { notify("التاريخ", "موعد النهاية يجب أن يكون بعد موعد البداية."); setSaving(false); return; }
      const prizes = draft.prizes.map((p) => p.trim());
      const common = {
        title: draft.title, description: draft.description, sponsor_name: draft.sponsor_name, terms: draft.terms, entry_prompt: draft.entry_prompt,
        prize: prizes.find(Boolean) || "",
        prizes, cover_image: draft.cover_image.trim(), sponsor_logo: draft.sponsor_logo.trim(), category: draft.category, featured: draft.featured,
        winners_count: Number(draft.winners_count) || 1,
        starts_at: start.toISOString(), ends_at: end.toISOString(),
      };
      if (editingId) {
        await contestsApi.update(token, editingId, common);
        setDraft(null); setEditingId(null);
        load();
        notify("حُفظت التعديلات", "");
        return;
      }
      await contestsApi.create(token, {
        ...draft,
        ...common,
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
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {!draft ? (
            <>
              <TouchableOpacity style={s.btn} onPress={() => { setEditingId(null); setDraft(blank()); }}>
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
              <Text style={s.cardTitle}>
                {editingId ? "تعديل المسابقة" : draft.kind === "seasonal" ? `مسابقة موسمية · ${occasions.find((o) => o.key === draft.occasion)?.name ?? ""}` : "مسابقة برعاية جهة"}
              </Text>
              {editingId ? (
                <Text style={s.muted}>النوع والأسئلة لا تتغير بعد النشر حفاظاً على عدالة المشاركات السابقة.</Text>
              ) : (
                <Seg value={draft.type} options={[["quiz", "أسئلة (تصحيح تلقائي)"], ["entry", "مشاركة نص/صورة"]]} onChange={(v) => setDraft({ ...draft, type: v as Draft["type"] })} />
              )}
              <Field label="العنوان" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
              <Field label="الوصف" value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} multiline />

              <Text style={s.label}>التصنيف</Text>
              <View style={s.actions}>
                {(Object.keys(CATEGORIES) as ContestCategory[]).map((k) => {
                  const on = draft.category === k;
                  return (
                    <TouchableOpacity key={k} style={[s.catChip, on && s.catOn]} onPress={() => setDraft({ ...draft, category: on ? null : k })} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <Ionicons name={CATEGORIES[k].icon as any} size={14} color={on ? "#FFFFFF" : Colors.textSecondary} />
                      <Text style={[s.smallText, { color: on ? "#FFFFFF" : Colors.textSecondary }]}>{CATEGORIES[k].label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ImageField label="صورة الغلاف (اختياري)" value={draft.cover_image} busy={uploading === "cover"}
                onChange={(v) => setDraft({ ...draft, cover_image: v })} onUpload={() => upload("cover")} wide />

              <Field label="الجهة الراعية (اختياري)" value={draft.sponsor_name} onChange={(v) => setDraft({ ...draft, sponsor_name: v })} />
              {draft.sponsor_name.trim() ? (
                <ImageField label="شعار الراعي" value={draft.sponsor_logo} busy={uploading === "logo"}
                  onChange={(v) => setDraft({ ...draft, sponsor_logo: v })} onUpload={() => upload("logo")} />
              ) : null}

              <Text style={s.label}>الجوائز حسب المراكز</Text>
              {draft.prizes.map((p, i) => (
                <View key={i} style={s.optRow}>
                  <View style={{ flex: 1 }}>
                    <Field label={RANK_LABEL[i] ?? `المركز ${i + 1}`} value={p} onChange={(v) => setDraft({ ...draft, prizes: draft.prizes.map((x, j) => (j === i ? v : x)) })} />
                  </View>
                  {draft.prizes.length > 1 && (
                    <TouchableOpacity style={s.del} onPress={() => setDraft({ ...draft, prizes: draft.prizes.filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel={`حذف جائزة ${RANK_LABEL[i] ?? ""}`}>
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {draft.prizes.length < 10 && (
                <TouchableOpacity onPress={() => setDraft({ ...draft, prizes: [...draft.prizes, ""] })} style={{ minHeight: 36, justifyContent: "center" }} accessibilityRole="button">
                  <Text style={s.link}>+ جائزة للمركز التالي</Text>
                </TouchableOpacity>
              )}
              <Text style={s.muted}>جائزة واحدة فقط؟ تُمنح لكل فائز. أكثر من جائزة؟ لكل مركز جائزته.</Text>

              <View style={[s.row, { alignItems: "center", justifyContent: "space-between" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>مسابقة مميّزة</Text>
                  <Text style={s.muted}>تظهر في واجهة صفحة المسابقات مع العدّ التنازلي.</Text>
                </View>
                <Switch value={draft.featured} onValueChange={(v) => setDraft({ ...draft, featured: v })} trackColor={{ true: Colors.primary, false: Colors.border }} accessibilityLabel="مسابقة مميّزة" />
              </View>
              <DateTimeField
                label="تبدأ المسابقة"
                value={new Date(draft.starts_at)}
                onChange={(d) => {
                  const end = new Date(draft.ends_at);
                  // إن تجاوزت البداية النهاية نمدّ النهاية أسبوعاً تلقائياً
                  setDraft({ ...draft, starts_at: iso(d), ends_at: end <= d ? iso(dayEnd(addDays(d, 7))) : draft.ends_at });
                }}
                minDate={editingId ? undefined : new Date()}
                presets={[
                  { label: "الآن", get: () => { const d = new Date(); d.setSeconds(0, 0); return d; } },
                  { label: "بعد ساعة", get: nextHour },
                  { label: "غداً صباحاً", get: () => { const d = addDays(new Date(), 1); d.setHours(9, 0, 0, 0); return d; } },
                ]}
              />
              <DateTimeField
                label="تنتهي المسابقة"
                value={new Date(draft.ends_at)}
                onChange={(d) => setDraft({ ...draft, ends_at: iso(d) })}
                minDate={new Date(draft.starts_at)}
                presets={[1, 3, 7, 14, 30].map((n) => ({
                  label: n === 1 ? "بعد يوم" : n === 7 ? "بعد أسبوع" : n === 14 ? "بعد أسبوعين" : n === 30 ? "بعد شهر" : `بعد ${n} أيام`,
                  get: () => dayEnd(addDays(new Date(draft.starts_at), n)),
                }))}
                hint={(() => { const d = formatDuration(new Date(draft.starts_at), new Date(draft.ends_at)); return d ? `مدة المسابقة: ${d}` : "موعد النهاية قبل البداية — عدّله."; })()}
              />
              <View><Field label="عدد الفائزين" value={draft.winners_count} onChange={(v) => setDraft({ ...draft, winners_count: v.replace(/\D/g, "") })} numeric /></View>
              {draft.type === "entry" && <Field label="المطلوب من المشارك" value={draft.entry_prompt} onChange={(v) => setDraft({ ...draft, entry_prompt: v })} />}
              <Field label="الشروط (اختياري)" value={draft.terms} onChange={(v) => setDraft({ ...draft, terms: v })} multiline />

              {draft.type === "quiz" && !editingId && (
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
                  {saving ? <ActivityIndicator color={Colors.onColor} /> : <Text style={s.btnText}>{editingId ? "حفظ التعديلات" : "نشر المسابقة"}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={() => { setDraft(null); setEditingId(null); }}><Text style={s.btnGhostText}>إلغاء</Text></TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={s.section}>المسابقات</Text>
          {list.length > 0 && (
            <View style={s.statsRow}>
              <AdminStat n={list.filter((c) => c.state === "active").length} label="جارية" />
              <AdminStat n={list.reduce((a, c) => a + c.entries_count, 0)} label="مشاركة" />
              <AdminStat n={Object.values(views).reduce((a, b) => a + b, 0)} label="مشاهدة" />
              <AdminStat n={list.reduce((a, c) => a + (c.shares || 0), 0)} label="نشر" />
            </View>
          )}
          {list.length === 0 && <Text style={s.muted}>لا توجد مسابقات بعد.</Text>}
          {list.map((c) => (
            <View key={c.id} style={s.card}>
              <View style={s.row}>
                <Text style={[s.cardTitle, { flex: 1 }]} numberOfLines={2}>{c.title}</Text>
                {c.featured ? <Ionicons name="flash" size={16} color={Colors.accentDeep} accessibilityLabel="مميّزة" /> : null}
                <Text style={[s.status, c.state === "active" && s.statusOn]}>{c.state === "active" ? "جارية" : c.state === "upcoming" ? "قادمة" : "منتهية"}</Text>
              </View>
              <Text style={s.muted}>{c.type === "quiz" ? "أسئلة" : "مشاركات"}{c.category && CATEGORIES[c.category] ? ` · ${CATEGORIES[c.category].label}` : ""}{c.sponsor_name ? ` · برعاية ${c.sponsor_name}` : ""}</Text>
              <View style={s.miniStats}>
                <MiniStat icon="people-outline" text={`${c.entries_count} مشارك`} />
                <MiniStat icon="eye-outline" text={`${formatViews(views[String(c.id)] ?? 0)} مشاهدة`} />
                <MiniStat icon="share-social-outline" text={`${c.shares} نشر`} />
              </View>
              <View style={s.actions}>
                <Small icon="eye-outline" label="الصفحة" onPress={() => router.push({ pathname: "/contest" as any, params: { id: String(c.id) } })} />
                <Small icon="create-outline" label="تعديل" onPress={() => { startEdit(c); }} />
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

function ImageField({ label, value, onChange, onUpload, busy, wide }: { label: string; value: string; onChange: (v: string) => void; onUpload: () => void; busy: boolean; wide?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { alignItems: "center" }]}>
        {value ? (
          <Image source={{ uri: value }} style={wide ? { width: 96, height: 54, borderRadius: 10 } : { width: 54, height: 54, borderRadius: 27 }} contentFit="cover" accessibilityLabel={`معاينة ${label}`} />
        ) : null}
        <TouchableOpacity style={[s.btnGhost, { flex: 1, flexDirection: "row-reverse", gap: 6 }]} onPress={onUpload} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="cloud-upload-outline" size={18} color={Colors.primaryDeep} />}
          <Text style={[s.btnGhostText, { color: Colors.primaryDeep }]}>{busy ? "جارٍ الرفع…" : value ? "تغيير الصورة" : "رفع صورة"}</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity style={s.del} onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={`إزالة ${label}`}>
            <Ionicons name="close-circle-outline" size={20} color={Colors.danger} />
          </TouchableOpacity>
        ) : null}
      </View>
      <TextInput style={s.input} value={value} onChangeText={onChange} placeholder="أو الصق رابطاً يبدأ بـ https://" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" accessibilityLabel={`رابط ${label}`} />
    </View>
  );
}

function AdminStat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statNum}>{formatViews(n)}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

function MiniStat({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.mini}>
      <Ionicons name={icon} size={13} color={Colors.textSecondary} />
      <Text style={s.miniText}>{text}</Text>
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
  catChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 12, minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  catOn: { backgroundColor: "#006B4A", borderColor: "#006B4A" },
  statsRow: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 18, lineHeight: 28, color: Colors.text },
  miniStats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  mini: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, minHeight: 26, borderRadius: 8, backgroundColor: Colors.bg },
  miniText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
});
