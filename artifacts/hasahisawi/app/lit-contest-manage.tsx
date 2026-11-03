// إدارة «مسابقة حصاحيصاوي الأدبية» — لمشرف المسابقة (تعيّنه الإدارة):
// إنشاء الدورات وتعديلها ونشرها، تشكيل لجنة التحكيم، فرز المشاركات (تأهيل/استبعاد مع فحص الأصالة)،
// متابعة تقدّم التحكيم، حساب النتائج واعتمادها. ولإدارة التطبيق: تعيين مشرفي المسابقة.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { litApi, WINE, GOLD, INK, PHASE_META, fmtDate, type Contest, type LitMeta, type SupEntry, type UserHit, type Criterion, type Prize } from "@/lib/lit";
import { groupColor } from "@/components/lit/ui";
import { Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "settings" | "judges" | "entries" | "results";
const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const parse = (s: string) => { const d = new Date(s.trim().replace(" ", "T")); return isNaN(+d) ? null : d; };

export default function ContestManage() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<number | null>(params.id ? Number(params.id) : null);
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<{ contests: Contest[]; me: { supervisor: boolean; is_app_admin: boolean } } | null>(null);
  const [meta, setMeta] = useState<LitMeta | null>(null);
  const [tab, setTab] = useState<Tab>("settings");

  const loadList = useCallback(async () => {
    try { setList(await litApi.contests(token)); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [token]);
  useFocusEffect(useCallback(() => { loadList(); litApi.meta(token).then(setMeta).catch(() => {}); }, [loadList, token]));
  const back = () => { if (id || creating) { setId(null); setCreating(false); loadList(); } else if (router.canGoBack()) router.back(); else router.replace("/lit-contest" as any); };

  if (!list || !token) return <View style={st.center}><ActivityIndicator color={WINE} /></View>;
  if (!list.me.supervisor) return <View style={st.center}><Empty icon="lock-closed-outline" title="لمشرف المسابقة فقط" sub="تعيّن إدارة التطبيق مشرف المسابقة الأدبية." /></View>;
  const contest = list.contests.find((c) => c.id === id) || null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.barTitle} numberOfLines={1}>{creating ? "دورة جديدة" : contest ? contest.title : "إدارة المسابقة الأدبية"}</Text>
          {contest && <Text style={[st.barSub, { color: PHASE_META[contest.phase].color }]}>{PHASE_META[contest.phase].label}</Text>}
        </View>
        {contest ? <Pressable onPress={() => router.push({ pathname: "/lit-contest", params: { id: String(contest.id) } } as any)} style={st.barBtn} accessibilityLabel="معاينة"><Ionicons name="eye-outline" size={20} color={INK} /></Pressable> : <View style={{ width: 40 }} />}
      </View>

      {!id && !creating ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <Pressable onPress={() => setCreating(true)} style={[u.primaryBtn, { backgroundColor: WINE }]}><Ionicons name="add-circle" size={18} color="#fff" /><Text style={u.primaryText}>إنشاء دورة جديدة</Text></Pressable>
          <Text style={st.h}>الدورات</Text>
          {list.contests.map((c) => (
            <Pressable key={c.id} onPress={() => { setId(c.id); setTab(c.phase === "judging" ? "results" : c.phase === "open" ? "entries" : "settings"); }} style={[u.card, { marginBottom: 10 }]}>
              <View style={[u.rowR, { justifyContent: "space-between" }]}>
                <Text style={st.cTitle}>{c.title}</Text>
                <Text style={[st.phase, { color: PHASE_META[c.phase].color, backgroundColor: PHASE_META[c.phase].color + "14" }]}>{PHASE_META[c.phase].label}</Text>
              </View>
              <Text style={u.hint}>{c.edition || ""} · {c.entries} مشاركة · {fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}</Text>
            </Pressable>
          ))}
          {!list.contests.length && <Empty icon="trophy-outline" title="لا توجد دورات" sub="أنشئ الدورة الأولى من مسابقة حصاحيصاوي الأدبية." />}
          {list.me.is_app_admin && <Supervisors token={token} />}
        </ScrollView>
      ) : creating ? (
        <ContestForm token={token} meta={meta} onSaved={(c) => { setCreating(false); setId(c.id); setTab("judges"); loadList(); }} />
      ) : contest ? (
        <>
          <View style={st.tabs}>
            {([["settings", "الإعدادات", "options-outline"], ["judges", "لجنة التحكيم", "people-outline"], ["entries", "المشاركات", "documents-outline"], ["results", "النتائج", "podium-outline"]] as const).map(([k, l, i]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { borderBottomColor: WINE }]}>
                <Ionicons name={i} size={16} color={tab === k ? WINE : Colors.textMuted} />
                <Text style={[st.tabT, tab === k && { color: WINE }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {tab === "settings" && <ContestForm token={token} meta={meta} contest={contest} onSaved={() => loadList()} onDeleted={() => { setId(null); loadList(); }} />}
          {tab === "judges" && <Judges token={token} contest={contest} />}
          {tab === "entries" && <Entries token={token} contest={contest} />}
          {tab === "results" && <Results token={token} contest={contest} onPublished={loadList} />}
        </>
      ) : <Empty title="غير موجودة" />}
    </View>
  );
}

// ─── نموذج الدورة ─────────────────────────────────────────────
function ContestForm({ token, meta, contest, onSaved, onDeleted }: { token: string; meta: LitMeta | null; contest?: Contest; onSaved: (c: Contest) => void; onDeleted?: () => void }) {
  const insets = useSafeAreaInsets();
  const now = Date.now();
  const [title, setTitle] = useState(contest?.title || "مسابقة حصاحيصاوي الأدبية");
  const [edition, setEdition] = useState(contest?.edition || `الدورة الأولى ${new Date().getFullYear()}`);
  const [slogan, setSlogan] = useState(contest?.slogan || "");
  const [theme, setTheme] = useState(contest?.theme || "");
  const [description, setDescription] = useState(contest?.description || "");
  const [cats, setCats] = useState<string[]>(contest?.categories.map((c) => c.key) || ["short_story", "classical", "colloquial", "khatira"]);
  const [starts, setStarts] = useState(iso(new Date(contest?.starts_at || now + DAY)));
  const [ends, setEnds] = useState(iso(new Date(contest?.ends_at || now + 31 * DAY)));
  const [results, setResults] = useState(contest?.results_at ? iso(new Date(contest.results_at)) : iso(new Date(now + 45 * DAY)));
  const [maxEntries, setMaxEntries] = useState(contest?.max_entries || 1);
  const [criteria, setCriteria] = useState<Criterion[]>(contest?.criteria?.length ? contest.criteria : [
    { key: "idea", label: "الفكرة والرؤية", weight: 25 }, { key: "language", label: "اللغة والأسلوب", weight: 25 },
    { key: "structure", label: "البناء الفني", weight: 20 }, { key: "creativity", label: "الإبداع والدهشة", weight: 20 }, { key: "impact", label: "الصدق والأثر", weight: 10 },
  ]);
  const [prizes, setPrizes] = useState<Prize[]>(contest?.prizes?.length ? contest.prizes : [
    { rank: 1, label: "المركز الأول", reward: "" }, { rank: 2, label: "المركز الثاني", reward: "" }, { rank: 3, label: "المركز الثالث", reward: "" },
  ]);
  const [rules, setRules] = useState((contest?.rules || []).join("\n"));
  const [showJudges, setShowJudges] = useState(contest?.show_judges ?? true);
  const [saving, setSaving] = useState(false);
  const sum = criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const locked = !!contest?.results_published;

  const save = async () => {
    const s = parse(starts), e = parse(ends), r = results.trim() ? parse(results) : null;
    if (!s || !e) return notify("المواعيد", "اكتب التاريخ بصيغة 2026-12-01 18:00");
    if (sum !== 100) return notify("معايير التحكيم", `مجموع الأوزان يجب أن يساوي 100 (الآن ${sum})`);
    setSaving(true);
    const body = {
      title, edition, slogan, theme, description, categories: cats, starts_at: s.toISOString(), ends_at: e.toISOString(), results_at: r ? r.toISOString() : null,
      max_entries: maxEntries, criteria, prizes, rules: rules.split("\n").map((x) => x.trim()).filter(Boolean), show_judges: showJudges,
    };
    try {
      const out = contest ? await litApi.updateContest(token, contest.id, body) : await litApi.createContest(token, body as any);
      notify("تم الحفظ", contest ? "حُدّثت الدورة" : "أُنشئت الدورة كمسودة — شكّل لجنة التحكيم ثم انشرها");
      onSaved(out.contest);
    } catch (err: any) { notify("تعذّر الحفظ", err?.message); } finally { setSaving(false); }
  };
  const togglePublish = async () => {
    if (!contest) return;
    if (!contest.published && !(await confirmAction("نشر الدورة", "ستظهر للجميع ويصل إشعار لكتّاب الديوان.", "نشر"))) return;
    try { const r = await litApi.updateContest(token, contest.id, { published: !contest.published }); onSaved(r.contest); notify("تم", r.contest.published ? "نُشرت الدورة" : "أصبحت مسودة"); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const del = async () => {
    if (!contest || !(await confirmAction("حذف الدورة", "تُحذف الدورة نهائياً (بلا مشاركات فقط).", "حذف", true))) return;
    try { await litApi.deleteContest(token, contest.id); onDeleted?.(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      {contest && (
        <View style={[u.card, { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 6 }]}>
          <Ionicons name={contest.published ? "radio" : "create-outline"} size={22} color={contest.published ? "#0E8A5F" : Colors.textMuted} />
          <Text style={[u.hint, { flex: 1, color: Colors.textSecondary }]}>{contest.published ? "الدورة منشورة للجميع" : "مسودة — لا يراها إلا المشرفون"}</Text>
          {!locked && <Pressable onPress={togglePublish} style={[st.smallBtn, { backgroundColor: contest.published ? Colors.divider : "#0E8A5F" }]}><Text style={[st.smallBtnT, { color: contest.published ? INK : "#fff" }]}>{contest.published ? "إلغاء النشر" : "نشر الدورة"}</Text></Pressable>}
        </View>
      )}
      <F l="اسم المسابقة"><TextInput value={title} onChangeText={setTitle} style={u.input} editable={!locked} /></F>
      <View style={[u.rowR, { gap: 8 }]}>
        <View style={{ flex: 1 }}><F l="الدورة"><TextInput value={edition} onChangeText={setEdition} style={u.input} editable={!locked} /></F></View>
        <View style={{ flex: 1 }}><F l="محور الدورة"><TextInput value={theme} onChangeText={setTheme} placeholder="مثال: النيل والمدينة" placeholderTextColor={Colors.textMuted} style={u.input} editable={!locked} /></F></View>
      </View>
      <F l="شعار الدورة"><TextInput value={slogan} onChangeText={setSlogan} placeholder="عبارة ملهمة قصيرة" placeholderTextColor={Colors.textMuted} style={u.input} editable={!locked} /></F>
      <F l="نبذة"><TextInput value={description} onChangeText={setDescription} multiline style={[u.input, { minHeight: 80, textAlignVertical: "top" }]} editable={!locked} /></F>

      <F l="الفئات الأدبية">
        {(["story", "poetry", "prose"] as const).map((g) => (
          <View key={g} style={[u.wrap, { marginBottom: 6 }]}>
            {(meta?.forms ?? []).filter((f) => f.group === g).map((f) => (
              <Pill key={f.key} label={f.label} on={cats.includes(f.key)} color={groupColor(g)} onPress={() => !locked && setCats(cats.includes(f.key) ? cats.filter((x) => x !== f.key) : [...cats, f.key])} />
            ))}
          </View>
        ))}
      </F>

      <Text style={st.sec}>المواعيد (توقيت الجهاز · الصيغة 2026-12-01 18:00)</Text>
      <F l="بدء استقبال المشاركات"><TextInput value={starts} onChangeText={setStarts} style={u.input} editable={!locked} /></F>
      <F l="إغلاق باب المشاركة (يبدأ بعده التحكيم)"><TextInput value={ends} onChangeText={setEnds} style={u.input} editable={!locked} /></F>
      <F l="موعد إعلان النتائج المتوقع"><TextInput value={results} onChangeText={setResults} style={u.input} editable={!locked} /></F>
      <F l="عدد المشاركات المسموح للكاتب">
        <View style={[u.rowR, { gap: 6 }]}>{[1, 2, 3].map((n) => <Pill key={n} label={String(n)} on={maxEntries === n} onPress={() => setMaxEntries(n)} color={WINE} />)}</View>
      </F>

      <Text style={st.sec}>معايير التحكيم (المجموع {sum}%)</Text>
      {criteria.map((c, i) => (
        <View key={i} style={[u.rowR, { gap: 8, marginBottom: 6 }]}>
          <TextInput value={c.label} onChangeText={(t) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, label: t } : x)))} style={[u.input, { flex: 1 }]} editable={!locked} />
          <TextInput value={String(c.weight)} onChangeText={(t) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, weight: Number(t.replace(/\D/g, "")) || 0 } : x)))} keyboardType="number-pad" style={[u.input, { width: 64, textAlign: "center" }]} editable={!locked} />
          {!locked && criteria.length > 2 && <Pressable onPress={() => setCriteria(criteria.filter((_, j) => j !== i))}><Ionicons name="remove-circle" size={22} color="#C0392B" /></Pressable>}
        </View>
      ))}
      {!locked && criteria.length < 8 && <Pressable onPress={() => setCriteria([...criteria, { key: `c${Date.now() % 10000}`, label: "", weight: 0 }])}><Text style={st.link}>+ معيار</Text></Pressable>}

      <Text style={st.sec}>الجوائز (لكل فئة)</Text>
      {prizes.map((p, i) => (
        <View key={i} style={[u.rowR, { gap: 8, marginBottom: 6 }]}>
          <TextInput value={p.label} onChangeText={(t) => setPrizes(prizes.map((x, j) => (j === i ? { ...x, label: t } : x)))} style={[u.input, { width: 130 }]} editable={!locked} />
          <TextInput value={p.reward} onChangeText={(t) => setPrizes(prizes.map((x, j) => (j === i ? { ...x, reward: t } : x)))} placeholder="الجائزة (مبلغ، درع، طباعة…)" placeholderTextColor={Colors.textMuted} style={[u.input, { flex: 1 }]} editable={!locked} />
          {!locked && prizes.length > 1 && <Pressable onPress={() => setPrizes(prizes.filter((_, j) => j !== i))}><Ionicons name="remove-circle" size={22} color="#C0392B" /></Pressable>}
        </View>
      ))}
      {!locked && prizes.length < 10 && <Pressable onPress={() => setPrizes([...prizes, { rank: prizes.length + 1, label: `المركز ${prizes.length + 1}`, reward: "" }])}><Text style={st.link}>+ مركز</Text></Pressable>}

      <F l="الشروط (شرط في كل سطر — اتركه فارغاً للشروط الافتراضية)"><TextInput value={rules} onChangeText={setRules} multiline style={[u.input, { minHeight: 110, textAlignVertical: "top" }]} editable={!locked} /></F>
      <Pressable onPress={() => setShowJudges(!showJudges)} style={[u.rowR, { gap: 8, marginTop: 10 }]}>
        <Ionicons name={showJudges ? "checkbox" : "square-outline"} size={22} color={WINE} /><Text style={st.chk}>إظهار أسماء لجنة التحكيم للعامة</Text>
      </Pressable>

      {!locked && (
        <Pressable onPress={save} disabled={saving} style={[u.primaryBtn, { backgroundColor: WINE, marginTop: 18 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}<Text style={u.primaryText}>{contest ? "حفظ التعديلات" : "إنشاء الدورة"}</Text>
        </Pressable>
      )}
      {contest && !contest.entries && !locked && <Pressable onPress={del} style={[u.ghostBtn, { marginTop: 10, borderColor: "#C0392B55" }]}><Text style={[u.ghostText, { color: "#C0392B" }]}>حذف الدورة</Text></Pressable>}
    </ScrollView>
  );
}

// ─── لجنة التحكيم ─────────────────────────────────────────────
function Judges({ token, contest }: { token: string; contest: Contest }) {
  const insets = useSafeAreaInsets();
  const [judges, setJudges] = useState<{ user_id: number; name: string; avatar_url: string | null; title: string | null }[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<UserHit[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { litApi.contest(contest.id, token).then((d) => setJudges(d.judges)).catch(() => {}); }, [contest.id, token]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => litApi.lookup(token, q.trim()).then((r) => setHits(r.users)).catch(() => setHits([])), 350);
    return () => clearTimeout(t);
  }, [q, token]);
  const save = async () => {
    setSaving(true);
    try { await litApi.setJudges(token, contest.id, judges.map((j) => ({ user_id: j.user_id, title: j.title }))); notify("تم", "حُفظت لجنة التحكيم وأُرسلت الدعوات للأعضاء الجدد"); }
    catch (e: any) { notify("تعذّر", e?.message); } finally { setSaving(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={u.hint}>يُفضَّل عدد فردي (3 أو 5). لا يجوز أن يكون المحكّم مشاركاً. المحكّمون يرون النصوص برموز دون أسماء.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن عضو بالاسم أو الهاتف" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 10 }]} />
      {hits.filter((h) => !judges.some((j) => j.user_id === h.id)).map((h) => (
        <Pressable key={h.id} onPress={() => { setJudges([...judges, { user_id: h.id, name: h.name, avatar_url: h.avatar_url, title: h.headline || null }]); setQ(""); setHits([]); }} style={st.hit}>
          <UserAvatar name={h.name} avatarUrl={h.avatar_url} size={32} /><Text style={[st.hitName, { flex: 1 }]}>{h.name}</Text><Ionicons name="add-circle" size={22} color={WINE} />
        </Pressable>
      ))}
      <Text style={st.h}>أعضاء اللجنة ({judges.length})</Text>
      {judges.map((j, i) => (
        <View key={j.user_id} style={[u.card, { marginBottom: 8, flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10 }]}>
          <UserAvatar name={j.name} avatarUrl={j.avatar_url} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={st.hitName}>{j.name}</Text>
            <TextInput value={j.title || ""} onChangeText={(t) => setJudges(judges.map((x, k) => (k === i ? { ...x, title: t } : x)))} placeholder="الصفة (ناقد، شاعر، أستاذ أدب…)" placeholderTextColor={Colors.textMuted} style={st.titleIn} />
          </View>
          {!contest.results_published && <Pressable onPress={() => setJudges(judges.filter((x) => x.user_id !== j.user_id))}><Ionicons name="close-circle" size={22} color="#C0392B" /></Pressable>}
        </View>
      ))}
      {!judges.length && <Empty icon="people-outline" title="لم تُشكَّل اللجنة بعد" />}
      {!contest.results_published && <Pressable onPress={save} disabled={saving} style={[u.primaryBtn, { backgroundColor: WINE, marginTop: 12 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}<Text style={u.primaryText}>حفظ اللجنة</Text></Pressable>}
    </ScrollView>
  );
}

// ─── المشاركات ───────────────────────────────────────────────
function Entries({ token, contest }: { token: string; contest: Contest }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ judges: number; entries: SupEntry[] } | null>(null);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const load = useCallback(() => { litApi.supEntries(token, contest.id).then(setData).catch((e) => notify("تعذّر", e?.message)); }, [token, contest.id]);
  useEffect(() => { load(); }, [load]);
  const setStatus = async (e: SupEntry, status: "qualified" | "disqualified") => {
    if (status === "disqualified" && note.trim().length < 3) return notify("سبب الاستبعاد", "اكتب السبب ليصل للمشارك.");
    try { await litApi.entryStatus(token, contest.id, e.id, status, note.trim() || undefined); setNote(""); load(); } catch (err: any) { notify("تعذّر", err?.message); }
  };
  if (!data) return <ActivityIndicator color={WINE} style={{ marginTop: 30 }} />;
  const counts = data.entries.reduce<Record<string, number>>((a, e) => { a[e.status] = (a[e.status] || 0) + 1; return a; }, {});
  const shown = data.entries.filter((e) => filter === "all" || e.status === filter);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <View style={u.wrap}>
        {[["all", "الكل", data.entries.length], ["review", "تدقيق أصالة", counts.review || 0], ["qualified", "مؤهلة", counts.qualified || 0], ["disqualified", "مستبعدة", counts.disqualified || 0], ["withdrawn", "مسحوبة", counts.withdrawn || 0]].map(([k, l, n]) => (
          <Pill key={String(k)} label={`${l} (${n})`} on={filter === k} onPress={() => setFilter(String(k))} color={k === "review" ? "#B7791F" : WINE} />
        ))}
      </View>
      <Text style={[u.hint, { marginTop: 8 }]}>اللجنة: {data.judges} محكّمين. يظهر لك اسم الكاتب للتدقيق، ويُخفى عن المحكّمين.</Text>
      {shown.map((e) => {
        const isOpen = open === e.id;
        return (
          <View key={e.id} style={[u.card, { marginTop: 10, borderRightWidth: 4, borderRightColor: e.status === "review" ? "#B7791F" : e.status === "qualified" ? "#0E8A5F" : Colors.divider }]}>
            <Pressable onPress={() => setOpen(isOpen ? null : e.id)}>
              <View style={[u.rowR, { justifyContent: "space-between" }]}>
                <Text style={st.code}>{e.code}</Text>
                <Text style={[u.hint, { color: WINE }]}>{e.category_label}</Text>
              </View>
              <Text style={st.cTitle}>{e.title}</Text>
              <Text style={u.hint}>{e.author_name} · {e.doc_no} · مقيَّمة من {e.scored}/{data.judges}{e.avg_total != null ? ` · متوسط ${e.avg_total}` : ""}</Text>
              <Text style={[u.hint, { color: e.ai_verdict === "human" ? "#0E8A5F" : "#B7791F" }]}>فحص الأصالة {e.ai_score}%{e.pasted_ratio != null ? ` · ملصوق ${Math.round((e.pasted_ratio || 0) * 100)}%` : ""}</Text>
            </Pressable>
            {isOpen && (
              <View style={{ marginTop: 8 }}>
                {e.ai_signals?.map((s, i) => <Text key={i} style={st.sig}>• {s.label}</Text>)}
                <Text style={st.body}>{e.body}</Text>
                {!contest.results_published && (
                  <>
                    <TextInput value={note} onChangeText={setNote} placeholder="سبب الاستبعاد (يصل للمشارك)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 8 }]} />
                    <View style={[u.rowR, { gap: 8, marginTop: 8 }]}>
                      {e.status !== "qualified" && e.status !== "withdrawn" && <Pressable onPress={() => setStatus(e, "qualified")} style={[st.smallBtn, { backgroundColor: "#0E8A5F" }]}><Text style={[st.smallBtnT, { color: "#fff" }]}>تأهيل للتحكيم</Text></Pressable>}
                      {e.status !== "disqualified" && e.status !== "withdrawn" && <Pressable onPress={() => setStatus(e, "disqualified")} style={[st.smallBtn, { backgroundColor: "#C0392B" }]}><Text style={[st.smallBtnT, { color: "#fff" }]}>استبعاد</Text></Pressable>}
                    </View>
                  </>
                )}
                {!!e.status_note && <Text style={[u.hint, { color: "#C0392B" }]}>سبب الاستبعاد: {e.status_note}</Text>}
              </View>
            )}
          </View>
        );
      })}
      {!shown.length && <Empty icon="documents-outline" title="لا توجد مشاركات" />}
    </ScrollView>
  );
}

// ─── النتائج ─────────────────────────────────────────────────
function Results({ token, contest, onPublished }: { token: string; contest: Contest; onPublished: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ judges: number; entries: SupEntry[] } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { litApi.supEntries(token, contest.id).then(setData).catch(() => {}); }, [token, contest.id]);
  useEffect(() => { load(); }, [load]);
  const byCat = useMemo(() => (data?.entries ?? []).filter((e) => e.status === "qualified").reduce<Record<string, SupEntry[]>>((a, e) => { (a[e.category_label] ??= []).push(e); return a; }, {}), [data]);
  const compute = async () => {
    setBusy(true);
    try { const r = await litApi.compute(token, contest.id); load(); notify("حُسبت النتائج", `${r.ranked} مركزاً${r.incomplete ? ` · ${r.incomplete} مشاركة لم يكتمل تقييمها من كل المحكّمين` : ""}`); }
    catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!(await confirmAction("اعتماد النتائج وإعلانها", "يُعلن الفائزون، وتصدر الشهادات، وتُنشر المشاركات المؤهلة في الديوان. لا يمكن التراجع.", "إعلان"))) return;
    setBusy(true);
    try { const r = await litApi.publishResults(token, contest.id, note.trim()); notify("أُعلنت النتائج 🏆", `${r.winners} فائزاً`); onPublished(); load(); }
    catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  if (!data) return <ActivityIndicator color={WINE} style={{ marginTop: 30 }} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
      {!contest.results_published && (
        <View style={[u.card, { gap: 8 }]}>
          <Text style={st.cTitle}>حساب الترتيب</Text>
          <Text style={u.hint}>الدرجة النهائية = متوسط ما أعطاه المحكّمون (من 100) وفق أوزان المعايير. التعادل يتشارك المركز. يمكنك الحساب أكثر من مرة قبل الإعلان.</Text>
          <Pressable onPress={compute} disabled={busy} style={[u.primaryBtn, { backgroundColor: INK }]}><Ionicons name="calculator" size={18} color="#fff" /><Text style={u.primaryText}>احسب النتائج (معاينة)</Text></Pressable>
        </View>
      )}
      {Object.entries(byCat).map(([cat, list]) => (
        <View key={cat} style={[u.card, { marginTop: 12 }]}>
          <Text style={[st.cTitle, { color: WINE }]}>{cat}</Text>
          {[...list].sort((a, b) => (b.final_score ?? b.avg_total ?? -1) - (a.final_score ?? a.avg_total ?? -1)).map((e) => (
            <View key={e.id} style={[u.rowR, { gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.divider }]}>
              <Text style={[st.rank, e.rank ? { backgroundColor: GOLD, color: "#fff" } : null]}>{e.rank ?? "—"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.hitName} numberOfLines={1}>{e.title}</Text>
                <Text style={u.hint}>{e.author_name} · {e.scored}/{data.judges} محكّمين{e.award ? ` · ${e.award}` : ""}</Text>
              </View>
              <Text style={st.score}>{e.final_score ?? e.avg_total ?? "—"}</Text>
            </View>
          ))}
        </View>
      ))}
      {!Object.keys(byCat).length && <Empty icon="podium-outline" title="لا توجد مشاركات مؤهلة بعد" />}
      {!contest.results_published && contest.phase === "judging" && (
        <View style={[u.card, { marginTop: 14, gap: 8 }]}>
          <Text style={st.cTitle}>إعلان النتائج</Text>
          <TextInput value={note} onChangeText={setNote} multiline placeholder="كلمة لجنة التحكيم / بيان النتائج (اختياري)" placeholderTextColor={Colors.textMuted} style={[u.input, { minHeight: 80, textAlignVertical: "top" }]} />
          <Pressable onPress={publish} disabled={busy} style={[u.primaryBtn, { backgroundColor: WINE }]}><Ionicons name="trophy" size={18} color={GOLD} /><Text style={u.primaryText}>اعتماد النتائج وإعلانها</Text></Pressable>
        </View>
      )}
      {contest.phase === "open" && <Text style={[u.hint, { marginTop: 12, textAlign: "center" }]}>يُتاح إعلان النتائج بعد إغلاق باب المشاركة في {fmtDate(contest.ends_at, true)}.</Text>}
      {contest.results_published && <Text style={[u.hint, { marginTop: 12, textAlign: "center", color: "#0E8A5F" }]}>أُعلنت النتائج ونُشرت المشاركات في الديوان.</Text>}
    </ScrollView>
  );
}

// ─── مشرفو المسابقة (لإدارة التطبيق) ─────────────────────────
function Supervisors({ token }: { token: string }) {
  const [list, setList] = useState<{ user_id: number; name: string; avatar_url: string | null }[]>([]);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<UserHit[]>([]);
  const load = useCallback(() => { litApi.supervisors(token).then((r) => setList(r.supervisors)).catch(() => {}); }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => litApi.lookup(token, q.trim()).then((r) => setHits(r.users)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [q, token]);
  return (
    <View style={[u.card, { marginTop: 20 }]}>
      <View style={[u.rowR, { gap: 6 }]}><Ionicons name="shield" size={18} color={WINE} /><Text style={st.cTitle}>مشرفو المسابقة (تعيين الإدارة)</Text></View>
      <Text style={u.hint}>المشرف ينشئ الدورات، ويشكّل اللجان، ويفرز المشاركات، ويعلن النتائج.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن عضو لتعيينه" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 8 }]} />
      {hits.map((h) => (
        <Pressable key={h.id} onPress={async () => { try { await litApi.addSupervisor(token, h.id); setQ(""); load(); notify("تم", `${h.name} مشرف للمسابقة`); } catch (e: any) { notify("تعذّر", e?.message); } }} style={st.hit}>
          <UserAvatar name={h.name} avatarUrl={h.avatar_url} size={30} /><Text style={[st.hitName, { flex: 1 }]}>{h.name}</Text><Ionicons name="add-circle" size={22} color={WINE} />
        </Pressable>
      ))}
      {list.map((s) => (
        <View key={s.user_id} style={st.hit}>
          <UserAvatar name={s.name} avatarUrl={s.avatar_url} size={30} /><Text style={[st.hitName, { flex: 1 }]}>{s.name}</Text>
          <Pressable onPress={async () => { if (await confirmAction("إزالة مشرف", s.name, "إزالة", true)) { await litApi.removeSupervisor(token, s.user_id).catch(() => {}); load(); } }}><Ionicons name="trash-outline" size={19} color="#C0392B" /></Pressable>
        </View>
      ))}
      {!list.length && <Text style={[u.hint, { marginTop: 6 }]}>لم يُعيَّن مشرفون بعد (مسؤولو التطبيق يملكون الصلاحية تلقائياً).</Text>}
    </View>
  );
}

function F({ l, children }: { l: string; children: React.ReactNode }) {
  return <View><Text style={u.label}>{l}</Text>{children}</View>;
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  bar: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: INK, textAlign: "center" },
  barSub: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, textAlign: "center" },
  tabs: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, gap: 2, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textMuted },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 18, marginBottom: 8 },
  sec: { fontFamily: "Cairo_700Bold", fontSize: 14, color: WINE, textAlign: "right", marginTop: 20 },
  cTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  phase: { fontFamily: "Cairo_700Bold", fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: WINE, textAlign: "right", marginTop: 2 },
  chk: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  smallBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  hit: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  hitName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  titleIn: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", paddingVertical: 2 },
  code: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: WINE, backgroundColor: WINE + "10", paddingHorizontal: 8, borderRadius: 8, overflow: "hidden", letterSpacing: 1 },
  sig: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#7A5A12", textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 14, color: INK, textAlign: "right", lineHeight: 26, marginTop: 8, backgroundColor: "#FFFDF8", padding: 10, borderRadius: 10 },
  rank: { width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted, backgroundColor: Colors.divider, overflow: "hidden" },
  score: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE },
});
