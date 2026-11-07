/**
 * 🕊️ صدقة جارية:
 *  • /memorial?user=ID — الصفحة التذكارية: الاسم، الدعاء له، وما يُنشر عنه من صدقة جارية.
 *  • /memorial?report=1 — بلاغ وفاة من أحد ذوي المتوفى مع شهادة الوفاة، ومتابعة البلاغات.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { notify } from "@/lib/xplatform";
import { onlyDigits } from "@/lib/digits";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { ImageUploadField } from "@/components/union/ImageUploadField";
import UserAvatar from "@/components/UserAvatar";

const RELATIONS = ["ابن / ابنة", "أب / أم", "زوج / زوجة", "أخ / أخت", "قريب آخر"];

export default function MemorialScreen() {
  const { user: uid, report } = useLocalSearchParams<{ user?: string; report?: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color="#E3EBE6" /></TouchableOpacity>
        <Text style={s.headTitle}>{report ? "الإبلاغ عن وفاة" : "صدقة جارية"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {report ? <ReportForm /> : <MemorialPage uid={Number(uid)} />}
      </ScrollView>
    </View>
  );
}

function MemorialPage({ uid }: { uid: number }) {
  const { token } = useAuth();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/memorials/user/${uid}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j);
    } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [uid, token]);
  useEffect(() => { load(); }, [load]);
  if (err) return <Text style={s.muted}>{err}</Text>;
  if (!d) return <ActivityIndicator color="#C9D6CF" style={{ marginTop: 40 }} />;
  const m = d.memorial;
  const female = m.gender === "female";
  const pray = async () => {
    if (!token) return router.push("/login" as any);
    const r = await fetch(`${getApiUrl()}/api/memorials/${m.id}/dua`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).then(x => x.json()).catch(() => null);
    if (r) setD({ ...d, memorial: { ...m, duas_count: r.duas_count, prayed_today: true } });
  };
  return (
    <>
      <Animated.View entering={FadeIn.duration(700)}>
        <LinearGradient colors={["#1A2C25", "#1A2C25"]} style={s.hero}>
          <View style={s.avatarRing}><UserAvatar name={m.name} avatarUrl={m.avatar_url || undefined} size={92} borderRadius={46} /></View>
          <Text style={s.name}>{m.name}</Text>
          <Text style={s.rahma}>{female ? "رحمها" : "رحمه"} الله وغفر {female ? "لها" : "له"}</Text>
          {m.death_date ? <Text style={s.date}>انتقل{female ? "ت" : ""} إلى رحمة الله {new Date(m.death_date).toLocaleDateString("ar-SD", { day: "numeric", month: "long", year: "numeric" })}</Text> : null}
          <Text style={s.verse}>﴿إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ﴾</Text>
          <View style={s.stats}>
            <View style={s.stat}><Text style={s.statNum}>{m.duas_count}</Text><Text style={s.statLabel}>دعوة</Text></View>
            <View style={s.sep} />
            <View style={s.stat}><Text style={s.statNum}>{m.posts_count}</Text><Text style={s.statLabel}>منشور صدقة</Text></View>
          </View>
        </LinearGradient>
      </Animated.View>
      <Pressable onPress={pray} disabled={m.prayed_today} style={[s.prayBtn, m.prayed_today && { opacity: 0.75 }]} accessibilityRole="button">
        {m.prayed_today ? <Animated.View entering={ZoomIn}><Ionicons name="heart" size={22} color="#fff" /></Animated.View> : <Ionicons name="hand-left" size={20} color="#fff" />}
        <Text style={s.prayText}>{m.prayed_today ? `دعوتَ ${female ? "لها" : "له"} اليوم — جزاك الله خيراً` : `اللهم اغفر ${female ? "لها" : "له"} وارحم${female ? "ها" : "ه"}`}</Text>
      </Pressable>
      <Text style={s.section}>من صدقته الجارية</Text>
      {d.posts.map((p: any) => (
        <NeuRaised key={p.id} radius={18} depth={5} style={{ padding: 14 }}>
          <Text style={s.post}>{p.content}</Text>
          <Text style={s.postDate}>{new Date(p.created_at).toLocaleDateString("ar-SD", { day: "numeric", month: "long" })}</Text>
        </NeuRaised>
      ))}
      <Text style={[s.muted, { textAlign: "center" }]}>يُنشر يومياً من حساب{female ? "ها" : "ه"} ذكرٌ أو آية أو حديث نافع، صدقةً جارية {female ? "عنها" : "عنه"}.</Text>
    </>
  );
}

/** بلاغ وفاة عن حسابي: إن كنت بخير فاعترض ويُلغى البلاغ فوراً */
function AboutMe() {
  const { token } = useAuth();
  const [rep, setRep] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${getApiUrl()}/api/memorials/about-me`, { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json()).catch(() => ({ report: null }));
    setRep(r.report || null);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  if (!rep) return null;
  const object = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/memorials/${rep.id}/object`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      notify("الحمد لله على سلامتك", d.message); setRep(null);
    } catch (e: any) { notify("تعذّر الاعتراض", e?.message); }
    setBusy(false);
  };
  return (
    <NeuRaised radius={20} depth={6} style={{ padding: 14, gap: 10, borderWidth: 1.5, borderColor: "#D93636" }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
        <Ionicons name="alert-circle" size={26} color="#D93636" />
        <Text style={[s.label, { flex: 1 }]}>يوجد بلاغ وفاة عن حسابك</Text>
      </View>
      <Text style={s.muted}>
        قدّمه «{rep.reporter_name}» بصفته {rep.relation}.{rep.purge_at ? ` إن لم تعترض سيُحوَّل حسابك إلى صفحة تذكارية ${new Date(rep.purge_at).toLocaleString("ar-SD", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.` : " ستراجعه الإدارة قريباً."} إن كنت صاحب الحساب وأنت بخير فاعترض الآن وسيُلغى البلاغ فوراً.
      </Text>
      <NeuButton label="أنا بخير — ألغِ البلاغ" icon="shield-checkmark" onPress={object} loading={busy} />
    </NeuRaised>
  );
}

function ReportForm() {
  const { token, user } = useAuth();
  const [f, setF] = useState({ phone: "", relation: "", death_date: "", certificate_url: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<any[]>([]);
  const loadMine = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${getApiUrl()}/api/memorials/mine`, { headers: { Authorization: `Bearer ${token}` } }).then(x => x.json()).catch(() => ({ requests: [] }));
    setMine(r.requests || []);
  }, [token]);
  useEffect(() => { loadMine(); }, [loadMine]);
  if (!user || (user as any).isGuest) return <View style={{ alignItems: "center", gap: 12, padding: 30 }}><Text style={s.muted}>سجّل الدخول لتقديم البلاغ</Text><NeuButton label="تسجيل الدخول" icon="log-in-outline" onPress={() => router.push("/login" as any)} /></View>;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/memorials`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      notify("أحسن الله عزاءكم", d.message); setF({ phone: "", relation: "", death_date: "", certificate_url: "", notes: "" }); loadMine();
    } catch (e: any) { notify("تعذّر الإرسال", e?.message); }
    setBusy(false);
  };
  const label = (m: any) => m.status === "pending" ? ["قيد المراجعة", "#946B00"] : m.status === "confirmed" ? (m.purged_at ? ["تم — يُنشر عنه صدقة جارية", "#00966A"] : ["تأكد — يكتمل خلال 72 ساعة", "#006B4A"]) : [m.reject_reason || "لم يُقبل", "#D93636"];
  return (
    <>
      <AboutMe />
      <NeuRaised radius={20} depth={6} style={s.intro}>
        <Ionicons name="leaf" size={26} color="#006B4A" />
        <Text style={s.introText}>
          تراجع الإدارة البلاغ بعناية، ثم تمر مهلة 72 ساعة يُبلَّغ خلالها صاحب الحساب حمايةً من البلاغات الخاطئة. بعدها تُحذف منشورات الفقيد ومحادثاته حفظاً لخصوصيته، ويتحول حسابه إلى صفحة تذكارية ينشر منها التطبيق يومياً آيةً أو ذكراً أو دعاءً نافعاً صدقةً جاريةً عنه، ويدعو له الزوار.
        </Text>
      </NeuRaised>
      <NeuRaised radius={20} depth={6} style={{ padding: 14, gap: 8 }}>
        <Text style={s.label}>رقم هاتف حساب الفقيد في التطبيق</Text>
        <NeuInset radius={12}><TextInput value={f.phone} onChangeText={v => setF({ ...f, phone: onlyDigits(v, 14) })} keyboardType="phone-pad" placeholder="0912345678" placeholderTextColor={Colors.textSubtle} style={[s.input, { textAlign: "left" }]} /></NeuInset>
        <Text style={s.label}>صلة القرابة</Text>
        <View style={s.chips}>{RELATIONS.map(r => <TouchableOpacity key={r} onPress={() => setF({ ...f, relation: r })} style={[s.chip, f.relation === r && s.chipOn]}><Text style={[s.chipText, f.relation === r && { color: "#fff" }]}>{r}</Text></TouchableOpacity>)}</View>
        <Text style={s.label}>تاريخ الوفاة</Text>
        <NeuInset radius={12}><TextInput value={f.death_date} onChangeText={v => setF({ ...f, death_date: v })} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textSubtle} style={[s.input, { textAlign: "left" }]} /></NeuInset>
        <ImageUploadField label="شهادة الوفاة أو ما يثبتها (لا تُعرض للعامة)" value={f.certificate_url} onChange={u => setF({ ...f, certificate_url: u })} folder="memorials" aspect={4 / 3} />
        <Text style={s.label}>ملاحظات (اختياري)</Text>
        <NeuInset radius={12}><TextInput value={f.notes} onChangeText={v => setF({ ...f, notes: v })} multiline placeholder="أي معلومة تساعد الإدارة في التحقق" placeholderTextColor={Colors.textSubtle} style={[s.input, { minHeight: 70, textAlignVertical: "top" }]} /></NeuInset>
        <NeuButton label="إرسال البلاغ" icon="send" onPress={submit} loading={busy} disabled={f.phone.length < 9 || !f.relation || !f.certificate_url} />
      </NeuRaised>
      {mine.length > 0 && (
        <NeuRaised radius={20} depth={6} style={{ padding: 14, gap: 8 }}>
          <Text style={s.label}>بلاغاتي</Text>
          {mine.map(m => { const [l, c] = label(m); return (
            <View key={m.id} style={s.reqRow}><Text style={[s.reqName]}>{m.name}</Text><Text style={[s.reqStatus, { color: c }]}>{l}</Text></View>
          ); })}
        </NeuRaised>
      )}
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D1613" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#1A2C25" },
  headTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#F3F7F5" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "#9AABA3", textAlign: "right", lineHeight: 20 },
  hero: { borderRadius: 28, padding: 24, alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#2E4239" },
  avatarRing: { padding: 4, borderRadius: 54, borderWidth: 2, borderColor: "#C9D6CF", marginBottom: 6 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#F3F7F5" },
  rahma: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: "#A8E3CC" },
  date: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "#9AABA3" },
  verse: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#E3EBE6", marginTop: 8 },
  stats: { flexDirection: "row-reverse", alignItems: "center", gap: 18, marginTop: 12, backgroundColor: "#1A2C25", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 8 },
  stat: { alignItems: "center" }, sep: { width: 1, height: 28, backgroundColor: "#2E4239" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#F3F7F5" },
  statLabel: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: "#9AABA3" },
  prayBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#006B4A", borderRadius: 18, paddingVertical: 15 },
  prayText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#E3EBE6", textAlign: "right", marginTop: 6 },
  post: { fontFamily: "Cairo_600SemiBold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 26 },
  postDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 6 },
  intro: { flexDirection: "row-reverse", gap: 12, padding: 14, alignItems: "flex-start" },
  introText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  chipOn: { backgroundColor: "#006B4A", borderColor: "#006B4A" },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  reqRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  reqName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary },
  reqStatus: { fontFamily: "Cairo_700Bold", fontSize: 12 },
});
