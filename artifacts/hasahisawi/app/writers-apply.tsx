// استمارة العضوية الاحترافية — 4 خطوات: الفئة، البيانات، الأعمال الثلاثة (مع تعهّد لكل عمل)، الإقرار والتوقيع.
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { membersApi, REF_KEY, type MemberCategory, type MembershipMe } from "@/lib/lit-members";
import { WINE, INK } from "@/lib/lit";
import { Pill, ithraaStyles as u } from "@/components/ithraa/ui";

type W = { type: "diwan" | "external"; text_id?: number; title: string; kind: string; where: string; year: string; link: string; excerpt: string; pledged: boolean };
const emptyWork = (): W => ({ type: "diwan", title: "", kind: "", where: "", year: "", link: "", excerpt: "", pledged: false });
const STEPS = ["الفئة", "البيانات", "الأعمال", "التعهّد"];
const GENRES = ["الشعر الفصيح", "الشعر العامي", "القصة القصيرة", "الرواية", "الخاطرة", "المقال", "النقد", "أدب الطفل", "المسرح", "التحقيق الصحفي", "الخبر", "التصوير الصحفي"];

export default function ApplyScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [cats, setCats] = useState<MemberCategory[]>([]);
  const [me, setMe] = useState<MembershipMe | null>(null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    category: "", tier: "professional", full_name: (user as any)?.name || "", pen_name: "", phone: "", email: "", city: "الحصاحيصا", birth_year: "",
    bio: "", genres: [] as string[], publications: "", press_org: "", press_role: "", press_card_no: "", press_years: "",
  });
  const [works, setWorks] = useState<W[]>([emptyWork(), emptyWork(), emptyWork()]);
  const [pledge, setPledge] = useState({ own_works: false, accurate: false, charter: false, signature: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    membersApi.meta().then((m) => setCats(m.categories)).catch(() => {});
    if (token) membersApi.me(token).then((x) => {
      setMe(x);
      if (!x.my_texts.length) setWorks((ws) => ws.map((w) => ({ ...w, type: "external" })));
      const p = x.member;
      if (p) setF((o) => ({ ...o, category: p.category, tier: p.tier === "affiliate" ? "affiliate" : "professional", full_name: p.full_name, pen_name: p.pen_name || "", phone: p.phone || "", email: p.email || "", city: p.city || "", bio: p.bio || "", genres: p.genres, publications: p.publications || "", press_org: p.press_org || "", press_role: p.press_role || "", press_card_no: p.press_card_no || "" }));
    }).catch(() => {});
  }, [token]);

  const journalist = f.category === "journalist";
  const cat = cats.find((c) => c.key === f.category);
  const color = cat?.color || WINE;
  const setWork = (i: number, patch: Partial<W>) => setWorks((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const validate = (s: number): string | null => {
    if (s === 0 && !f.category) return "اختر فئة العضوية";
    if (s === 1) {
      if (f.full_name.trim().split(/\s+/).length < 2) return "اكتب اسمك الكامل";
      if (f.phone.replace(/\D/g, "").length < 9) return "رقم الهاتف مطلوب";
      if (f.bio.trim().length < 40) return "النبذة التعريفية 40 حرفاً على الأقل";
      if (journalist && (f.press_org.trim().length < 2 || f.press_role.trim().length < 2)) return "اذكر المؤسسة الإعلامية وصفتك المهنية";
    }
    if (s === 2) {
      for (const [i, w] of works.entries()) {
        if (w.type === "diwan" && !w.text_id) return `اختر نصاً للعمل ${i + 1}`;
        if (w.type === "external") {
          if (w.title.trim().length < 2) return `اكتب عنوان العمل ${i + 1}`;
          if (!w.link.trim() && w.excerpt.trim().length < 80) return `أضف رابطاً أو مقتطفاً (80 حرفاً) للعمل ${i + 1}`;
          if (w.link.trim() && !/^https:\/\/\S+$/i.test(w.link.trim())) return `رابط العمل ${i + 1} يجب أن يبدأ بـ https://`;
        }
        if (!w.pledged) return `تعهّد بملكية العمل ${i + 1}`;
      }
      const ids = works.filter((w) => w.type === "diwan").map((w) => w.text_id);
      if (new Set(ids).size !== ids.length) return "لا تكرر النص نفسه";
    }
    if (s === 3 && (!pledge.own_works || !pledge.accurate || !pledge.charter || pledge.signature.trim().length < 3)) return "أقرّ بجميع البنود ووقّع باسمك";
    return null;
  };
  const next = () => { const e = validate(step); if (e) return notify("أكمل البيانات", e); setStep(step + 1); };
  const submit = async () => {
    for (let s = 0; s < 4; s++) { const e = validate(s); if (e) { setStep(s); return notify("أكمل البيانات", e); } }
    setSaving(true);
    try {
      const ref = await AsyncStorage.getItem(REF_KEY).catch(() => null);
      const r = await membersApi.apply(token!, {
        ...f, birth_year: Number(f.birth_year) || null, press_years: Number(f.press_years) || null, ref: Number(ref) || null,
        works: works.map((w) => (w.type === "diwan" ? { type: "diwan", text_id: w.text_id, pledged: w.pledged } : { type: "external", title: w.title, kind: w.kind, where: w.where, year: Number(w.year) || null, link: w.link.trim(), excerpt: w.excerpt.trim(), pledged: w.pledged })),
        pledge,
      });
      notify("أُرسلت الاستمارة", r.message);
      router.replace("/writers-membership" as any);
    } catch (e: any) { notify("تعذّر الإرسال", e?.message); } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" onPress={() => (step ? setStep(step - 1) : router.canGoBack() ? router.back() : router.replace("/writers-membership" as any))} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={INK} />
        </Pressable>
        <Text style={st.barTitle}>استمارة العضوية</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={st.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={st.step}>
            <View style={[st.dot, i <= step && { backgroundColor: color, borderColor: color }]}>{i < step ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={[st.dotT, i === step && { color: "#fff" }]}>{i + 1}</Text>}</View>
            <Text style={[st.stepT, i === step && { color }]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Text style={st.lead}>اختر الفئة التي تمثّل عطاءك. تظهر على بطاقتك بلونها الخاص.</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {cats.map((c) => {
                const on = f.category === c.key;
                return (
                  <Pressable key={c.key} onPress={() => set("category", c.key)} style={[st.cat, on && { borderColor: c.color, backgroundColor: c.color + "0D" }]}>
                    <View style={[st.catI, { backgroundColor: c.color }]}><Ionicons name={c.icon as any} size={22} color={c.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.catT}>{c.label}</Text>
                      <Text style={u.hint}>{c.key === "journalist" ? "عضوية خاصة للصحفيين والإعلاميين والمراسلين — تُدرج في دليل الإعلاميين" : c.title}</Text>
                    </View>
                    <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? c.color : Colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
            {!!f.category && !journalist && (
              <>
                <Text style={u.label}>نوع العضوية</Text>
                <View style={[u.rowR, { gap: 8 }]}>
                  <Pill label="احترافية" on={f.tier === "professional"} onPress={() => set("tier", "professional")} color={color} icon="ribbon-outline" />
                  <Pill label="منتسب" on={f.tier === "affiliate"} onPress={() => set("tier", "affiliate")} color={color} icon="person-outline" />
                </View>
                <Text style={[u.hint, { marginTop: 6 }]}>كلتاهما تتطلب ثلاثة أعمال. الاحترافية لمن له تجربة نشر سابقة.</Text>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Field l="الاسم الكامل *" v={f.full_name} on={(t) => set("full_name", t)} />
            <Field l="الاسم الأدبي / المستعار" v={f.pen_name} on={(t) => set("pen_name", t)} p="يظهر على البطاقة" />
            <View style={[u.rowR, { gap: 8 }]}>
              <View style={{ flex: 1 }}><Field l="الهاتف *" v={f.phone} on={(t) => set("phone", t)} k="phone-pad" /></View>
              <View style={{ flex: 1 }}><Field l="سنة الميلاد" v={f.birth_year} on={(t) => set("birth_year", t.replace(/\D/g, "").slice(0, 4))} k="number-pad" /></View>
            </View>
            <View style={[u.rowR, { gap: 8 }]}>
              <View style={{ flex: 1 }}><Field l="المدينة" v={f.city} on={(t) => set("city", t)} /></View>
              <View style={{ flex: 1 }}><Field l="البريد" v={f.email} on={(t) => set("email", t)} k="email-address" /></View>
            </View>
            {journalist && (
              <View style={st.press}>
                <View style={[u.rowR, { gap: 6 }]}><Ionicons name="newspaper" size={18} color="#E11D48" /><Text style={st.pressT}>بيانات العضوية الصحفية</Text></View>
                <Field l="المؤسسة الإعلامية / الصحيفة *" v={f.press_org} on={(t) => set("press_org", t)} />
                <View style={[u.rowR, { gap: 8 }]}>
                  <View style={{ flex: 1 }}><Field l="الصفة المهنية *" v={f.press_role} on={(t) => set("press_role", t)} p="محرر، مراسل…" /></View>
                  <View style={{ flex: 1 }}><Field l="سنوات الخبرة" v={f.press_years} on={(t) => set("press_years", t.replace(/\D/g, "").slice(0, 2))} k="number-pad" /></View>
                </View>
                <Field l="رقم بطاقة النقابة / القيد الصحفي (إن وُجد)" v={f.press_card_no} on={(t) => set("press_card_no", t)} />
              </View>
            )}
            <Text style={u.label}>مجالات الكتابة</Text>
            <View style={u.wrap}>{GENRES.map((g) => <Pill key={g} label={g} on={f.genres.includes(g)} color={color} onPress={() => set("genres", f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g])} />)}</View>
            <Field l="نبذة تعريفية *" v={f.bio} on={(t) => set("bio", t)} multi p="تجربتك، بداياتك، ما يميز قلمك…" />
            <Field l="إصدارات ومنشورات سابقة" v={f.publications} on={(t) => set("publications", t)} multi p="كتب، دواوين، صحف ومجلات نشرت فيها، جوائز…" />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={st.lead}>أرفق ثلاثة أعمال تمثّل قلمك. يمكنك اختيار نصوصك الموثّقة في الديوان، أو إضافة أعمال منشورة خارجه برابط أو مقتطف.</Text>
            {works.map((w, i) => (
              <View key={i} style={[st.work, { borderColor: w.pledged ? color + "66" : Colors.divider }]}>
                <View style={[u.rowR, { justifyContent: "space-between" }]}>
                  <Text style={[st.workN, { color }]}>العمل {i + 1}</Text>
                  <View style={[u.rowR, { gap: 6 }]}>
                    <Pill label="من الديوان" on={w.type === "diwan"} onPress={() => setWork(i, { type: "diwan" })} color={color} />
                    <Pill label="عمل منشور" on={w.type === "external"} onPress={() => setWork(i, { type: "external" })} color={color} />
                  </View>
                </View>
                {w.type === "diwan" ? (
                  (me?.my_texts.length ?? 0) ? (
                    <View style={{ gap: 6, marginTop: 8 }}>
                      {me!.my_texts.map((t) => {
                        const taken = works.some((x, j) => j !== i && x.type === "diwan" && x.text_id === t.id);
                        return (
                          <Pressable key={t.id} disabled={taken} onPress={() => setWork(i, { text_id: t.id, title: t.title })} style={[st.textOpt, w.text_id === t.id && { borderColor: color, backgroundColor: color + "0D" }, taken && { opacity: 0.35 }]}>
                            <Ionicons name={w.text_id === t.id ? "checkmark-circle" : "document-text-outline"} size={18} color={w.text_id === t.id ? color : Colors.textMuted} />
                            <Text style={st.textOptT} numberOfLines={1}>{t.title}</Text>
                            <Text style={st.doc}>{t.doc_no}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : <Text style={[u.hint, { marginTop: 8 }]}>ليس لديك نصوص موثّقة بعد — أضف عملاً منشوراً، أو اكتب في الديوان أولاً.</Text>
                ) : (
                  <>
                    <Field l="عنوان العمل" v={w.title} on={(t) => setWork(i, { title: t })} />
                    <View style={[u.rowR, { gap: 8 }]}>
                      <View style={{ flex: 1 }}><Field l="نوعه" v={w.kind} on={(t) => setWork(i, { kind: t })} p={journalist ? "تحقيق، تقرير…" : "قصيدة، قصة…"} /></View>
                      <View style={{ flex: 1 }}><Field l="أين نُشر" v={w.where} on={(t) => setWork(i, { where: t })} p="صحيفة، كتاب، موقع" /></View>
                      <View style={{ width: 74 }}><Field l="السنة" v={w.year} on={(t) => setWork(i, { year: t.replace(/\D/g, "").slice(0, 4) })} k="number-pad" /></View>
                    </View>
                    <Field l="رابط العمل (اختياري)" v={w.link} on={(t) => setWork(i, { link: t })} p="https://" k="url" />
                    <Field l="مقتطف من العمل" v={w.excerpt} on={(t) => setWork(i, { excerpt: t })} multi p="80 حرفاً على الأقل إن لم تضع رابطاً" />
                  </>
                )}
                <Pressable onPress={() => setWork(i, { pledged: !w.pledged })} style={[u.rowR, { gap: 8, marginTop: 10, alignItems: "flex-start" }]} accessibilityRole="checkbox" accessibilityState={{ checked: w.pledged }}>
                  <Ionicons name={w.pledged ? "checkbox" : "square-outline"} size={21} color={w.pledged ? color : Colors.textMuted} />
                  <Text style={st.pl}>أتعهّد بأن هذا العمل من تأليفي، وليس منقولاً ولا مولّداً بالذكاء الاصطناعي.</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <View style={[st.summary, { borderColor: color + "55" }]}>
              <Text style={[st.workN, { color }]}>{cat?.label} · {journalist ? "عضوية صحفية" : f.tier === "professional" ? "عضوية احترافية" : "عضوية منتسب"}</Text>
              <Text style={st.sumName}>{f.pen_name || f.full_name}</Text>
              <Text style={u.hint}>{works.map((w) => `«${w.title || "—"}»`).join("  ·  ")}</Text>
            </View>
            <View style={st.pledge}>
              <Text style={st.pledgeT}>الإقرار والتعهّد</Text>
              {([["own_works", "أقرّ بأن الأعمال المرفقة من تأليفي، وأتحمّل المسؤولية الكاملة عن صحة ذلك."], ["accurate", "وأن البيانات المدخلة صحيحة، وأوافق على مراجعتها والتحقق منها."], ["charter", "وألتزم بميثاق الديوان: الأمانة الأدبية، واحترام حقوق الآخرين، ومواصلة النشر — وأعلم أن العضوية تُعلّق تلقائياً إذا توقفت عن النشر 30 يوماً متصلة، وتتجدد سنوياً بموافقة الإدارة."]] as const).map(([k, t]) => (
                <Pressable key={k} onPress={() => setPledge({ ...pledge, [k]: !pledge[k] })} style={[u.rowR, { gap: 8, alignItems: "flex-start", paddingVertical: 5 }]}>
                  <Ionicons name={pledge[k] ? "checkbox" : "square-outline"} size={22} color={pledge[k] ? WINE : Colors.textMuted} />
                  <Text style={st.pl}>{t}</Text>
                </Pressable>
              ))}
              <Text style={[u.label, { marginTop: 8 }]}>التوقيع (الاسم الكامل)</Text>
              <TextInput value={pledge.signature} onChangeText={(t) => setPledge({ ...pledge, signature: t })} style={st.sig} placeholder="اكتب اسمك" placeholderTextColor={Colors.textMuted} />
            </View>
          </>
        )}

        <View style={[u.rowR, { gap: 8, marginTop: 20 }]}>
          {step < 3 ? (
            <Pressable onPress={next} style={[u.primaryBtn, { flex: 1, backgroundColor: color }]}><Text style={u.primaryText}>التالي</Text><Ionicons name="chevron-back" size={18} color="#fff" /></Pressable>
          ) : (
            <Pressable onPress={submit} disabled={saving} style={[u.primaryBtn, { flex: 1, backgroundColor: color }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="paper-plane" size={18} color="#fff" />}<Text style={u.primaryText}>إرسال الاستمارة</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ l, v, on, p, multi, k }: { l: string; v: string; on: (t: string) => void; p?: string; multi?: boolean; k?: any }) {
  return (
    <View>
      <Text style={u.label}>{l}</Text>
      <TextInput value={v} onChangeText={on} placeholder={p} placeholderTextColor={Colors.textMuted} multiline={multi} keyboardType={k} autoCapitalize="none"
        style={[u.input, multi && { minHeight: 90, textAlignVertical: "top" }]} />
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK },
  steps: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  step: { flex: 1, alignItems: "center", gap: 3 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  dotT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted },
  stepT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  lead: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  cat: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  catI: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  catT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  press: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: "#E11D4808", borderWidth: 1, borderColor: "#E11D4833" },
  pressT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#9F1239" },
  work: { marginTop: 14, padding: 12, borderRadius: 16, borderWidth: 1.5, backgroundColor: Colors.cardBg },
  workN: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  textOpt: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  textOptT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  doc: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  pl: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", lineHeight: 21 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 14, backgroundColor: Colors.cardBg, gap: 4 },
  sumName: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  pledge: { marginTop: 14, backgroundColor: "#FFFBF2", borderRadius: 16, borderWidth: 1, borderColor: "#E9D9B4", padding: 14 },
  pledgeT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: INK, textAlign: "right", marginBottom: 4 },
  sig: { borderBottomWidth: 1.5, borderBottomColor: INK + "66", paddingVertical: 6, fontFamily: "Cairo_700Bold", fontSize: 18, color: WINE, textAlign: "center" },
});
