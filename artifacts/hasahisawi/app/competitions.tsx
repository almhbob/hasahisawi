// المسابقات — مسابقات أسئلة وصور وكتابة، مع نقاط وفائزين ولوحة نتائج
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  RefreshControl, Modal, Image, Switch, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import ModernHeader from "@/components/ui/ModernHeader";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { uploadFile } from "@/lib/firebase/storage";
import { rewardsApi, fmtDate, type CompetitionSummary, type CompetitionDetail } from "@/lib/rewards-api";

const KIND: Record<string, { t: string; icon: keyof typeof Ionicons.glyphMap; c: string }> = {
  quiz: { t: "أسئلة", icon: "help-circle", c: "#2E7FC0" },
  photo: { t: "تصوير", icon: "camera", c: "#D9822B" },
  text: { t: "كتابة", icon: "create", c: "#7B4BA8" },
};
const LIVE: Record<string, { t: string; c: string }> = {
  upcoming: { t: "قريباً", c: "#2E7FC0" },
  active: { t: "جارية الآن", c: "#17A35F" },
  ended: { t: "انتهى وقتها", c: "#8A6D00" },
  finished: { t: "أُعلنت النتائج", c: "#7B4BA8" },
  cancelled: { t: "ملغاة", c: "#999" },
};
type Q = { q: string; options: string[]; answer: number };

export default function CompetitionsScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest } = useAuth();
  const signedIn = !!token && !!user && !isGuest;
  const qp = useLocalSearchParams<{ id?: string }>();
  const [list, setList] = useState<CompetitionSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(qp.id ? Number(qp.id) : null);
  const [form, setForm] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await rewardsApi.competitions(token); setList(r.competitions); setCanManage(r.can_manage); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const saveForm = async () => {
    if (!token || !form) return;
    const parse = (v?: string) => { if (!v?.trim()) return null; const d = new Date(v.trim().replace(" ", "T")); return isNaN(+d) ? undefined : d.toISOString(); };
    const starts_at = parse(form.start), ends_at = parse(form.end);
    if (starts_at === undefined || ends_at === undefined) return notify("صيغة التاريخ", "اكتب التاريخ هكذا: 2026-11-20 20:00");
    const questions = (form.questions || []).filter((q: Q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2)
      .map((q: Q) => ({ q: q.q.trim(), options: q.options.map((o) => o.trim()).filter(Boolean), answer: q.answer }));
    const body = { ...form, starts_at: starts_at || undefined, ends_at, questions };
    try {
      if (form.id) { const r: any = await rewardsApi.editComp(token, form.id, body); if (r?.questions_locked) notify("ملاحظة", "لم تُعدَّل الأسئلة لأن هناك مشاركات بالفعل."); }
      else await rewardsApi.createComp(token, body);
      setForm(null); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  const active = list.filter((c) => c.live_status === "active" || c.live_status === "upcoming");
  const past = list.filter((c) => !(c.live_status === "active" || c.live_status === "upcoming"));

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      <ModernHeader title="المسابقات" subtitle="شارك واربح النقاط والجوائز" icon="trophy" showBack onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        rightSlot={canManage ? <TouchableOpacity onPress={() => setForm({ kind: "quiz", points_first: 50, points_participation: 5, questions: [{ q: "", options: ["", ""], answer: 0 }] })} style={s.hBtn}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <TouchableOpacity onPress={() => router.push({ pathname: "/volunteer", params: { tab: "board" } } as any)} style={s.boardLink}>
          <Ionicons name="podium-outline" size={20} color={Colors.accentDeep} />
          <Text style={s.boardTxt}>لوحة الشرف ونقاطي</Text>
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> :
          list.length === 0 ? (
            <View style={s.empty}><Ionicons name="trophy-outline" size={52} color={Colors.textSubtle} /><Text style={s.emptyT}>لا توجد مسابقات حالياً</Text><Text style={s.hint}>ترقّب — يصلك إشعار عند إطلاق مسابقة جديدة.</Text></View>
          ) : (
            <>
              {active.length > 0 && <Text style={s.sec}>المسابقات الحالية</Text>}
              {active.map((c) => <CompCard key={c.id} c={c} onPress={() => setOpenId(c.id)} />)}
              {past.length > 0 && <Text style={s.sec}>مسابقات سابقة</Text>}
              {past.map((c) => <CompCard key={c.id} c={c} onPress={() => setOpenId(c.id)} />)}
            </>
          )}
      </ScrollView>

      {openId != null && (
        <Detail id={openId} token={token} signedIn={signedIn} onClose={() => { setOpenId(null); load(); }}
          onEdit={(d) => { setOpenId(null); setForm({ ...d, start: toLocalInput(d.starts_at), end: d.ends_at ? toLocalInput(d.ends_at) : "", questions: d.questions.map((q) => ({ q: q.q, options: q.options, answer: q.answer ?? 0 })) }); }} />
      )}

      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <View style={s.mWrap}><View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.sheetTitle}>{form?.id ? "تعديل مسابقة" : "مسابقة جديدة"}</Text><TouchableOpacity onPress={() => setForm(null)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.kinds}>
              {(["quiz", "photo", "text"] as const).map((k) => (
                <TouchableOpacity key={k} disabled={!!form?.id} onPress={() => setForm((f: any) => ({ ...f, kind: k }))} style={[s.kindBtn, form?.kind === k && { backgroundColor: KIND[k].c, borderColor: KIND[k].c }]}>
                  <Ionicons name={KIND[k].icon} size={18} color={form?.kind === k ? "#fff" : KIND[k].c} />
                  <Text style={[s.kindTxt, form?.kind === k && { color: "#fff" }]}>{KIND[k].t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Field label="العنوان *" v={form?.title} on={(t) => setForm((f: any) => ({ ...f, title: t }))} ph="مسابقة تاريخ الحصاحيصا" />
            <Field label="الوصف والشروط" v={form?.description} on={(t) => setForm((f: any) => ({ ...f, description: t }))} multi />
            <Field label="الجائزة" v={form?.prize} on={(t) => setForm((f: any) => ({ ...f, prize: t }))} ph="رصيد 5000 ج + شهادة تقدير" />
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="نقاط المركز الأول" v={String(form?.points_first ?? "")} on={(t) => setForm((f: any) => ({ ...f, points_first: Number(t.replace(/\D/g, "")) || 0 }))} num /></View>
              <View style={{ flex: 1 }}><Field label="نقاط المشاركة" v={String(form?.points_participation ?? "")} on={(t) => setForm((f: any) => ({ ...f, points_participation: Number(t.replace(/\D/g, "")) || 0 }))} num /></View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="تبدأ (اختياري)" v={form?.start} on={(t) => setForm((f: any) => ({ ...f, start: t }))} ph="2026-11-20 20:00" ltr /></View>
              <View style={{ flex: 1 }}><Field label="تنتهي" v={form?.end} on={(t) => setForm((f: any) => ({ ...f, end: t }))} ph="2026-11-27 20:00" ltr /></View>
            </View>
            <Field label="رابط صورة الغلاف (https)" v={form?.cover_url} on={(t) => setForm((f: any) => ({ ...f, cover_url: t }))} ltr />

            {form?.kind === "quiz" && (
              <View style={{ gap: 10 }}>
                <Text style={s.sec}>الأسئلة — اضغط الدائرة لتحديد الإجابة الصحيحة</Text>
                {(form.questions as Q[]).map((q, qi) => (
                  <View key={qi} style={s.qBox}>
                    <View style={s.rowB}>
                      <Text style={s.lbl}>سؤال {qi + 1}</Text>
                      <TouchableOpacity onPress={() => setForm((f: any) => ({ ...f, questions: f.questions.filter((_: Q, i: number) => i !== qi) }))}><Ionicons name="trash-outline" size={18} color={Colors.danger} /></TouchableOpacity>
                    </View>
                    <TextInput value={q.q} onChangeText={(t) => setForm((f: any) => ({ ...f, questions: f.questions.map((x: Q, i: number) => (i === qi ? { ...x, q: t } : x)) }))} placeholder="نص السؤال" placeholderTextColor={Colors.textSubtle} style={s.input} />
                    {q.options.map((o, oi) => (
                      <View key={oi} style={s.optRow}>
                        <TouchableOpacity onPress={() => setForm((f: any) => ({ ...f, questions: f.questions.map((x: Q, i: number) => (i === qi ? { ...x, answer: oi } : x)) }))}>
                          <Ionicons name={q.answer === oi ? "checkmark-circle" : "ellipse-outline"} size={24} color={q.answer === oi ? Colors.primary : Colors.textMuted} />
                        </TouchableOpacity>
                        <TextInput value={o} onChangeText={(t) => setForm((f: any) => ({ ...f, questions: f.questions.map((x: Q, i: number) => (i === qi ? { ...x, options: x.options.map((y, j) => (j === oi ? t : y)) } : x)) }))} placeholder={`خيار ${oi + 1}`} placeholderTextColor={Colors.textSubtle} style={[s.input, { flex: 1 }]} />
                      </View>
                    ))}
                    {q.options.length < 6 && (
                      <TouchableOpacity onPress={() => setForm((f: any) => ({ ...f, questions: f.questions.map((x: Q, i: number) => (i === qi ? { ...x, options: [...x.options, ""] } : x)) }))}><Text style={s.link}>+ خيار</Text></TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={() => setForm((f: any) => ({ ...f, questions: [...f.questions, { q: "", options: ["", ""], answer: 0 }] }))} style={s.addQ}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primary} /><Text style={s.link}>إضافة سؤال</Text>
                </TouchableOpacity>
              </View>
            )}
            {!form?.id && <View style={s.rowB}><Text style={s.lbl}>إرسال إشعار لكل المستخدمين</Text><Switch value={!!form?.notify_all} onValueChange={(v) => setForm((f: any) => ({ ...f, notify_all: v }))} /></View>}
            <TouchableOpacity onPress={saveForm} style={s.btn}><Text style={s.btnTxt}>{form?.id ? "حفظ" : "إطلاق المسابقة"}</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>
    </View>
  );
}

function CompCard({ c, onPress }: { c: CompetitionSummary; onPress: () => void }) {
  const k = KIND[c.kind] || KIND.quiz, lv = LIVE[c.live_status] || LIVE.active;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.card}>
      {c.cover_url ? <Image source={{ uri: c.cover_url }} style={s.cover} /> : (
        <View style={[s.coverPh, { backgroundColor: k.c + "18" }]}><Ionicons name={k.icon} size={42} color={k.c} /></View>
      )}
      <View style={s.rowB}>
        <View style={[s.pill, { backgroundColor: k.c }]}><Ionicons name={k.icon} size={12} color="#fff" /><Text style={s.pillTxt}>{k.t}</Text></View>
        <Text style={[s.live, { color: lv.c, borderColor: lv.c }]}>{lv.t}</Text>
      </View>
      <Text style={s.title}>{c.title}</Text>
      {c.prize ? <Text style={s.prize}>🎁 {c.prize}</Text> : null}
      <View style={s.meta}>
        <Text style={s.metaTxt}>🏆 {c.points_first} نقطة للأول</Text>
        <Text style={s.metaTxt}>👥 {c.entries} مشارك</Text>
        {c.ends_at && c.live_status === "active" ? <Text style={s.metaTxt}>⏳ حتى {fmtDate(c.ends_at)}</Text> : null}
        {c.live_status === "upcoming" ? <Text style={s.metaTxt}>🗓 تبدأ {fmtDate(c.starts_at)}</Text> : null}
      </View>
      {c.participated && <Text style={s.done}>✓ شاركت في هذه المسابقة</Text>}
    </TouchableOpacity>
  );
}

function Detail({ id, token, signedIn, onClose, onEdit }: { id: number; token: string | null | undefined; signedIn: boolean; onClose: () => void; onEdit: (d: CompetitionDetail) => void }) {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<CompetitionDetail | null>(null);
  const [playing, setPlaying] = useState(false);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; points: number } | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  const started = useRef(0);

  const load = useCallback(async () => {
    try { setD(await rewardsApi.competition(id, token)); } catch (e: any) { notify("تعذّر التحميل", e?.message); onClose(); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  const start = () => {
    if (!signedIn) return notify("سجّل الدخول", "سجّل الدخول للمشاركة في المسابقة.");
    setAnswers([]); setQi(0); setPlaying(true); started.current = Date.now();
  };
  const submit = async (ans?: number[]) => {
    if (!d || !token) return;
    setBusy(true);
    try {
      let image_url: string | undefined;
      if (d.kind === "photo") {
        if (!image) { setBusy(false); return notify("أرفق صورة", "اختر صورة مشاركتك أولاً."); }
        image_url = await uploadFile(`competitions/${d.id}/${Date.now()}.jpg`, image);
      }
      const r = await rewardsApi.enter(token, d.id, { answers: ans, content: content || undefined, image_url, duration_sec: Math.round((Date.now() - started.current) / 1000) });
      setResult(r); setPlaying(false); load();
    } catch (e: any) { notify("تعذّر الإرسال", e?.message); }
    finally { setBusy(false); }
  };
  const choose = (oi: number) => {
    if (!d) return;
    const next = [...answers]; next[qi] = oi; setAnswers(next);
    setTimeout(() => { if (qi < d.questions.length - 1) setQi(qi + 1); else submit(next); }, 250);
  };
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.8 });
    if (!r.canceled && r.assets?.[0]?.uri) setImage(r.assets[0].uri);
  };
  const finish = async () => {
    if (!d || !token) return;
    const isQuiz = d.kind === "quiz";
    if (!isQuiz && pick.length === 0) return notify("اختر الفائزين", "اضغط على المشاركات الفائزة بالترتيب (الأول ثم الثاني…).");
    if (!(await confirmAction("إعلان النتائج", isQuiz ? "سيُختار أعلى 3 تلقائياً وتُمنح النقاط ويُرسل إشعار للمشاركين." : `إعلان ${pick.length} فائز ومنحهم النقاط؟`, "إعلان"))) return;
    try { await rewardsApi.finish(token, d.id, isQuiz && !pick.length ? { count: 3 } : { winners: pick }); notify("🏆 أُعلنت النتائج"); setPick([]); load(); }
    catch (e: any) { notify("تعذّر", e?.message); }
  };

  const k = d ? KIND[d.kind] : KIND.quiz;
  const canEnter = d && d.live_status === "active" && !d.my_entry && !result;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.dHead}>
          <TouchableOpacity onPress={() => (playing ? setPlaying(false) : onClose())} style={s.close}><Ionicons name="close" size={24} color={Colors.textPrimary} /></TouchableOpacity>
          <Text style={s.dTitle} numberOfLines={1}>{d?.title || "…"}</Text>
          {d?.can_manage ? <TouchableOpacity onPress={() => onEdit(d)} style={s.close}><Ionicons name="create-outline" size={22} color={Colors.primary} /></TouchableOpacity> : <View style={{ width: 40 }} />}
        </View>
        {!d ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} /> : playing && d.kind === "quiz" ? (
          <View style={{ flex: 1, padding: 20, gap: 16 }}>
            <View style={s.track}><View style={[s.fill, { width: `${((qi) / d.questions.length) * 100}%` }]} /></View>
            <Text style={s.hint}>السؤال {qi + 1} من {d.questions.length}</Text>
            <Text style={s.qText}>{d.questions[qi]?.q}</Text>
            {d.questions[qi]?.options.map((o, oi) => (
              <TouchableOpacity key={oi} disabled={busy} onPress={() => choose(oi)} style={[s.opt, answers[qi] === oi && { borderColor: Colors.primary, backgroundColor: Colors.primary + "14" }]}>
                <Text style={s.optLetter}>{"أبجدهو"[oi]}</Text><Text style={s.optTxt}>{o}</Text>
              </TouchableOpacity>
            ))}
            {busy && <ActivityIndicator color={Colors.primary} />}
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
            {d.cover_url ? <Image source={{ uri: d.cover_url }} style={s.cover} /> : null}
            <View style={s.rowB}>
              <View style={[s.pill, { backgroundColor: k.c }]}><Ionicons name={k.icon} size={12} color="#fff" /><Text style={s.pillTxt}>{k.t}{d.kind === "quiz" ? ` · ${d.questions.length} سؤال` : ""}</Text></View>
              <Text style={[s.live, { color: LIVE[d.live_status]?.c, borderColor: LIVE[d.live_status]?.c }]}>{LIVE[d.live_status]?.t}</Text>
            </View>
            {d.description ? <Text style={s.desc}>{d.description}</Text> : null}
            <View style={s.infoBox}>
              {d.prize ? <Info icon="gift-outline" t={`الجائزة: ${d.prize}`} /> : null}
              <Info icon="trophy-outline" t={`${d.points_first} نقطة للمركز الأول`} />
              {d.points_participation ? <Info icon="star-outline" t={`${d.points_participation} نقاط لكل مشارك`} /> : null}
              <Info icon="calendar-outline" t={`${fmtDate(d.starts_at)}${d.ends_at ? ` ← ${fmtDate(d.ends_at)}` : ""}`} />
            </View>

            {result && (
              <View style={s.resBox}>
                <Text style={s.resBig}>{d.kind === "quiz" ? `${result.score} / ${result.total}` : "✓"}</Text>
                <Text style={s.resTxt}>{d.kind === "quiz" ? "إجاباتك الصحيحة" : "استلمنا مشاركتك"} · +{result.points} نقطة مشاركة</Text>
                <Text style={s.hint}>تُعلن النتائج عند انتهاء المسابقة ويصلك إشعار.</Text>
              </View>
            )}
            {d.my_entry && !result && (
              <View style={s.resBox}>
                <Text style={s.resTxt}>{d.my_entry.is_winner ? `🏆 مبروك! حصلت على المركز ${d.my_entry.rank}` : "✓ شاركت في هذه المسابقة"}</Text>
                {d.kind === "quiz" && <Text style={s.hint}>درجتك: {d.my_entry.score} / {d.questions.length}</Text>}
              </View>
            )}

            {canEnter && d.kind === "quiz" && <TouchableOpacity onPress={start} style={s.btn}><Text style={s.btnTxt}>ابدأ المسابقة</Text></TouchableOpacity>}
            {canEnter && d.kind !== "quiz" && (
              <View style={{ gap: 10 }}>
                {d.kind === "photo" && (
                  <TouchableOpacity onPress={pickImage} style={s.pickBox}>
                    {image ? <Image source={{ uri: image }} style={{ width: "100%", height: 220, borderRadius: 12 }} /> : <><Ionicons name="image-outline" size={36} color={Colors.textMuted} /><Text style={s.hint}>اختر صورة مشاركتك</Text></>}
                  </TouchableOpacity>
                )}
                <TextInput value={content} onChangeText={setContent} multiline placeholder={d.kind === "photo" ? "وصف قصير للصورة (اختياري)" : "اكتب مشاركتك هنا…"} placeholderTextColor={Colors.textSubtle} style={[s.input, { minHeight: d.kind === "text" ? 160 : 70, textAlignVertical: "top" }]} />
                <TouchableOpacity disabled={busy} onPress={() => { if (!signedIn) return notify("سجّل الدخول", "سجّل الدخول للمشاركة."); started.current = Date.now(); submit(); }} style={s.btn}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>إرسال المشاركة</Text>}
                </TouchableOpacity>
              </View>
            )}

            {(d.live_status === "ended" || d.live_status === "finished" || d.can_manage) && d.kind === "quiz" && d.questions.some((q) => q.answer != null) && (
              <View style={{ gap: 8 }}>
                <Text style={s.sec}>الإجابات الصحيحة</Text>
                {d.questions.map((q, i) => (
                  <View key={i} style={s.ansRow}><Text style={s.ansQ}>{i + 1}. {q.q}</Text><Text style={s.ansA}>✓ {q.options[q.answer ?? 0]}</Text></View>
                ))}
              </View>
            )}

            <Text style={s.sec}>{d.live_status === "finished" ? "النتائج" : d.kind === "quiz" ? "الترتيب الحالي" : "المشاركات"} ({d.entries.length})</Text>
            {d.can_manage && d.live_status !== "finished" && d.kind !== "quiz" && <Text style={s.hint}>للإدارة: اضغط على المشاركات الفائزة بالترتيب ثم «إعلان النتائج».</Text>}
            {d.entries.length === 0 ? <Text style={s.hint}>لا توجد مشاركات بعد — كن الأول!</Text> : d.entries.map((e, i) => {
              const pi = pick.indexOf(e.id);
              return (
                <TouchableOpacity key={e.id} disabled={!d.can_manage || d.live_status === "finished"} onPress={() => setPick((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                  style={[s.entry, e.is_winner && { borderColor: "#D4A017" }, pi >= 0 && { borderColor: Colors.primary }]}>
                  <View style={s.rowB}>
                    <Text style={s.eRank}>{e.is_winner ? ["🥇", "🥈", "🥉"][(e.rank ?? 1) - 1] || `#${e.rank}` : pi >= 0 ? `✓${pi + 1}` : d.kind === "quiz" ? `${i + 1}` : ""}</Text>
                    <Text style={s.eName} numberOfLines={1}>{e.name}</Text>
                    {d.kind === "quiz" ? <Text style={s.eScore}>{e.score} / {d.questions.length}</Text> : null}
                  </View>
                  {e.image_url ? <Image source={{ uri: e.image_url }} style={s.eImg} /> : null}
                  {e.content ? <Text style={s.desc}>{e.content}</Text> : null}
                </TouchableOpacity>
              );
            })}

            {d.can_manage && d.live_status !== "finished" && d.entries.length > 0 && (
              <TouchableOpacity onPress={finish} style={[s.btn, { backgroundColor: "#7B4BA8" }]}><Text style={s.btnTxt}>إعلان النتائج ومنح النقاط</Text></TouchableOpacity>
            )}
            {d.can_manage && d.live_status !== "finished" && (
              <TouchableOpacity onPress={async () => { if (await confirmAction("إلغاء المسابقة", "ستختفي المسابقة من القائمة.", "إلغاء المسابقة", true)) { await rewardsApi.editComp(token!, d.id, { status: "cancelled" }).catch(() => {}); onClose(); } }}>
                <Text style={[s.link, { color: Colors.danger, textAlign: "center" }]}>إلغاء المسابقة</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function Info({ icon, t }: { icon: keyof typeof Ionicons.glyphMap; t: string }) {
  return <View style={s.infoRow}><Ionicons name={icon} size={16} color={Colors.primary} /><Text style={s.infoTxt}>{t}</Text></View>;
}
function Field({ label, v, on, ph, multi, ltr, num }: { label: string; v?: string | null; on: (t: string) => void; ph?: string; multi?: boolean; ltr?: boolean; num?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput value={v ?? ""} onChangeText={on} placeholder={ph} placeholderTextColor={Colors.textSubtle} multiline={multi} keyboardType={num ? "numeric" : "default"}
        style={[s.input, multi && { minHeight: 80, textAlignVertical: "top" }, ltr && { textAlign: "left", writingDirection: "ltr" }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  hBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,.2)", alignItems: "center", justifyContent: "center" },
  boardLink: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  boardTxt: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  sec: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  cover: { width: "100%", height: 160, borderRadius: 12, backgroundColor: Colors.bgDeep },
  coverPh: { height: 110, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowB: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  live: { fontFamily: "Cairo_700Bold", fontSize: 11, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  prize: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.accentDeep, textAlign: "right" },
  meta: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  metaTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  done: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary, textAlign: "right" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 50 },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textSecondary },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  btn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  btnTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, textAlign: "right" },
  dHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  dTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  infoBox: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  infoTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  resBox: { backgroundColor: Colors.primary + "12", borderRadius: 16, padding: 16, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.primary + "40" },
  resBig: { fontFamily: "Cairo_700Bold", fontSize: 36, color: Colors.primary },
  resTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "center" },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.divider, overflow: "hidden", transform: [{ scaleX: -1 }] },
  fill: { height: "100%", backgroundColor: Colors.primary },
  qText: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", lineHeight: 36 },
  opt: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  optLetter: { width: 30, height: 30, borderRadius: 15, textAlign: "center", lineHeight: 30, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary, backgroundColor: Colors.primary + "18", overflow: "hidden" },
  optTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  ansRow: { backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10, gap: 2, borderWidth: 1, borderColor: Colors.divider },
  ansQ: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  ansA: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, textAlign: "right" },
  entry: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1.5, borderColor: Colors.divider },
  eRank: { minWidth: 30, fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textMuted, textAlign: "center" },
  eName: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  eScore: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },
  eImg: { width: "100%", height: 200, borderRadius: 10, backgroundColor: Colors.bgDeep },
  pickBox: { height: 230, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.divider, alignItems: "center", justifyContent: "center", gap: 6, overflow: "hidden", padding: 4 },
  mWrap: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.bgAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: "92%", gap: 10 },
  sheetHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  kinds: { flexDirection: "row-reverse", gap: 8 },
  kindBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.divider },
  kindTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  lbl: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  qBox: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  optRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  addQ: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end" },
});
