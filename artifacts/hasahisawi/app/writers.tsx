// «ديوان الكُتّاب» — قصة وشعر وخواطر يكتبها أبناء الحصاحيصا، موثّقة برقم، مع المسابقة الأدبية والمراجعة.
import React, { useCallback, useEffect, useState } from "react";
import ViewCount from "@/components/ViewCount";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { litApi, WINE, GOLD, INK, PHASE_META, countdown, type LitMeta, type LitText, type Contest } from "@/lib/lit";
import { TextCard, DocBadge, groupColor } from "@/components/lit/ui";
import { Pill, Empty, SectionTitle, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "diwan" | "mine" | "review";

export default function WritersScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; group?: string; author?: string }>();
  const authorId = params.author && /^\d+$/.test(String(params.author)) ? Number(params.author) : undefined;
  const signedIn = !!token && !isGuest;
  const [tab, setTab] = useState<Tab>((["mine", "review"].includes(String(params.tab)) ? params.tab : "diwan") as Tab);
  const [meta, setMeta] = useState<LitMeta | null>(null);
  const [group, setGroup] = useState<string>(String(params.group || ""));
  const [form, setForm] = useState("");
  const [sort, setSort] = useState<"new" | "popular">("new");
  const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<LitText[]>([]);
  const [featured, setFeatured] = useState<LitText[]>([]);
  const [top, setTop] = useState<{ id: number; name: string; avatar_url: string | null; texts: number; likes: number }[]>([]);
  const [contest, setContest] = useState<Contest | null>(null);
  const [mine, setMine] = useState<LitText[]>([]);
  const [review, setReview] = useState<{ texts: LitText[]; counts: Record<string, number> }>({ texts: [], counts: {} });
  const [rstatus, setRstatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await litApi.meta(token).catch(() => null);
      if (m) setMeta(m);
      if (tab === "diwan") {
        const [l, f, w, cs] = await Promise.all([
          litApi.texts({ group: group || undefined, form: form || undefined, q: query || undefined, sort, author: authorId }, token).catch(() => ({ texts: [] as LitText[] })),
          litApi.texts({ featured: true, limit: 8 }, token).catch(() => ({ texts: [] as LitText[] })),
          litApi.top().catch(() => ({ writers: [] })),
          litApi.contests(token).catch(() => ({ contests: [] as Contest[] })),
        ]);
        setTexts(l.texts); setFeatured(f.texts); setTop(w.writers);
        const live = cs.contests.filter((c) => c.published);
        setContest(live.find((c) => c.phase === "open") || live.find((c) => c.phase === "upcoming") || live.find((c) => c.phase === "judging") || live[0] || null);
      } else if (tab === "mine" && signedIn) {
        setMine((await litApi.mine(token!)).texts);
      } else if (tab === "review" && signedIn) {
        setReview(await litApi.review(token!, rstatus));
      }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab, group, form, query, sort, token, signedIn, rstatus, authorId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (t: LitText) => router.push({ pathname: "/writers-text", params: { id: String(t.id) } } as any);
  const write = (f?: string) => {
    if (!signedIn) return notify("سجّل الدخول", "سجّل الدخول لتكتب في ديوان الكُتّاب.");
    router.push({ pathname: "/writers-compose", params: f ? { form: f } : {} } as any);
  };
  const forms = (meta?.forms ?? []).filter((f) => !group || f.group === group);
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "diwan", label: "الديوان", icon: "book-outline" },
    { key: "mine", label: "نصوصي", icon: "create-outline" },
    ...(meta?.me.can_review ? [{ key: "review" as Tab, label: `المراجعة${meta.me.pending ? ` (${meta.me.pending})` : ""}`, icon: "shield-checkmark-outline" as const }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={WINE} />}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={["#2A1512", WINE]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { paddingTop: insets.top + 10 }]}>
          <View style={[u.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/ithraa" as any))} style={s.iconBtn} hitSlop={8} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => router.push("/lit-contest" as any)} style={s.contestBtn} accessibilityLabel="المسابقة الأدبية">
              <Ionicons name="trophy" size={15} color={INK} /><Text style={s.contestBtnT}>المسابقة الأدبية</Text>
            </Pressable>
          </View>
          <Text style={s.kicker}>إثراء · منصة حصاحيصاوي</Text>
          <Text style={s.heroTitle}>{authorId && texts[0]?.author_id === authorId ? `نصوص ${texts[0].author_name}` : "ديوان الكُتّاب"}</Text>
          <Text style={s.heroSub}>قصةٌ وشعرٌ وخاطرة… بأقلام أبناء الحصاحيصا. كل نص موثّق برقم يحفظ حق كاتبه.</Text>
          <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
            <Stat n={meta?.totals.texts ?? 0} l="نصاً منشوراً" />
            <Stat n={meta?.totals.writers ?? 0} l="كاتباً" />
            <Stat n={meta?.forms.length ?? 13} l="جنساً أدبياً" />
          </View>
          <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
            <Pressable onPress={() => write()} style={[s.writeBtn, { flex: 1, marginTop: 0 }]} accessibilityRole="button">
              <Ionicons name="pencil" size={18} color={WINE} /><Text style={s.writeBtnT}>اكتب نصك الآن</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/writers-membership" as any)} style={[s.writeBtn, { flex: 1, marginTop: 0, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: GOLD }]} accessibilityRole="button">
              <Ionicons name="id-card" size={18} color={GOLD} /><Text style={[s.writeBtnT, { color: GOLD }]}>العضوية والبطاقة</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {tabs.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && { backgroundColor: WINE }]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                <Ionicons name={t.icon} size={15} color={tab === t.key ? "#fff" : Colors.textSecondary} />
                <Text style={[s.tabT, tab === t.key && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {loading && !refreshing && <ActivityIndicator color={WINE} style={{ marginTop: 28 }} />}

          {!loading && tab === "diwan" && (
            <>
              {contest && <ContestBanner c={contest} />}

              <SectionTitle title="الأجناس الأدبية" />
              <View style={[u.rowR, { gap: 8 }]}>
                {(meta?.groups ?? []).map((g) => (
                  <Pressable key={g.key} onPress={() => { setGroup(group === g.key ? "" : g.key); setForm(""); }} style={[s.group, group === g.key && { borderColor: g.color, backgroundColor: g.color + "10" }]}>
                    <View style={[s.groupIcon, { backgroundColor: g.color }]}><Ionicons name={g.icon as any} size={18} color="#fff" /></View>
                    <Text style={s.groupT}>{g.label}</Text>
                    <Text style={u.hint}>{g.count} نص</Text>
                  </Pressable>
                ))}
              </View>
              {!!group && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
                  {[{ key: "", label: "الكل" }, ...forms].map((f) => (
                    <View key={f.key || "all"} style={{ transform: [{ scaleX: -1 }] }}><Pill label={f.label} on={form === f.key} onPress={() => setForm(f.key)} color={groupColor(group)} /></View>
                  ))}
                </ScrollView>
              )}

              {!group && !query && featured.length > 0 && (
                <>
                  <SectionTitle title="مختارات الديوان" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }], marginHorizontal: -16 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
                    {featured.map((t) => (
                      <View key={t.id} style={{ transform: [{ scaleX: -1 }] }}>
                        <Pressable onPress={() => open(t)} style={[s.feat, { backgroundColor: groupColor(t.group) }]}>
                          <Ionicons name="star" size={14} color={GOLD} style={{ alignSelf: "flex-end" }} />
                          <Text style={s.featForm}>{t.form_label}</Text>
                          <Text style={s.featTitle} numberOfLines={2}>{t.title}</Text>
                          <Text style={s.featBody} numberOfLines={4}>{t.excerpt}</Text>
                          <Text style={s.featAuthor} numberOfLines={1}>— {t.author_name}</Text>
                          <ViewCount count={t.views} color="rgba(255,255,255,0.8)" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}

              {!group && !query && top.length > 0 && (
                <>
                  <SectionTitle title="أقلام الديوان" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }], marginHorizontal: -16 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
                    {top.map((w) => (
                      <Pressable key={w.id} onPress={() => router.push({ pathname: "/profile", params: { id: String(w.id) } } as any)} style={{ transform: [{ scaleX: -1 }], alignItems: "center", width: 74 }}>
                        <UserAvatar name={w.name} avatarUrl={w.avatar_url} size={54} borderRadius={27} />
                        <Text style={s.penName} numberOfLines={1}>{w.name}</Text>
                        <Text style={u.hint}>{w.texts} نص</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <View style={[s.search, { marginTop: 18 }]}>
                <Ionicons name="search" size={17} color={Colors.textMuted} />
                <TextInput value={q} onChangeText={setQ} placeholder="ابحث بعنوان أو كاتب أو رقم توثيق…" placeholderTextColor={Colors.textMuted} style={s.searchIn} />
              </View>
              <View style={[u.rowR, { justifyContent: "space-between", marginTop: 12, marginBottom: 10 }]}>
                <Text style={s.count}>{texts.length} نص</Text>
                <View style={[u.rowR, { gap: 6 }]}>
                  <Pill label="الأحدث" on={sort === "new"} onPress={() => setSort("new")} color={WINE} />
                  <Pill label="الأكثر تفاعلاً" on={sort === "popular"} onPress={() => setSort("popular")} color={WINE} />
                </View>
              </View>
              {texts.map((t) => <TextCard key={t.id} t={t} onPress={() => open(t)} />)}
              {!texts.length && <Empty icon="create-outline" title={query ? "لا نتائج" : "الديوان ينتظر نصك الأول"} sub="اكتب قصة أو قصيدة أو خاطرة، ووثّقها برقم يحفظ حقك." action="اكتب نصاً" onAction={() => write(form || undefined)} />}
              <FormsGuide meta={meta} onWrite={write} />
            </>
          )}

          {!loading && tab === "mine" && (
            !signedIn ? <Empty icon="person-circle-outline" title="سجّل الدخول لترى نصوصك" /> : (
              <View style={{ marginTop: 14 }}>
                <View style={[u.card, { marginBottom: 12, flexDirection: "row-reverse", gap: 10, alignItems: "center" }]}>
                  <Ionicons name="shield-checkmark" size={26} color={WINE} />
                  <Text style={[u.hint, { flex: 1, color: Colors.textSecondary }]}>كل نص كتبته بعد التعهّد له رقم توثيق وبصمة رقمية. شارك رابط التحقق لإثبات أسبقيتك متى احتجت.</Text>
                </View>
                {mine.map((t) => (
                  <TextCard key={t.id} t={t} showStatus onPress={() => open(t)} footer={(
                    <View style={{ marginTop: 8, gap: 6 }}>
                      <DocBadge no={t.doc_no} onPress={t.doc_no ? () => router.push({ pathname: "/writers-cert", params: { no: t.doc_no! } } as any) : undefined} />
                      {t.status === "rejected" && !!t.review_note && <Text style={s.note}>ملاحظة المشرف: {t.review_note}</Text>}
                      {t.status === "ai_flagged" && <Text style={s.note}>{t.appeal ? "طلبت مراجعة بشرية — بانتظار المشرف" : "رجّح الفحص الآلي أنه مولَّد آلياً. افتح النص لطلب مراجعة بشرية إن كنت كاتبه."}</Text>}
                    </View>
                  )} />
                ))}
                {!mine.length && <Empty icon="create-outline" title="لم تكتب بعد" sub="ابدأ بنص قصير — خاطرة أو هايكو — وستحصل على أول رقم توثيق لك." action="اكتب نصاً" onAction={() => write()} />}
              </View>
            )
          )}

          {!loading && tab === "review" && (
            <View style={{ marginTop: 12 }}>
              <View style={u.wrap}>
                {[["pending", "بانتظار المراجعة"], ["flagged", "رفض آلي"], ["approved", "المنشور"], ["rejected", "المرفوض"]].map(([k, l]) => (
                  <Pill key={k} label={`${l}${review.counts[k] ? ` (${review.counts[k]})` : ""}`} on={rstatus === k} onPress={() => setRstatus(k)} color={k === "flagged" ? "#9B2C2C" : WINE} />
                ))}
              </View>
              <View style={{ marginTop: 12 }}>
                {review.texts.map((t) => (
                  <TextCard key={t.id} t={t} showStatus onPress={() => open(t)} footer={(
                    <View style={[u.rowR, { gap: 6, marginTop: 8, flexWrap: "wrap" }]}>
                      {t.appeal && <Tag c="#2B6CB0" t="طلب مراجعة بشرية" />}
                      {t.ai_verdict === "review" && <Tag c="#B7791F" t={`تدقيق أصالة · ${t.ai_score}%`} />}
                      {t.ai_verdict === "ai" && <Tag c="#9B2C2C" t={`آلي مرجّح · ${t.ai_score}%`} />}
                      {t.doc_no && <Tag c={WINE} t={t.doc_no} />}
                    </View>
                  )} />
                ))}
                {!review.texts.length && <Empty icon="checkmark-done-circle-outline" title="لا شيء هنا" />}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {signedIn && tab !== "review" && (
        <Pressable onPress={() => write(form || undefined)} style={[s.fab, { bottom: insets.bottom + 20 }]} accessibilityLabel="اكتب نصاً">
          <Ionicons name="pencil" size={18} color="#fff" /><Text style={s.fabT}>اكتب</Text>
        </Pressable>
      )}
    </View>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={s.stat}><Text style={s.statN}>{n.toLocaleString("ar-EG")}</Text><Text style={s.statL}>{l}</Text></View>;
}
function Tag({ c, t }: { c: string; t: string }) {
  return <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: c, backgroundColor: c + "14", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: "hidden" }}>{t}</Text>;
}

function ContestBanner({ c }: { c: Contest }) {
  const ph = PHASE_META[c.phase];
  const target = c.phase === "upcoming" ? c.starts_at : c.phase === "open" ? c.ends_at : null;
  return (
    <Pressable onPress={() => router.push({ pathname: "/lit-contest", params: { id: String(c.id) } } as any)} style={{ marginTop: 14 }}>
      <LinearGradient colors={["#2A1512", "#5A2230"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.banner}>
        <View style={[u.rowR, { justifyContent: "space-between" }]}>
          <View style={[s.phase, { backgroundColor: ph.color }]}><Ionicons name={ph.icon as any} size={12} color="#fff" /><Text style={s.phaseT}>{ph.label}</Text></View>
          <Ionicons name="trophy" size={28} color={GOLD} />
        </View>
        <Text style={s.bannerTitle}>{c.title}</Text>
        {!!c.edition && <Text style={s.bannerEd}>{c.edition}{c.theme ? ` · محور: ${c.theme}` : ""}</Text>}
        {!!c.slogan && <Text style={s.bannerSlogan}>«{c.slogan}»</Text>}
        <View style={[u.rowR, { justifyContent: "space-between", marginTop: 10 }]}>
          <Text style={s.bannerMeta}>{target ? `${c.phase === "upcoming" ? "تبدأ بعد" : "تُغلق بعد"} ${countdown(target)}` : c.phase === "results" ? "اطّلع على الفائزين" : "اللجنة تقرأ النصوص الآن"}</Text>
          <View style={[u.rowR, { gap: 4 }]}><Text style={s.bannerCta}>{c.phase === "open" ? "شارك الآن" : "التفاصيل"}</Text><Ionicons name="chevron-back" size={14} color={GOLD} /></View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function FormsGuide({ meta, onWrite }: { meta: LitMeta | null; onWrite: (f: string) => void }) {
  if (!meta) return null;
  return (
    <>
      <SectionTitle title="اختر جنس نصك" />
      {meta.groups.map((g) => (
        <View key={g.key} style={[u.card, { marginBottom: 10 }]}>
          <View style={[u.rowR, { gap: 8, marginBottom: 6 }]}>
            <View style={[s.groupIcon, { backgroundColor: g.color, width: 28, height: 28 }]}><Ionicons name={g.icon as any} size={14} color="#fff" /></View>
            <Text style={s.groupT}>{g.label}</Text>
          </View>
          {meta.forms.filter((f) => f.group === g.key).map((f) => (
            <Pressable key={f.key} onPress={() => onWrite(f.key)} style={s.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.formName}>{f.label}</Text>
                <Text style={u.hint}>{f.hint}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={g.color} />
            </Pressable>
          ))}
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  contestBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  contestBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: INK },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: GOLD, textAlign: "right", marginTop: 12, letterSpacing: 0.5 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 30, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.86)", textAlign: "right", lineHeight: 22 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.8)" },
  writeBtn: { marginTop: 14, backgroundColor: "#FFF8EC", borderRadius: 14, height: 48, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  writeBtnT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE },
  tabsWrap: { backgroundColor: Colors.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tabs: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  tabT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  banner: { borderRadius: 18, padding: 16 },
  phase: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  phaseT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  bannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff", textAlign: "right", marginTop: 6 },
  bannerEd: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: GOLD, textAlign: "right" },
  bannerSlogan: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right", marginTop: 4 },
  bannerMeta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  bannerCta: { fontFamily: "Cairo_700Bold", fontSize: 13, color: GOLD },
  group: { flex: 1, alignItems: "flex-end", gap: 4, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  groupIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  groupT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  feat: { width: 220, minHeight: 210, borderRadius: 18, padding: 14, gap: 4 },
  featForm: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "rgba(255,255,255,0.75)", textAlign: "right" },
  featTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right", lineHeight: 25 },
  featBody: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.9)", textAlign: "right", lineHeight: 22, flex: 1 },
  featAuthor: { fontFamily: "Cairo_700Bold", fontSize: 12, color: GOLD, textAlign: "right" },
  penName: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary, marginTop: 4, textAlign: "center" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, height: 44 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 0 },
  count: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  formRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.divider },
  formName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  note: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#9B2C2C", textAlign: "right", lineHeight: 19 },
  fab: { position: "absolute", left: 20, flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: WINE, paddingHorizontal: 20, height: 50, borderRadius: 25,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
