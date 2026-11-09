// «مسابقة حصاحيصاوي الأدبية» — الصفحة العامة: الدورات، المراحل والعدّ التنازلي، الفئات، الجوائز، الشروط،
// لجنة التحكيم، مشاركاتي، والنتائج مع منصّة الفائزين وأرقام الشهادات.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, RefreshControl, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { litApi, WINE, GOLD, INK, PHASE_META, countdown, fmtDate, type Contest, type ContestDetail } from "@/lib/lit";
import { groupColor } from "@/components/lit/ui";
import { Empty, SectionTitle, ithraaStyles as u } from "@/components/ithraa/ui";

const MEDAL = ["#D4A017", "#A7A9AC", "#B87333"];

export default function LitContestScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [list, setList] = useState<{ contests: Contest[]; me: { supervisor: boolean; is_app_admin: boolean } } | null>(null);
  const [d, setD] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const signedIn = !!token && !isGuest;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (id) setD(await litApi.contest(Number(id), token));
      else setList(await litApi.contests(token));
    } catch (e: any) { notify("تعذّر التحميل", e?.message); } finally { setLoading(false); }
  }, [id, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  void tick;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/writers" as any));

  if (loading && !d && !list) return <View style={st.center}><ActivityIndicator color={WINE} /></View>;

  // ── قائمة الدورات ──
  if (!id) {
    const cs = list?.contests ?? [];
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <Header title="مسابقة حصاحيصاوي الأدبية" onBack={back} insetsTop={insets.top}
          right={list?.me.supervisor ? <Pressable onPress={() => router.push("/lit-contest-manage" as any)} style={st.mgrBtn}><Ionicons name="settings" size={15} color={INK} /><Text style={st.mgrT}>الإدارة</Text></Pressable> : undefined} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={WINE} />}>
          {cs.map((c) => <ContestCard key={c.id} c={c} />)}
          {!cs.length && <Empty icon="trophy-outline" title="لا توجد دورات معلنة بعد" sub="تابعنا — ستُعلن الدورة القادمة قريباً." />}
        </ScrollView>
      </View>
    );
  }
  if (!d) return <View style={st.center}><Text>غير موجودة</Text></View>;
  const c = d.contest;
  const ph = PHASE_META[c.phase];
  const target = c.phase === "upcoming" ? c.starts_at : c.phase === "open" ? c.ends_at : null;
  const canEnter = c.phase === "open" && signedIn && !d.me.judge && d.mine.filter((m) => m.status !== "withdrawn").length < c.max_entries;
  const resultsByCat = d.results.reduce<Record<string, typeof d.results>>((a, r) => { (a[r.category_label] ??= []).push(r); return a; }, {});

  const enter = () => {
    if (!signedIn) return notify("سجّل الدخول", "سجّل الدخول للمشاركة في المسابقة.");
    router.push({ pathname: "/writers-compose", params: { contest: String(c.id) } } as any);
  };
  const withdraw = async (eid: number) => {
    if (!token || !(await confirmAction("سحب المشاركة", "ستخرج المشاركة من المسابقة ويبقى نصك موثّقاً.", "سحب", true))) return;
    try { const r = await litApi.withdrawEntry(token, c.id, eid); notify("تم", r.message); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={WINE} />}>
        <LinearGradient colors={["#1E0F0C", "#4A1B26", WINE]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={[u.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={back} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <View style={[u.rowR, { gap: 8 }]}>
              {d.me.judge && <Pressable onPress={() => router.push({ pathname: "/lit-contest-judge", params: { id: String(c.id) } } as any)} style={st.mgrBtn}><Ionicons name="star-half" size={15} color={INK} /><Text style={st.mgrT}>التحكيم</Text></Pressable>}
              {d.me.supervisor && <Pressable onPress={() => router.push({ pathname: "/lit-contest-manage", params: { id: String(c.id) } } as any)} style={st.mgrBtn}><Ionicons name="settings" size={15} color={INK} /><Text style={st.mgrT}>الإدارة</Text></Pressable>}
              <Pressable onPress={() => Share.share({ message: `🏆 ${c.title}${c.edition ? ` — ${c.edition}` : ""}\n${c.slogan || ""}\nشارك بنصك عبر تطبيق حصاحيصاوي: https://almhbob.github.io/hasahisawi/lit-contest?id=${c.id}` }).catch(() => {})} style={st.iconBtn} accessibilityLabel="مشاركة"><Ionicons name="share-social" size={18} color="#fff" /></Pressable>
            </View>
          </View>
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <View style={st.trophy}><Ionicons name="trophy" size={34} color={GOLD} /></View>
            {!!c.edition && <Text style={st.edition}>{c.edition}</Text>}
            <Text style={st.heroTitle}>{c.title}</Text>
            {!!c.slogan && <Text style={st.slogan}>«{c.slogan}»</Text>}
            {!!c.theme && <Text style={st.theme}>محور الدورة: {c.theme}</Text>}
            <View style={[st.phase, { backgroundColor: ph.color }]}><Ionicons name={ph.icon as any} size={13} color="#fff" /><Text style={st.phaseT}>{ph.label}</Text></View>
            {target && (
              <View style={st.countBox}>
                <Text style={st.countL}>{c.phase === "upcoming" ? "تبدأ المشاركة بعد" : "يُغلق باب المشاركة بعد"}</Text>
                <Text style={st.countV}>{countdown(target)}</Text>
              </View>
            )}
            <View style={[u.rowR, { gap: 8, marginTop: 12, alignSelf: "stretch" }]}>
              <HStat n={c.entries} l="مشاركة" /><HStat n={c.participants} l="كاتباً" /><HStat n={c.categories.length} l="فئات" />
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16 }}>
          <Timeline c={c} />

          {c.results_published && (
            <>
              <SectionTitle title="الفائزون" />
              {!!c.results_note && <Text style={[u.hint, { marginBottom: 10, color: Colors.textSecondary }]}>{c.results_note}</Text>}
              {Object.entries(resultsByCat).map(([cat, rs]) => (
                <View key={cat} style={[u.card, { marginBottom: 12 }]}>
                  <Text style={st.catTitle}>{cat}</Text>
                  {rs.map((r) => (
                    <Pressable key={r.id} onPress={() => router.push({ pathname: "/writers-text", params: { id: String(r.text_id) } } as any)} style={st.winner}>
                      <View style={[st.medal, { backgroundColor: MEDAL[r.rank - 1] || GOLD }]}><Text style={st.medalT}>{r.rank}</Text></View>
                      <UserAvatar name={r.author_name} avatarUrl={r.author_avatar} size={38} borderRadius={19} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.wName}>{r.author_name}</Text>
                        <Text style={u.hint} numberOfLines={1}>«{r.title}» · {r.award}</Text>
                      </View>
                      {r.final_score != null && <Text style={st.score}>{r.final_score}</Text>}
                    </Pressable>
                  ))}
                </View>
              ))}
              {!d.results.length && <Empty icon="trophy-outline" title="لا توجد مراكز معلنة" />}
            </>
          )}

          {d.mine.length > 0 && (
            <>
              <SectionTitle title="مشاركاتي" />
              {d.mine.map((m) => (
                <View key={m.id} style={[u.card, { marginBottom: 10, gap: 4 }]}>
                  <View style={[u.rowR, { justifyContent: "space-between" }]}>
                    <Text style={st.mTitle}>{m.title}</Text>
                    <Text style={[st.code]}>رمز {m.code}</Text>
                  </View>
                  <Text style={u.hint}>رقم التوثيق {m.doc_no} · {m.status === "qualified" ? "مؤهلة للتحكيم" : m.status === "review" ? "قيد تدقيق الأصالة" : m.status === "disqualified" ? `مستبعدة: ${m.status_note || ""}` : "مسحوبة"}</Text>
                  {!!m.award && (
                    <Pressable onPress={() => router.push({ pathname: "/writers-cert", params: { no: m.doc_no } } as any)} style={st.awardRow}>
                      <Ionicons name="medal" size={18} color={GOLD} />
                      <Text style={st.awardT}>{m.award} · شهادة {m.certificate_no}</Text>
                    </Pressable>
                  )}
                  {c.phase === "open" && m.status !== "withdrawn" && (
                    <Pressable onPress={() => withdraw(m.id)} style={{ alignSelf: "flex-start" }}><Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#C0392B" }}>سحب المشاركة</Text></Pressable>
                  )}
                </View>
              ))}
            </>
          )}

          {!!c.description && (<><SectionTitle title="عن المسابقة" /><Text style={st.desc}>{c.description}</Text></>)}

          <SectionTitle title="فئات المسابقة" />
          <View style={u.wrap}>
            {c.categories.map((k) => (
              <View key={k.key} style={[st.cat, { borderColor: groupColor(k.group) + "55", backgroundColor: groupColor(k.group) + "0D" }]}>
                <Text style={[st.catT, { color: groupColor(k.group) }]}>{k.label}</Text>
                {c.per_category && c.phase !== "draft" && <Text style={u.hint}>{c.per_category[k.key] || 0} مشاركة</Text>}
              </View>
            ))}
          </View>
          <Text style={[u.hint, { marginTop: 6 }]}>لكل كاتب {c.max_entries === 1 ? "مشاركة واحدة" : `${c.max_entries} مشاركات`} كحد أقصى. الجوائز لكل فئة.</Text>

          <SectionTitle title="الجوائز" />
          <View style={{ gap: 8 }}>
            {c.prizes.map((p, i) => (
              <View key={i} style={st.prize}>
                <View style={[st.medal, { backgroundColor: MEDAL[i] || GOLD }]}><Ionicons name="medal" size={16} color="#fff" /></View>
                <Text style={st.prizeL}>{p.label}</Text>
                <Text style={st.prizeR}>{p.reward || "شهادة تقدير موثّقة + نشر مميّز"}</Text>
              </View>
            ))}
          </View>

          <SectionTitle title="معايير التحكيم" />
          <View style={[u.card, { gap: 8 }]}>
            {c.criteria.map((k) => (
              <View key={k.key}>
                <View style={[u.rowR, { justifyContent: "space-between" }]}><Text style={st.critL}>{k.label}</Text><Text style={st.critW}>{k.weight}%</Text></View>
                <View style={st.bar}><View style={[st.barFill, { width: `${k.weight}%` }]} /></View>
              </View>
            ))}
            <Text style={u.hint}>تحكيم سري: تُعرض النصوص على اللجنة برموز دون أسماء، والدرجة النهائية متوسط تقييمات المحكّمين من 100.</Text>
          </View>

          {d.judges.length > 0 && (
            <>
              <SectionTitle title="لجنة التحكيم" />
              <View style={{ gap: 8 }}>
                {d.judges.map((j) => (
                  <View key={j.user_id} style={[u.card, { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10 }]}>
                    <UserAvatar name={j.name} avatarUrl={j.avatar_url} size={40} borderRadius={20} />
                    <View style={{ flex: 1 }}><Text style={st.wName}>{j.name}</Text>{!!j.title && <Text style={u.hint}>{j.title}</Text>}</View>
                    <Ionicons name="ribbon-outline" size={18} color={GOLD} />
                  </View>
                ))}
              </View>
            </>
          )}

          <SectionTitle title="الشروط" />
          <View style={[u.card, { gap: 6 }]}>
            {c.rules.map((r, i) => (
              <View key={i} style={[u.rowR, { gap: 8, alignItems: "flex-start" }]}>
                <Text style={st.ruleN}>{i + 1}</Text><Text style={st.ruleT}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {c.phase === "open" && !d.me.judge && (
        <View style={[st.cta, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={enter} disabled={!canEnter && signedIn} style={[u.primaryBtn, { backgroundColor: WINE, opacity: !canEnter && signedIn ? 0.5 : 1 }]}>
            <Ionicons name="create" size={18} color="#fff" />
            <Text style={u.primaryText}>{!signedIn ? "سجّل الدخول للمشاركة" : canEnter ? "اكتب مشاركتك ووثّقها" : "استنفدت عدد المشاركات"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Header({ title, onBack, insetsTop, right }: { title: string; onBack: () => void; insetsTop: number; right?: React.ReactNode }) {
  return (
    <LinearGradient colors={["#1E0F0C", WINE]} style={[st.smallHead, { paddingTop: insetsTop + 6 }]}>
      <Pressable onPress={onBack} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
      <Text style={st.smallTitle}>{title}</Text>
      {right ?? <View style={{ width: 40 }} />}
    </LinearGradient>
  );
}

function ContestCard({ c }: { c: Contest }) {
  const ph = PHASE_META[c.phase];
  return (
    <Pressable onPress={() => router.push({ pathname: "/lit-contest", params: { id: String(c.id) } } as any)} style={[u.card, { marginBottom: 12 }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <View style={[st.phase, { backgroundColor: ph.color, marginTop: 0 }]}><Ionicons name={ph.icon as any} size={12} color="#fff" /><Text style={st.phaseT}>{ph.label}</Text></View>
        <Ionicons name="trophy" size={22} color={GOLD} />
      </View>
      <Text style={st.cardTitle}>{c.title}</Text>
      {!!c.edition && <Text style={[u.hint, { color: WINE }]}>{c.edition}</Text>}
      <Text style={u.hint}>{fmtDate(c.starts_at)} — {fmtDate(c.ends_at)} · {c.entries} مشاركة · {c.categories.map((k) => k.label).join("، ")}</Text>
      {c.i_judge && <Text style={[u.hint, { color: GOLD, fontFamily: "Cairo_700Bold" }]}>أنت عضو في لجنة التحكيم</Text>}
    </Pressable>
  );
}

function Timeline({ c }: { c: Contest }) {
  const steps = [
    { k: "upcoming", l: "الإعلان", d: c.starts_at },
    { k: "open", l: "استقبال النصوص", d: c.starts_at },
    { k: "judging", l: "التحكيم السري", d: c.ends_at },
    { k: "results", l: "إعلان النتائج", d: c.results_at },
  ];
  const order = ["draft", "upcoming", "open", "judging", "results"];
  const cur = order.indexOf(c.phase);
  return (
    <View style={st.timeline}>
      {steps.map((s, i) => {
        const done = order.indexOf(s.k) <= cur;
        return (
          <View key={s.k} style={st.tStep}>
            <View style={[st.tDot, done && { backgroundColor: WINE, borderColor: WINE }]}>{done && <Ionicons name="checkmark" size={11} color="#fff" />}</View>
            {i < steps.length - 1 && <View style={[st.tLine, order.indexOf(steps[i + 1].k) <= cur && { backgroundColor: WINE }]} />}
            <Text style={[st.tL, done && { color: WINE }]}>{s.l}</Text>
            <Text style={st.tD}>{s.d ? fmtDate(s.d) : "يُحدَّد"}</Text>
          </View>
        );
      })}
    </View>
  );
}

function HStat({ n, l }: { n: number; l: string }) {
  return <View style={st.hstat}><Text style={st.hstatN}>{n.toLocaleString("ar-EG")}</Text><Text style={st.hstatL}>{l}</Text></View>;
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  smallHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 12 },
  smallTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  mgrBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GOLD, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
  mgrT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: INK },
  trophy: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: GOLD, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)" },
  edition: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GOLD, marginTop: 10, letterSpacing: 0.5 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff", textAlign: "center", lineHeight: 36 },
  slogan: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "rgba(255,255,255,0.88)", textAlign: "center", marginTop: 2 },
  theme: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 4 },
  phase: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 10 },
  phaseT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  countBox: { marginTop: 12, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: GOLD + "55" },
  countL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  countV: { fontFamily: "Cairo_700Bold", fontSize: 18, color: GOLD },
  hstat: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  hstatN: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  hstatL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  timeline: { flexDirection: "row-reverse", marginTop: 18, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  tStep: { flex: 1, alignItems: "center" },
  tDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.divider, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", zIndex: 1 },
  tLine: { position: "absolute", top: 9, right: "50%", width: "100%", height: 2, backgroundColor: Colors.divider },
  tL: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary, marginTop: 6, textAlign: "center" },
  tD: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  catTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: WINE, textAlign: "right", marginBottom: 6 },
  winner: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  medal: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  medalT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  wName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  score: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE },
  mTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  code: { fontFamily: "Cairo_700Bold", fontSize: 12, color: WINE, backgroundColor: WINE + "10", paddingHorizontal: 8, borderRadius: 8, overflow: "hidden" },
  awardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: GOLD + "18", borderRadius: 10, padding: 8, marginTop: 4 },
  awardT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#7A5A12", flex: 1, textAlign: "right" },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24 },
  cat: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "flex-end" },
  catT: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  prize: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: Colors.divider },
  prizeL: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  prizeR: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "left" },
  critL: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  critW: { fontFamily: "Cairo_700Bold", fontSize: 13, color: WINE },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: "hidden", marginTop: 3, transform: [{ scaleX: -1 }] },
  barFill: { height: 6, backgroundColor: WINE, borderRadius: 3 },
  ruleN: { width: 22, height: 22, borderRadius: 11, backgroundColor: WINE + "14", color: WINE, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 12, lineHeight: 22, overflow: "hidden" },
  ruleT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right", marginTop: 6 },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.divider },
});
