// قراءة نص من ديوان الكُتّاب: عرض أدبي بحسب الجنس، توثيق، إعجاب، مشاركة، وإجراءات المشرف وطلب المراجعة.
import React, { useCallback, useState } from "react";
import ShareBar from "@/components/lit/ShareBar";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Share, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { litApi, WINE, GOLD, INK, PAPER, fmtDate, type LitText } from "@/lib/lit";
import { LitBody, DocBadge, TextStatus, TextCard, groupColor } from "@/components/lit/ui";
import { ithraaStyles as u } from "@/components/ithraa/ui";
import { AttachmentsCard, LayoutControls, RatioImage, emptyAttach, type AttachState } from "@/components/lit/editor";
import { isLtrText, langMeta, type LitLayout } from "@/lib/lit-markup";

const WEB = "https://hasahisawi.pages.dev";

export default function WritersText() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<{ text: LitText; is_owner: boolean; can_review: boolean; more: LitText[] } | null>(null);
  const [err, setErr] = useState("");
  const [size, setSize] = useState(18);
  const [note, setNote] = useState("");
  const [appealNote, setAppealNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"text" | "tr">("text");
  const [editAtt, setEditAtt] = useState<{ a: AttachState; layout: LitLayout } | null>(null);

  const load = useCallback(async () => {
    try { setErr(""); setD(await litApi.text(Number(id), token)); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/writers" as any));

  if (err) return <View style={st.center}><Text style={st.err}>{err}</Text><Pressable onPress={back} style={[u.ghostBtn, { marginTop: 10 }]}><Text style={u.ghostText}>رجوع</Text></Pressable></View>;
  if (!d) return <View style={st.center}><ActivityIndicator color={WINE} /></View>;
  const t = d.text;
  const c = groupColor(t.group);

  const like = async () => {
    if (!token) return notify("سجّل الدخول", "سجّل الدخول لتُعجب بالنص.");
    try { const r = await litApi.like(token, t.id); setD({ ...d, text: { ...t, liked: r.liked, likes: r.likes } }); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const share = () => Share.share({ message: `✒️ «${t.title}» — ${t.author_name}\n${t.form_label} في ديوان الكُتّاب على حصاحيصاوي\n${WEB}/writers-text?id=${t.id}${t.doc_no ? `\nرقم التوثيق: ${t.doc_no}` : ""}` }).catch(() => {});
  const act = async (action: string) => {
    if (!token) return;
    if (action === "reject" && note.trim().length < 3) return notify("سبب الرفض", "اكتب ملاحظة للكاتب.");
    if (action === "unpublish" && !(await confirmAction("إلغاء النشر", "سيُخفى النص ويعود للمراجعة.", "إلغاء النشر", true))) return;
    setBusy(true);
    try { await litApi.act(token, t.id, action, note.trim() || undefined); setNote(""); await load(); } catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const appeal = async () => {
    if (!token) return;
    try { const r = await litApi.appeal(token, t.id, appealNote.trim()); notify("أُرسل", r.message); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const startEdit = () => setEditAtt({
    a: { ...emptyAttach(), translation: t.translation || "", lang: t.translation_lang || "en", by: t.translation_by || "", imageUrl: t.image_url || "", caption: t.image_caption || "" },
    layout: t.layout || {},
  });
  const saveAtt = async () => {
    if (!token || !editAtt) return;
    const a = editAtt.a;
    setBusy(true);
    try {
      const r = await litApi.updateAttachments(token, t.id, {
        translation: a.translation.trim(), translation_lang: a.lang, translation_by: a.by.trim(),
        image_url: a.imageUrl, image_caption: a.caption.trim(), layout: editAtt.layout,
      });
      setD({ ...d, text: { ...t, ...r.text, liked: t.liked } }); setEditAtt(null); notify("تم", r.message);
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setBusy(false); }
  };
  const hasTr = !!t.translation;
  const trLtr = hasTr && isLtrText(t.translation_lang, t.translation || "");
  const trLabel = langMeta(t.translation_lang)?.label ?? "الترجمة";
  const withdraw = async () => {
    if (!token || !(await confirmAction("سحب النص", "سيُخفى النص من الديوان، ويبقى رقم توثيقه صالحاً للتحقق.", "سحب", true))) return;
    try { await litApi.withdraw(token, t.id); back(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAPER }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <Text style={[st.barTitle, { color: c }]}>{t.form_label}</Text>
        <View style={[u.rowR, { gap: 2 }]}>
          <Pressable onPress={() => setSize((x) => Math.min(24, x + 1))} style={st.barBtn} accessibilityLabel="تكبير"><Text style={st.aa}>أ+</Text></Pressable>
          <Pressable onPress={() => setSize((x) => Math.max(14, x - 1))} style={st.barBtn} accessibilityLabel="تصغير"><Text style={st.aa}>أ−</Text></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
        {t.status !== "approved" && <View style={{ alignSelf: "flex-end", marginBottom: 10 }}><TextStatus status={t.status} /></View>}
        {t.featured && <Text style={st.feat}>★ من مختارات الديوان</Text>}
        <Text style={st.title}>{t.title}</Text>
        {!!t.dedication && <Text style={st.ded}>{t.dedication}</Text>}
        <View style={st.ornament}><View style={st.line} /><Ionicons name="leaf" size={14} color={GOLD} /><View style={st.line} /></View>

        {!!t.image_url && (
          <View style={{ marginBottom: 18 }}>
            <RatioImage uri={t.image_url} label={t.image_caption || `صورة مرفقة بنص ${t.title}`} />
            {!!t.image_caption && <Text style={st.cap}>{t.image_caption}</Text>}
          </View>
        )}

        {hasTr && (
          <View style={st.seg} accessibilityRole="tablist">
            {([["text", "النص"], ["tr", `الترجمة (${trLabel})`]] as const).map(([k, l]) => (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={l}
                style={[st.segBtn, tab === k && st.segOn]}>
                <Text style={[st.segT, tab === k && { color: "#fff" }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {hasTr && tab === "tr" ? (
          <View>
            <Text style={[st.tr, { fontSize: size - 1, lineHeight: (size - 1) * 1.8 }, trLtr ? { textAlign: "left", writingDirection: "ltr" } : { textAlign: "right", writingDirection: "rtl" }]}>{t.translation}</Text>
            {!!t.translation_by && <Text style={st.trBy}>ترجمة: {t.translation_by}</Text>}
          </View>
        ) : (
          <LitBody text={t} size={size} />
        )}

        <View style={[st.ornament, { marginTop: 24 }]}><View style={st.line} /><Ionicons name="ellipse" size={6} color={GOLD} /><View style={st.line} /></View>
        <Pressable onPress={() => router.push({ pathname: "/profile", params: { id: String(t.author_id) } } as any)} style={[u.rowR, { gap: 10, justifyContent: "center" }]}>
          <UserAvatar name={t.author_name} avatarUrl={t.author_avatar} size={40} borderRadius={20} />
          <View>
            <Text style={st.author}>{t.author_name}</Text>
            <Text style={st.date}>{fmtDate(t.published_at || t.created_at)} · {t.words} كلمة</Text>
          </View>
        </Pressable>

        <View style={st.actions}>
          <Pressable onPress={like} style={st.action}><Ionicons name={t.liked ? "heart" : "heart-outline"} size={20} color={t.liked ? "#C0392B" : INK} /><Text style={st.actionT}>{t.likes}</Text></Pressable>
          <View style={st.action}><Ionicons name="eye-outline" size={20} color={INK} /><Text style={st.actionT}>{t.views}</Text></View>
          <Pressable onPress={share} style={st.action}><Ionicons name="share-social-outline" size={20} color={INK} /><Text style={st.actionT}>مشاركة</Text></Pressable>
        </View>

        <ShareBar url={`${WEB}/writers-text?id=${t.id}`} text={`✒️ «${t.title}» — ${t.author_name}\n${t.form_label} في ديوان الكُتّاب على حصاحيصاوي`} title="شارك النص على مواقع التواصل" />
        {d.is_owner && <ShareBar url={`${WEB}/writers?author=${t.author_id}`} text={`اقرأ نصوصي في ديوان الكُتّاب على حصاحيصاوي — ${t.author_name}`} title="شارك ملفك ككاتب (كل نصوصك)" />}
        {!!t.doc_no && (
          <Pressable onPress={() => router.push({ pathname: "/writers-cert", params: { no: t.doc_no! } } as any)} style={st.docBox}>
            <Ionicons name="shield-checkmark" size={22} color={WINE} />
            <View style={{ flex: 1 }}>
              <Text style={st.docT}>نص موثّق بتعهّد الأصالة</Text>
              <Text style={st.docS}>{fmtDate(t.pledge_at, true)} · اضغط لعرض الشهادة والتحقق</Text>
            </View>
            <DocBadge no={t.doc_no} />
          </Pressable>
        )}

        {d.is_owner && t.status === "rejected" && !!t.review_note && <View style={st.box}><Text style={st.boxT}>ملاحظة المشرف: {t.review_note}</Text></View>}
        {d.is_owner && t.status === "ai_flagged" && !t.appeal && (
          <View style={st.box}>
            <Text style={[st.boxT, { fontFamily: "Cairo_700Bold" }]}>رجّح الفحص الآلي ({t.ai_score}%) أن النص مولّد بالذكاء الاصطناعي:</Text>
            {(t.ai_signals || []).map((s, i) => <Text key={i} style={st.boxT}>• {s.label}</Text>)}
            <TextInput value={appealNote} onChangeText={setAppealNote} multiline placeholder="اشرح كيف كتبت النص لطلب مراجعة بشرية…" placeholderTextColor={Colors.textMuted} style={[u.input, { minHeight: 64, marginTop: 8, textAlignVertical: "top" }]} />
            <Pressable onPress={appeal} style={[u.primaryBtn, { backgroundColor: "#9B2C2C", marginTop: 8 }]}><Text style={u.primaryText}>طلب مراجعة بشرية</Text></Pressable>
          </View>
        )}

        {d.can_review && t.status !== "contest" && (
          <View style={[u.card, { marginTop: 16 }]}>
            <View style={[u.rowR, { gap: 6 }]}><Ionicons name="shield-checkmark" size={18} color={WINE} /><Text style={st.h}>المراجعة</Text></View>
            <View style={[u.rowR, { gap: 6, marginTop: 8, flexWrap: "wrap" }]}>
              <Text style={st.meta}>فحص الأصالة: {t.ai_score ?? 0}% ({t.ai_verdict === "ai" ? "آلي مرجّح" : t.ai_verdict === "review" ? "يحتاج تدقيقاً" : "بشري مرجّح"})</Text>
              {t.pasted_ratio != null && <Text style={st.meta}>· ملصوق {Math.round((t.pasted_ratio || 0) * 100)}%</Text>}
            </View>
            {(t.ai_signals || []).map((s, i) => <Text key={i} style={st.signal}>• {s.label}</Text>)}
            {t.appeal && !!t.appeal_note && <Text style={[st.signal, { color: "#2B6CB0" }]}>اعتراض الكاتب: {t.appeal_note}</Text>}
            {t.status !== "approved" && <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة للكاتب (إلزامية عند الرفض)" placeholderTextColor={Colors.textMuted} multiline style={[u.input, { marginTop: 8, minHeight: 56, textAlignVertical: "top" }]} />}
            <View style={[u.rowR, { gap: 8, marginTop: 10, flexWrap: "wrap" }]}>
              {t.status !== "approved" && <Btn l="موافقة ونشر" i="checkmark-circle" c="#0E8A5F" on={() => act("approve")} busy={busy} />}
              {(t.status === "pending" || t.status === "ai_flagged") && <Btn l="رفض" i="close-circle" c="#C0392B" on={() => act("reject")} busy={busy} />}
              {t.status === "approved" && <Btn l={t.featured ? "إلغاء التمييز" : "تمييز"} i="star" c={GOLD} on={() => act(t.featured ? "unfeature" : "feature")} busy={busy} />}
              {t.status === "approved" && <Btn l="إلغاء النشر" i="eye-off" c="#B7791F" on={() => act("unpublish")} busy={busy} />}
            </View>
          </View>
        )}

        {d.is_owner && !["contest", "withdrawn"].includes(t.status) && (editAtt ? (
          <View style={[u.card, { marginTop: 16, backgroundColor: "#FFFDF8" }]}>
            <Text style={st.h}>مرفقات النص وتنسيق عرضه</Text>
            <Text style={[u.hint, { marginTop: 2 }]}>متن النص موثّق ولا يتغيّر؛ يمكنك تعديل الترجمة والصورة وطريقة العرض.</Text>
            <LayoutControls value={editAtt.layout} onChange={(layout) => setEditAtt({ ...editAtt, layout })} />
            <AttachmentsCard token={token} value={editAtt.a} onChange={(a) => setEditAtt({ ...editAtt, a })} defaultBy={t.author_name} initiallyOpen />
            <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
              <Pressable onPress={saveAtt} disabled={busy} style={[u.primaryBtn, { flex: 1, backgroundColor: WINE, opacity: busy ? 0.7 : 1 }]} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}<Text style={u.primaryText}>حفظ</Text>
              </Pressable>
              <Pressable onPress={() => setEditAtt(null)} style={[u.ghostBtn, { minHeight: 48, paddingHorizontal: 18 }]} accessibilityRole="button"><Text style={u.ghostText}>إلغاء</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={startEdit} style={[u.ghostBtn, { marginTop: 16, minHeight: 44, borderColor: WINE + "55" }]} accessibilityRole="button" accessibilityLabel="تعديل مرفقات النص وتنسيقه">
            <Ionicons name="attach" size={16} color={WINE} /><Text style={[u.ghostText, { color: WINE }]}>{t.image_url || hasTr ? "تعديل المرفقات والتنسيق" : "إضافة ترجمة أو صورة"}</Text>
          </Pressable>
        ))}

        {d.is_owner && !["contest", "withdrawn"].includes(t.status) && (
          <Pressable onPress={withdraw} style={[u.ghostBtn, { marginTop: 14, borderColor: "#C0392B55" }]}>
            <Ionicons name="archive-outline" size={16} color="#C0392B" /><Text style={[u.ghostText, { color: "#C0392B" }]}>سحب النص من الديوان</Text>
          </Pressable>
        )}

        {d.more.length > 0 && (
          <>
            <Text style={[st.h, { marginTop: 24, marginBottom: 10 }]}>من نصوص {t.author_name}</Text>
            {d.more.map((m) => <TextCard key={m.id} t={m} onPress={() => router.push({ pathname: "/writers-text", params: { id: String(m.id) } } as any)} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Btn({ l, i, c, on, busy }: { l: string; i: keyof typeof Ionicons.glyphMap; c: string; on: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={on} disabled={busy} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: c + "55", backgroundColor: c + "14", opacity: busy ? 0.6 : 1 }}>
      <Ionicons name={i} size={15} color={c} /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12.5, color: c }}>{l}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: PAPER, padding: 24 },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#E9DFCC", backgroundColor: PAPER },
  barBtn: { minWidth: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  aa: { fontFamily: "Cairo_700Bold", fontSize: 14, color: INK },
  cap: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#6B5B4B", textAlign: "center", marginTop: 6, fontStyle: "italic" },
  seg: { flexDirection: "row-reverse", alignSelf: "center", backgroundColor: "#F1E8D8", borderRadius: 14, padding: 3, marginBottom: 16, gap: 3 },
  segBtn: { minHeight: 40, paddingHorizontal: 16, borderRadius: 11, justifyContent: "center" },
  segOn: { backgroundColor: WINE },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: INK },
  tr: { fontFamily: "Cairo_400Regular", color: INK },
  trBy: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: WINE, textAlign: "center", marginTop: 14 },
  feat: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GOLD, textAlign: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 26, color: INK, textAlign: "center", lineHeight: 40 },
  ded: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#8A7A6A", textAlign: "center", fontStyle: "italic", marginTop: 2 },
  ornament: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16, justifyContent: "center" },
  line: { height: 1, width: 60, backgroundColor: GOLD + "88" },
  author: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE, textAlign: "right" },
  date: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A7A6A", textAlign: "right" },
  actions: { flexDirection: "row-reverse", justifyContent: "center", gap: 26, marginTop: 18, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E9DFCC" },
  action: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  actionT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: INK },
  docBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 16, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: GOLD + "55", padding: 12 },
  docT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: INK, textAlign: "right" },
  docS: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A7A6A", textAlign: "right" },
  box: { marginTop: 14, backgroundColor: "#FDF2F2", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#F5C2C2", gap: 2 },
  boxT: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#7A2E2E", textAlign: "right", lineHeight: 20 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: INK, textAlign: "right" },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  signal: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#7A2E2E", textAlign: "right", lineHeight: 19 },
});
