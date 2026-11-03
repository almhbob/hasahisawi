// «إثراء» — المكتبة الثقافية: رفوف مصنّفة، كتب ومقالات، بحث، مساهماتي، وقائمة المراجعة للمشرفين.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { ithraaApi, ITHRAA, ITHRAA_DEEP, ITHRAA_GOLD, type IthraaItem, type IthraaKind, type IthraaMeta } from "@/lib/ithraa";
import { BookTile, ArticleCard, ItemRow, ShelfTile, SectionTitle, Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "home" | "books" | "articles" | "mine";
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "home", label: "الرئيسية", icon: "home-outline" },
  { key: "books", label: "الكتب", icon: "book-outline" },
  { key: "articles", label: "المقالات", icon: "newspaper-outline" },
  { key: "mine", label: "مساهماتي", icon: "person-circle-outline" },
];

export default function IthraaScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; shelf?: string }>();
  const [tab, setTab] = useState<Tab>((["books", "articles", "mine"].includes(String(params.tab)) ? params.tab : "home") as Tab);
  const [meta, setMeta] = useState<IthraaMeta | null>(null);
  const [featured, setFeatured] = useState<IthraaItem[]>([]);
  const [latestBooks, setLatestBooks] = useState<IthraaItem[]>([]);
  const [latestArticles, setLatestArticles] = useState<IthraaItem[]>([]);
  const [popular, setPopular] = useState<IthraaItem[]>([]);
  const [list, setList] = useState<IthraaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [mine, setMine] = useState<{ items: IthraaItem[]; points: number } | null>(null);
  const [shelf, setShelf] = useState<string>(String(params.shelf || ""));
  const [sort, setSort] = useState<"new" | "popular">("new");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const signedIn = !!token && !isGuest;

  const shelfColor = useCallback((key: string) => meta?.shelves.find((s) => s.key === key)?.color ?? ITHRAA, [meta]);

  const loadHome = useCallback(async () => {
    const [m, f, b, a, p] = await Promise.all([
      ithraaApi.meta(token).catch(() => null),
      ithraaApi.items({ featured: true, limit: 10, sort: "featured" }).catch(() => ({ items: [] as IthraaItem[] })),
      ithraaApi.items({ kind: "book", limit: 12 }).catch(() => ({ items: [] as IthraaItem[] })),
      ithraaApi.items({ kind: "article", limit: 5 }).catch(() => ({ items: [] as IthraaItem[] })),
      ithraaApi.items({ kind: "book", sort: "popular", limit: 12 }).catch(() => ({ items: [] as IthraaItem[] })),
    ]);
    if (m) setMeta(m);
    setFeatured(f.items); setLatestBooks(b.items); setLatestArticles(a.items); setPopular(p.items);
  }, [token]);

  const loadList = useCallback(async (kind: IthraaKind, append = false) => {
    const r = await ithraaApi.items({ kind, category: shelf || undefined, q: query || undefined, sort, limit: 30, offset: append ? list.length : 0 }).catch(() => null);
    if (!r) return;
    setList((prev) => (append ? [...prev, ...r.items] : r.items));
    setHasMore(r.has_more);
  }, [shelf, query, sort, list.length]);

  const loadMine = useCallback(async () => {
    if (!signedIn) return;
    setMine(await ithraaApi.mine(token!).catch(() => ({ items: [], points: 0 })));
  }, [signedIn, token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "home") await loadHome();
      else if (tab === "mine") { await loadMine(); if (!meta) setMeta(await ithraaApi.meta(token).catch(() => null)); }
      else { if (!meta) setMeta(await ithraaApi.meta(token).catch(() => null)); await loadList(tab === "books" ? "book" : "article"); }
    } finally { setLoading(false); setRefreshing(false); }
  }, [tab, loadHome, loadMine, loadList, meta, token]);

  useFocusEffect(useCallback(() => { load(); }, [tab, shelf, sort, query, token])); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const open = (it: IthraaItem) => router.push({ pathname: "/ithraa-item", params: { id: String(it.id) } } as any);
  const contribute = (kind?: IthraaKind) => {
    if (!signedIn) return notify("سجّل الدخول", "سجّل الدخول لتشارك كتاباً أو مقالاً في «إثراء».");
    router.push({ pathname: "/ithraa-submit", params: kind ? { kind } : {} } as any);
  };
  const goShelf = (key: string) => { setShelf(key); setTab("books"); };

  const totals = meta?.totals ?? { books: 0, articles: 0 };
  const pending = meta?.me?.pending ?? 0;

  const header = (
    <LinearGradient colors={[ITHRAA_DEEP, ITHRAA]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { paddingTop: insets.top + 10 }]}>
      <View style={[u.rowR, { justifyContent: "space-between" }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={s.iconBtn} hitSlop={8} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>
        {meta?.me?.can_review ? (
          <Pressable onPress={() => router.push("/ithraa-admin" as any)} style={s.reviewBtn} accessibilityLabel="لوحة الإشراف">
            <Ionicons name="shield-checkmark" size={16} color={ITHRAA_DEEP} />
            <Text style={s.reviewText}>الإشراف</Text>
            {pending > 0 && <View style={s.badge}><Text style={s.badgeText}>{pending > 99 ? "99+" : pending}</Text></View>}
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>
      <View style={[u.rowR, { gap: 12, marginTop: 10 }]}>
        <View style={s.logo}><Ionicons name="library" size={26} color={ITHRAA_GOLD} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>إثراء</Text>
          <Text style={s.heroSub}>المكتبة الثقافية لأهل الحصاحيصا — اقرأ، شارك، وأثرِ المحتوى العربي</Text>
        </View>
      </View>
      <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
        <Stat n={totals.books} label="كتاب" />
        <Stat n={totals.articles} label="مقال" />
        <Stat n={meta?.shelves.length ?? 16} label="رفاً" />
      </View>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={q} onChangeText={(t) => { setQ(t); if (tab === "home" || tab === "mine") setTab("books"); }}
          placeholder="ابحث بعنوان أو مؤلف أو وسم…" placeholderTextColor={Colors.textMuted} style={s.searchInput} returnKeyType="search"
        />
        {!!q && <Pressable onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable>}
      </View>
    </LinearGradient>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ITHRAA} />}
        stickyHeaderIndices={[1]}
      >
        {header}
        <View style={s.tabsWrap}>
          <View style={s.tabs}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
                <Ionicons name={t.icon} size={15} color={tab === t.key ? "#fff" : Colors.textSecondary} />
                <Text style={[s.tabText, tab === t.key && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {loading && !refreshing && <ActivityIndicator color={ITHRAA} style={{ marginTop: 30 }} />}

          {!loading && tab === "home" && (
            <>
              <ContributeCard points={meta?.points ?? 0} onBook={() => contribute("book")} onArticle={() => contribute("article")} />

              <Pressable onPress={() => router.push("/writers" as any)} style={{ marginTop: 12 }} accessibilityRole="button">
                <LinearGradient colors={["#2A1512", "#7A2E3A"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.diwan}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.diwanK}>جديد في إثراء</Text>
                    <Text style={s.diwanT}>ديوان الكُتّاب</Text>
                    <Text style={s.diwanS}>اكتب القصة والشعر والخاطرة، ووثّق نصك برقم يحفظ حقك — وشارك في مسابقة حصاحيصاوي الأدبية.</Text>
                  </View>
                  <View style={s.diwanIcon}><Ionicons name="create" size={26} color={ITHRAA_GOLD} /></View>
                </LinearGradient>
              </Pressable>

              {featured.length > 0 && (
                <>
                  <SectionTitle title="مختارات المشرفين" />
                  <HRow>{featured.map((it) => it.kind === "book"
                    ? <BookTile key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} />
                    : <FeaturedArticle key={it.id} item={it} onPress={() => open(it)} />)}</HRow>
                </>
              )}

              <SectionTitle title="رفوف المكتبة" />
              <View style={u.wrap}>
                {(meta?.shelves ?? []).map((sh) => <ShelfTile key={sh.key} shelf={sh} onPress={() => goShelf(sh.key)} />)}
              </View>

              <SectionTitle title="أحدث الكتب" action={latestBooks.length ? "الكل" : undefined} onAction={() => { setShelf(""); setSort("new"); setTab("books"); }} />
              {latestBooks.length
                ? <HRow>{latestBooks.map((it) => <BookTile key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} />)}</HRow>
                : <Empty icon="book-outline" title="لا توجد كتب منشورة بعد" sub="كن أول من يضيف كتاباً إلى رفوف «إثراء»." action="أضف كتاباً" onAction={() => contribute("book")} />}

              {popular.length > 3 && (
                <>
                  <SectionTitle title="الأكثر قراءة" />
                  <HRow>{popular.map((it) => <BookTile key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} />)}</HRow>
                </>
              )}

              <SectionTitle title="مقالات حديثة" action={latestArticles.length ? "الكل" : undefined} onAction={() => { setShelf(""); setTab("articles"); }} />
              {latestArticles.length
                ? latestArticles.map((it) => <ArticleCard key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} />)
                : <Empty icon="newspaper-outline" title="لا توجد مقالات بعد" sub="اكتب مقالك داخل التطبيق وسينشره المشرف بعد المراجعة." action="اكتب مقالاً" onAction={() => contribute("article")} />}

              <Guide />
            </>
          )}

          {!loading && (tab === "books" || tab === "articles") && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {[{ key: "", label: "كل الرفوف" }, ...(meta?.shelves ?? [])].map((sh) => (
                  <View key={sh.key || "all"} style={{ transform: [{ scaleX: -1 }] }}>
                    <Pill label={sh.label} on={shelf === sh.key} onPress={() => setShelf(sh.key)} color={sh.key ? shelfColor(sh.key) : ITHRAA} />
                  </View>
                ))}
              </ScrollView>
              <View style={[u.rowR, { justifyContent: "space-between", marginTop: 12 }]}>
                <Text style={s.count}>{list.length}{hasMore ? "+" : ""} {tab === "books" ? "كتاب" : "مقال"}{query ? ` · «${query}»` : ""}</Text>
                <View style={[u.rowR, { gap: 6 }]}>
                  <Pill label="الأحدث" on={sort === "new"} onPress={() => setSort("new")} icon="time-outline" />
                  <Pill label="الأكثر قراءة" on={sort === "popular"} onPress={() => setSort("popular")} icon="flame-outline" />
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                {tab === "books" && list.length > 0 && (
                  <View style={s.grid}>
                    {list.map((it) => <BookTile key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} width={104} />)}
                  </View>
                )}
                {tab === "articles" && list.map((it) => <ArticleCard key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)} />)}
                {!list.length && (
                  <Empty
                    icon={tab === "books" ? "book-outline" : "newspaper-outline"}
                    title={query ? "لا نتائج مطابقة" : "هذا الرف ينتظر أول مساهمة"}
                    sub={query ? "جرّب كلمة أخرى أو رفاً مختلفاً." : "شارك ما يفيد القرّاء وسيراجعه المشرف."}
                    action={tab === "books" ? "أضف كتاباً" : "اكتب مقالاً"}
                    onAction={() => contribute(tab === "books" ? "book" : "article")}
                  />
                )}
                {hasMore && (
                  <Pressable onPress={() => loadList(tab === "books" ? "book" : "article", true)} style={[u.ghostBtn, { marginTop: 8 }]}>
                    <Text style={u.ghostText}>عرض المزيد</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {!loading && tab === "mine" && (
            !signedIn ? (
              <Empty icon="person-circle-outline" title="سجّل الدخول لترى مساهماتك" sub="تابع حالة كتبك ومقالاتك: قيد المراجعة، منشورة، أو تحتاج تعديلاً." />
            ) : (
              <>
                <View style={[u.card, { marginTop: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 }]}>
                  <View style={[s.logo, { backgroundColor: ITHRAA_GOLD + "22" }]}><Ionicons name="ribbon" size={22} color={ITHRAA_GOLD} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mineTitle}>{mine?.items.filter((x) => x.status === "approved").length ?? 0} مساهمة منشورة</Text>
                    <Text style={u.hint}>رصيدك من «إثراء»: {mine?.points ?? 0} نقطة تطوع{meta?.points ? ` · ${meta.points} نقاط لكل مساهمة مقبولة` : ""}</Text>
                  </View>
                </View>
                <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
                  <Pressable onPress={() => contribute("book")} style={[u.primaryBtn, { flex: 1 }]}><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={u.primaryText}>رفع كتاب</Text></Pressable>
                  <Pressable onPress={() => contribute("article")} style={[u.primaryBtn, { flex: 1, backgroundColor: ITHRAA_GOLD }]}><Ionicons name="create-outline" size={18} color="#fff" /><Text style={u.primaryText}>كتابة مقال</Text></Pressable>
                </View>
                <View style={{ marginTop: 14 }}>
                  {(mine?.items ?? []).map((it) => (
                    <ItemRow key={it.id} item={it} color={shelfColor(it.category)} onPress={() => open(it)}
                      footer={it.status === "rejected" && it.review_note ? (
                        <View style={s.noteBox}><Ionicons name="chatbox-ellipses-outline" size={13} color="#C0392B" /><Text style={s.noteText}>ملاحظة المشرف: {it.review_note}</Text></View>
                      ) : it.status === "pending" ? <Text style={u.hint}>بانتظار المشرف — سيصلك إشعار عند المراجعة</Text> : null}
                    />
                  ))}
                  {!mine?.items.length && <Empty icon="sparkles-outline" title="لم تساهم بعد" sub="ابدأ بكتاب تحبه أو مقال تكتبه — كل مساهمة مقبولة تُضاف لرصيد تطوعك." />}
                </View>
              </>
            )
          )}
        </View>
      </ScrollView>

      {signedIn && tab !== "mine" && (
        <Pressable onPress={() => contribute(tab === "articles" ? "article" : tab === "books" ? "book" : undefined)} style={[s.fab, { bottom: insets.bottom + 20 }]} accessibilityLabel="مساهمة جديدة">
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.fabText}>ساهم</Text>
        </Pressable>
      )}
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n.toLocaleString("ar-EG")}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

function HRow({ children }: { children: React.ReactNode }) {
  // تمرير أفقي يبدأ من اليمين في كل المنصات
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }], marginHorizontal: -16 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
      {React.Children.map(children, (c) => <View style={{ transform: [{ scaleX: -1 }] }}>{c}</View>)}
    </ScrollView>
  );
}

function FeaturedArticle({ item, onPress }: { item: IthraaItem; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.featArticle}>
      <LinearGradient colors={[ITHRAA_GOLD, "#9C7420"]} style={StyleSheet.absoluteFill} />
      <Ionicons name="newspaper" size={22} color="rgba(255,255,255,0.9)" style={{ alignSelf: "flex-end" }} />
      <Text numberOfLines={4} style={s.featTitle}>{item.title}</Text>
      <Text numberOfLines={1} style={s.featSub}>{item.author_name || item.uploader_name} · {item.read_minutes} د</Text>
    </Pressable>
  );
}

function ContributeCard({ points, onBook, onArticle }: { points: number; onBook: () => void; onArticle: () => void }) {
  return (
    <View style={[u.card, { marginTop: 14, borderColor: ITHRAA + "33" }]}>
      <View style={[u.rowR, { gap: 10 }]}>
        <Ionicons name="sparkles" size={20} color={ITHRAA_GOLD} />
        <Text style={s.mineTitle}>ساهم في إثراء المكتبة</Text>
      </View>
      <Text style={[u.hint, { marginTop: 4 }]}>ارفع كتاباً (PDF، EPUB، Word…) أو اكتب مقالاً. يراجعه مشرف الرف ثم يُنشر{points ? `، وتكسب ${points} نقاط تطوع` : ""}.</Text>
      <View style={[u.rowR, { gap: 8, marginTop: 10 }]}>
        <Pressable onPress={onBook} style={[u.primaryBtn, { flex: 1, paddingVertical: 10 }]}><Ionicons name="cloud-upload-outline" size={17} color="#fff" /><Text style={[u.primaryText, { fontSize: 14 }]}>رفع كتاب</Text></Pressable>
        <Pressable onPress={onArticle} style={[u.primaryBtn, { flex: 1, paddingVertical: 10, backgroundColor: ITHRAA_GOLD }]}><Ionicons name="create-outline" size={17} color="#fff" /><Text style={[u.primaryText, { fontSize: 14 }]}>كتابة مقال</Text></Pressable>
      </View>
    </View>
  );
}

function Guide() {
  const steps = [
    { icon: "cloud-upload-outline", t: "ارفع أو اكتب", d: "اختر الرف المناسب، وأرفق الملف أو رابطه، أو اكتب مقالك مباشرة." },
    { icon: "shield-checkmark-outline", t: "مراجعة المشرف", d: "يراجع مشرف الرف أو مسؤول التطبيق المحتوى وحقوق نشره." },
    { icon: "checkmark-done-outline", t: "النشر والإشعار", d: "يُنشر للقرّاء ويصلك إشعار بالنقاط، أو بملاحظة للتعديل." },
  ] as const;
  return (
    <>
      <SectionTitle title="كيف تعمل المساهمة؟" />
      <View style={[u.card, { gap: 12 }]}>
        {steps.map((x, i) => (
          <View key={i} style={[u.rowR, { gap: 10, alignItems: "flex-start" }]}>
            <View style={[s.stepNo]}><Ionicons name={x.icon as any} size={16} color={ITHRAA} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepT}>{x.t}</Text>
              <Text style={u.hint}>{x.d}</Text>
            </View>
          </View>
        ))}
        <Text style={[u.hint, { color: Colors.textSecondary }]}>نحترم حقوق المؤلفين: يُنشر فقط ما يملك صاحبه حق مشاركته، أو ما هو ملكية عامة.</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  reviewBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: ITHRAA_GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  reviewText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: ITHRAA_DEEP },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#C0392B", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  logo: { width: 50, height: 50, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.85)", textAlign: "right", lineHeight: 20 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "rgba(255,255,255,0.8)" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 12, marginTop: 14, height: 46 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 0 },
  tabsWrap: { backgroundColor: Colors.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tabs: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 10 },
  tabOn: { backgroundColor: ITHRAA },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 14, justifyContent: "flex-start" },
  count: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  mineTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  noteBox: { flexDirection: "row-reverse", gap: 6, backgroundColor: "#C0392B12", borderRadius: 10, padding: 8, marginTop: 4 },
  noteText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12, color: "#9B2C2C", textAlign: "right", lineHeight: 19 },
  fab: { position: "absolute", left: 20, flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: ITHRAA, paddingHorizontal: 18, height: 50, borderRadius: 25,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  featArticle: { width: 150, height: 163, borderRadius: 10, padding: 12, overflow: "hidden", justifyContent: "space-between" },
  featTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff", textAlign: "right", lineHeight: 21 },
  featSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  stepNo: { width: 32, height: 32, borderRadius: 10, backgroundColor: ITHRAA + "14", alignItems: "center", justifyContent: "center" },
  diwan: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: 18, padding: 16 },
  diwanK: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: ITHRAA_GOLD, textAlign: "right" },
  diwanT: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff", textAlign: "right" },
  diwanS: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.85)", textAlign: "right", lineHeight: 20 },
  diwanIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  stepT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
});
