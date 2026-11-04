// كتابة نص أدبي (أو مشاركة في المسابقة): اختيار الجنس، محرر بمسودة تلقائية، تعهّد الأصالة،
// ثم التوثيق برقم خاص — أو بيان نتيجة الفحص الآلي مع إمكانية طلب مراجعة بشرية.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { litApi, LitError, WINE, GOLD, INK, PAPER, type LitMeta, type Contest, type Pledge } from "@/lib/lit";
import { PledgeBox, LitBody, groupColor } from "@/components/lit/ui";
import { Pill, ithraaStyles as u } from "@/components/ithraa/ui";
import { useRichEditor, EditorToolbar, CounterChip, AttachmentsCard, RatioImage, emptyAttach, attachPayload, type AttachState } from "@/components/lit/editor";
import { stripMarkup, isLtrText, langMeta, type LitLayout } from "@/lib/lit-markup";

const DRAFT_KEY = "lit_draft_v1";

export default function ComposeScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ form?: string; contest?: string }>();
  const contestId = params.contest ? Number(params.contest) : null;
  const [meta, setMeta] = useState<LitMeta | null>(null);
  const [contest, setContest] = useState<Contest | null>(null);
  const [form, setForm] = useState(String(params.form || ""));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pen, setPen] = useState("");
  const [dedication, setDedication] = useState("");
  const [pledge, setPledge] = useState<Pledge>({ original: false, not_copied: false, no_ai: false, unpublished: false, signature: (user as any)?.name || "" });
  const [preview, setPreview] = useState(false);
  const [layout, setLayout] = useState<LitLayout>({});
  const [attach, setAttach] = useState<AttachState>(emptyAttach());
  const [pvTab, setPvTab] = useState<"text" | "tr">("text");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ doc_no: string; id: number; message: string; code?: string } | null>(null);
  const [flagged, setFlagged] = useState<{ id: number; score: number; signals: string[] } | null>(null);
  const [appealNote, setAppealNote] = useState("");
  const tele = useRef({ pasted: 0, typed: 0, started: 0, active: 0, last: 0 });
  const prevLen = useRef(0);

  useEffect(() => {
    litApi.meta(token).then(setMeta).catch(() => {});
    if (contestId) litApi.contest(contestId, token).then((d) => { setContest(d.contest); if (!params.form && d.contest.categories[0]) setForm(d.contest.categories[0].key); }).catch((e) => notify("تعذّر التحميل", e?.message));
    else AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        if (d.body && !params.form) {
          setForm(d.form || ""); setTitle(d.title || ""); setBody(d.body); setPen(d.pen || ""); prevLen.current = d.body.length;
          if (d.layout && typeof d.layout === "object") setLayout(d.layout);
          if (d.attach && typeof d.attach === "object") setAttach({ ...emptyAttach(), ...d.attach });
        }
      } catch {}
    }).catch(() => {});
  }, [contestId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // مسودة تلقائية (خارج المسابقة)
  useEffect(() => {
    if (contestId || done) return;
    const t = setTimeout(() => { AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ form, title, body, pen, layout, attach })).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [form, title, body, pen, layout, attach, contestId, done]);

  const forms = useMemo(() => {
    const all = meta?.forms ?? [];
    return contest ? all.filter((f) => contest.categories.some((c) => c.key === f.key)) : all;
  }, [meta, contest]);
  const f = forms.find((x) => x.key === form);
  const c = f ? groupColor(f.group) : WINE;
  // الحدود والعدّاد على النص الصافي (بلا علامات التنسيق) — كما يفحصها الخادم
  const plain = useMemo(() => stripMarkup(body), [body]);
  const len = plain.length;
  const lineCount = plain.split("\n").filter((l) => l.trim()).length;

  const onBody = (t: string) => {
    const now = Date.now();
    const delta = t.length - prevLen.current;
    if (delta > 25) tele.current.pasted += delta;
    else if (delta > 0) tele.current.typed += delta;
    if (!tele.current.started) tele.current.started = now;
    // نحسب وقت الكتابة الفعلي (فجوات أطول من دقيقتين لا تُحتسب)
    if (tele.current.last && now - tele.current.last < 120000) tele.current.active += now - tele.current.last;
    tele.current.last = now;
    prevLen.current = t.length;
    setBody(t);
  };
  // إدراجات شريط الأدوات/التراجع لا تُحتسب كتابة ولا لصقاً
  const onTool = (t: string) => { prevLen.current = t.length; setBody(t); };
  const ed = useRichEditor(body, onBody, onTool);

  const check = (): string | null => {
    if (!f) return "اختر جنس النص";
    if (title.trim().length < 2) return "اكتب عنواناً للنص";
    if (len < f.min) return `النص قصير على «${f.label}» — ${f.min} حرفاً على الأقل (الآن ${len})`;
    if (len > f.max) return `النص أطول من المسموح (${f.max} حرف)`;
    if (f.lines && (lineCount < f.lines[0] || lineCount > f.lines[1])) return f.key === "haiku" ? "الهايكو ثلاثة أسطر" : `يحتاج ${f.lines[0]} أسطر على الأقل`;
    if (!pledge.original || !pledge.not_copied || !pledge.no_ai || (contest && !pledge.unpublished)) return "أقرّ بجميع بنود تعهّد الأصالة";
    if (pledge.signature.trim().length < 3) return "وقّع باسمك الكامل";
    return null;
  };

  const submit = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول لتوثيق نصك.");
    const err = check();
    if (err) return notify("قبل التوثيق", err);
    setSaving(true); setFlagged(null);
    const telemetry = { pasted_chars: tele.current.pasted, typed_chars: tele.current.typed, compose_seconds: Math.round(tele.current.active / 1000) };
    try {
      if (contestId) {
        const r = await litApi.enter(token, contestId, { form, title: title.trim(), body, pen_name: pen.trim(), pledge, telemetry });
        setDone({ doc_no: r.entry.doc_no, id: r.entry.text_id, message: r.message, code: r.entry.code });
      } else {
        const hasLayout = Object.keys(layout).length > 0;
        const r = await litApi.create(token, { form, title: title.trim(), body, pen_name: pen.trim(), dedication: dedication.trim(), pledge, telemetry, ...attachPayload(attach), layout: hasLayout ? layout : undefined });
        setDone({ doc_no: r.text.doc_no!, id: r.text.id, message: r.message });
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      }
    } catch (e: any) {
      if (e instanceof LitError && e.code === "ai_flagged") setFlagged({ id: e.data.id, score: e.data.score, signals: e.data.signals || [] });
      else notify("تعذّر التوثيق", e?.message || "حاول مرة أخرى");
    } finally { setSaving(false); }
  };

  const appeal = async () => {
    if (!token || !flagged) return;
    try {
      const r = await litApi.appeal(token, flagged.id, appealNote.trim());
      notify("أُرسل الطلب", r.message);
      router.replace({ pathname: "/writers", params: { tab: "mine" } } as any);
    } catch (e: any) { notify("تعذّر الإرسال", e?.message); }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/writers" as any));

  if (done) return (
    <View style={[st.center, { paddingTop: insets.top + 30, backgroundColor: PAPER }]}>
      <View style={st.seal}><Ionicons name="ribbon" size={44} color={GOLD} /></View>
      <Text style={st.doneTitle}>{contestId ? "وصلت مشاركتك" : "وُثّق نصك"}</Text>
      <Text style={st.doneSub}>{done.message}</Text>
      <View style={st.docCard}>
        <Text style={st.docLabel}>رقم التوثيق</Text>
        <Text style={st.docNo}>{done.doc_no}</Text>
        {!!done.code && <><Text style={[st.docLabel, { marginTop: 10 }]}>رمز المشاركة السري</Text><Text style={[st.docNo, { fontSize: 20 }]}>{done.code}</Text></>}
        <Text style={st.docHint}>احتفظ بهذا الرقم — يثبت تأليفك للنص وتاريخه، ويمكن لأي شخص التحقق منه.</Text>
      </View>
      <Pressable onPress={() => router.replace({ pathname: "/writers-cert", params: { no: done.doc_no } } as any)} style={[u.primaryBtn, { backgroundColor: WINE, alignSelf: "stretch", marginTop: 16 }]}>
        <Ionicons name="document-text" size={18} color="#fff" /><Text style={u.primaryText}>عرض شهادة التوثيق</Text>
      </Pressable>
      <Pressable onPress={() => router.replace(contestId ? ({ pathname: "/lit-contest", params: { id: String(contestId) } } as any) : ({ pathname: "/writers", params: { tab: "mine" } } as any))} style={[u.ghostBtn, { alignSelf: "stretch", marginTop: 10 }]}>
        <Text style={u.ghostText}>{contestId ? "العودة للمسابقة" : "نصوصي"}</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: PAPER }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.barTitle} numberOfLines={1}>{contest ? `مشاركة · ${contest.title}` : "نص جديد"}</Text>
          {!contest && <Text style={st.barSub}>تُحفظ مسودتك تلقائياً</Text>}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setPreview((p) => !p)} style={st.barBtn} hitSlop={8} accessibilityLabel="معاينة">
          <Ionicons name={preview ? "create-outline" : "eye-outline"} size={21} color={INK} />
        </Pressable>
      </View>

      {!preview && !!f && (
        <EditorToolbar ed={ed} layout={layout} onLayout={setLayout} counter={<CounterChip body={body} min={f.min} max={f.max} lines={f.lines} />} />
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {contest && (
          <View style={st.contestNote}>
            <Ionicons name="eye-off-outline" size={16} color={WINE} />
            <Text style={st.contestNoteT}>التحكيم سري: تُعرض مشاركتك على اللجنة برمز دون اسمك. لا تكتب اسمك داخل النص.{contest.theme ? ` محور الدورة: ${contest.theme}.` : ""}</Text>
          </View>
        )}

        {flagged && (
          <View style={st.flag}>
            <View style={[u.rowR, { gap: 8 }]}><Ionicons name="hardware-chip-outline" size={20} color="#9B2C2C" /><Text style={st.flagTitle}>لم يُوثَّق النص</Text></View>
            <Text style={st.flagT}>رجّح الفحص الآلي ({flagged.score}%) أن النص مولَّد بالذكاء الاصطناعي، للأسباب التالية:</Text>
            {flagged.signals.map((sg, i) => <Text key={i} style={st.flagT}>• {sg}</Text>)}
            <Text style={[st.flagT, { marginTop: 6 }]}>الفحص الآلي احتمالي وقد يخطئ. إن كنت كتبت النص بنفسك، اشرح للمشرف كيف كتبته ليراجعه بشرياً:</Text>
            <TextInput value={appealNote} onChangeText={setAppealNote} multiline placeholder="مثال: كتبتها في دفتري قبل أسبوع ثم نسختها هنا…" placeholderTextColor={Colors.textMuted} style={[u.input, { minHeight: 70, textAlignVertical: "top", marginTop: 6 }]} />
            <Pressable onPress={appeal} style={[u.primaryBtn, { backgroundColor: "#9B2C2C", marginTop: 8 }]}><Text style={u.primaryText}>طلب مراجعة بشرية</Text></Pressable>
          </View>
        )}

        <Text style={u.label}>جنس النص</Text>
        {(["story", "poetry", "prose"] as const).map((g) => {
          const list = forms.filter((x) => x.group === g);
          if (!list.length) return null;
          return (
            <View key={g} style={{ marginBottom: 8 }}>
              <Text style={[st.groupLbl, { color: groupColor(g) }]}>{meta?.groups.find((x) => x.key === g)?.label}</Text>
              <View style={u.wrap}>{list.map((x) => <Pill key={x.key} label={x.label} on={form === x.key} onPress={() => setForm(x.key)} color={groupColor(g)} />)}</View>
            </View>
          );
        })}
        {!!f && <Text style={[u.hint, { color: c }]}>✦ {f.hint}</Text>}
        {!!f?.about && (
          <View style={[st.paper, { marginTop: 8, borderColor: c + "55" }]}>
            <Text style={[u.hint, { color: c, fontFamily: "Cairo_700Bold" }]}>{f.innovative ? "✧ فنّ مبتكر في ديوان الكُتّاب" : "عن هذا الصنف"}</Text>
            <Text style={[u.hint, { marginTop: 4, lineHeight: 22 }]}>{f.about}</Text>
            {!!f.example && (
              <View style={{ marginTop: 10 }}>
                <Text style={[st.pTitle, { fontSize: 16 }]}>{f.example.title}</Text>
                <View style={{ marginTop: 6 }}><LitBody text={{ form: f.key, group: f.group, body: f.example.body }} /></View>
              </View>
            )}
          </View>
        )}

        {preview && f ? (
          <View style={st.paper}>
            <Text style={st.pTitle}>{title || "بلا عنوان"}</Text>
            {!!dedication && <Text style={st.pDed}>{dedication}</Text>}
            {!contest && !!attach.imageUrl && <View style={{ marginTop: 12 }}><RatioImage uri={attach.imageUrl} />{!!attach.caption && <Text style={st.pCap}>{attach.caption}</Text>}</View>}
            {!contest && !!attach.translation.trim() && (
              <View style={[u.rowR, { gap: 8, justifyContent: "center", marginTop: 12 }]}>
                <Pill label="النص" on={pvTab === "text"} onPress={() => setPvTab("text")} color={WINE} />
                <Pill label={`الترجمة (${langMeta(attach.lang)?.label ?? ""})`} on={pvTab === "tr"} onPress={() => setPvTab("tr")} color={WINE} />
              </View>
            )}
            {pvTab === "tr" && !contest && attach.translation.trim() ? (
              <Text style={[st.pTr, isLtrText(attach.lang, attach.translation) ? { textAlign: "left", writingDirection: "ltr" } : { textAlign: "right", writingDirection: "rtl" }]}>{attach.translation.trim()}</Text>
            ) : (
              <View style={{ marginTop: 14 }}><LitBody text={{ form: f.key, group: f.group, body, layout }} /></View>
            )}
            <Text style={st.pAuthor}>— {pen || pledge.signature || "الكاتب"}</Text>
          </View>
        ) : (
          <>
            <TextInput value={title} onChangeText={setTitle} placeholder="العنوان" placeholderTextColor="#B5A898" style={st.titleIn} maxLength={160} />
            {!contest && <TextInput value={dedication} onChangeText={setDedication} placeholder="إهداء (اختياري)" placeholderTextColor="#B5A898" style={st.dedIn} maxLength={200} />}
            <TextInput
              ref={ed.inputRef} value={body} onChangeText={ed.onChangeText} onSelectionChange={ed.onSelectionChange} selection={ed.selection}
              multiline textAlignVertical="top" scrollEnabled={false} accessibilityLabel="متن النص"
              placeholder={f?.group === "poetry" ? (f.key === "classical" ? "صدر البيت *** عجز البيت\nصدر البيت *** عجز البيت" : "كل سطر في سطر مستقل…") : "ابدأ الكتابة…"}
              placeholderTextColor="#B5A898"
              style={[st.bodyIn, f?.group === "poetry" && { textAlign: "center" }, layout.align === "center" && { textAlign: "center" }, layout.align === "right" && { textAlign: "right" }]}
            />
            <Text style={[u.hint, { marginTop: 6 }]}>التنسيق: **غامق** · _مائل_ · ==تظليل== · ~~مشطوب~~ · سطر *** فاصل. لا يُحتسب التنسيق في عدد الأحرف ولا في فحص الأصالة.</Text>
          </>
        )}

        {!contest && !!f && (
          <AttachmentsCard token={token} value={attach} onChange={setAttach} defaultBy={pen || pledge.signature || ""} maxTranslation={f.max * 2} />
        )}

        <Text style={u.label}>الاسم الأدبي (اختياري)</Text>
        <TextInput value={pen} onChangeText={setPen} placeholder="يظهر بدلاً من اسم الحساب" placeholderTextColor={Colors.textMuted} style={u.input} maxLength={80} />

        <View style={{ marginTop: 18 }}><PledgeBox value={pledge} onChange={setPledge} contest={!!contest} /></View>

        <Pressable onPress={submit} disabled={saving} style={[u.primaryBtn, { marginTop: 18, backgroundColor: WINE, opacity: saving ? 0.7 : 1 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="shield-checkmark" size={18} color="#fff" />}
          <Text style={u.primaryText}>{saving ? "جارٍ الفحص والتوثيق…" : contest ? "توثيق وإرسال المشاركة" : "توثيق النص وإرساله"}</Text>
        </Pressable>
        <Text style={[u.hint, { textAlign: "center", marginTop: 8 }]}>يُفحص النص آلياً للنسخ ولأسلوب الذكاء الاصطناعي، ثم يراجعه المشرف قبل النشر.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", padding: 24 },
  bar: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: PAPER, borderBottomWidth: 1, borderBottomColor: "#E9DFCC" },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: INK, textAlign: "center" },
  barSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A7A6A", textAlign: "center" },
  contestNote: { flexDirection: "row-reverse", gap: 8, backgroundColor: WINE + "0D", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: WINE + "30" },
  contestNoteT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: INK, textAlign: "right", lineHeight: 20 },
  flag: { backgroundColor: "#FDF2F2", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#F5C2C2", marginBottom: 6, gap: 3 },
  flagTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#9B2C2C" },
  flagT: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#7A2E2E", textAlign: "right", lineHeight: 20 },
  groupLbl: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "right", marginBottom: 4 },
  titleIn: { marginTop: 16, fontFamily: "Cairo_700Bold", fontSize: 22, color: INK, textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#E9DFCC", paddingVertical: 8 },
  dedIn: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: "#6B5B4B", textAlign: "right", paddingVertical: 8, fontStyle: "italic" },
  bodyIn: { minHeight: 300, marginTop: 8, fontFamily: "Cairo_400Regular", fontSize: 17, lineHeight: 34, color: INK, textAlign: "right", backgroundColor: "#FFFDF8", borderRadius: 14, borderWidth: 1, borderColor: "#EFE5D2", padding: 14 },
  pCap: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#6B5B4B", textAlign: "center", marginTop: 6, fontStyle: "italic" },
  pTr: { marginTop: 14, fontFamily: "Cairo_400Regular", fontSize: 16, lineHeight: 30, color: INK },
  paper: { marginTop: 14, backgroundColor: "#FFFDF8", borderRadius: 16, borderWidth: 1, borderColor: "#EFE5D2", padding: 20 },
  pTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: INK, textAlign: "center" },
  pDed: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#8A7A6A", textAlign: "center", fontStyle: "italic", marginTop: 4 },
  pAuthor: { fontFamily: "Cairo_700Bold", fontSize: 14, color: WINE, textAlign: "left", marginTop: 16 },
  seal: { width: 90, height: 90, borderRadius: 45, backgroundColor: WINE, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: GOLD },
  doneTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: INK, marginTop: 14 },
  doneSub: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: "#6B5B4B", textAlign: "center", marginTop: 4, lineHeight: 22 },
  docCard: { alignSelf: "stretch", marginTop: 18, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: GOLD + "66", padding: 18, alignItems: "center" },
  docLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#8A7A6A" },
  docNo: { fontFamily: "Cairo_700Bold", fontSize: 22, color: WINE, letterSpacing: 1, marginTop: 2 },
  docHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A7A6A", textAlign: "center", marginTop: 10, lineHeight: 19 },
});
