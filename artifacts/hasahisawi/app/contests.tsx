// المسابقات: واجهة رئيسية بمسابقة مميّزة وعدّ تنازلي، المناسبات القادمة، قائمة بفلاتر وبحث وترتيب،
// المنتهية بفائزيها، لوحة الشرف، ومسابقاتي. كل الأرقام من الخادم — لا بيانات تجريبية.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, RefreshControl, TextInput, Modal, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import {
  contestsApi, themeOf, OCCASION_THEME, CATEGORIES, prizeTiers, useNow,
  type Contest, type Occasion, type MyContest, type HallOfFame, type ContestCategory,
} from "@/lib/contests";
import { reminderKeys, toggleReminder } from "@/lib/contest-reminders";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { LoadError } from "@/components/ui/LoadState";
import UserAvatar from "@/components/UserAvatar";
import ContestCard from "@/components/contests/ContestCard";
import {
  AvatarStack, CategoryChip, ContestsSkeleton, Countdown, EmptyArt, Podium, SponsorChip, StatusPill, Skeleton,
} from "@/components/contests/ContestUI";
import { useSectionVisible } from "@/lib/feature-flags-context";
import { notify } from "@/lib/xplatform";

type Tab = "live" | "ended" | "hall" | "mine";
type Sort = "ending" | "newest" | "popular";
type Spot = { kind: "live" | "upcoming"; c: Contest } | { kind: "occasion"; o: Occasion };
const TABS: [Tab, string, keyof typeof Ionicons.glyphMap][] = [
  ["live", "المسابقات", "flash-outline"], ["ended", "المنتهية", "flag-outline"],
  ["hall", "لوحة الشرف", "ribbon-outline"], ["mine", "مسابقاتي", "person-outline"],
];

const daysLabel = (d: number) => (d <= 0 ? "اليوم" : d === 1 ? "غداً" : d === 2 ? "بعد يومين" : d <= 10 ? `بعد ${d} أيام` : `بعد ${d} يوماً`);
const arDate = (iso: string) => new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });

export default function ContestsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user, isGuest } = useAuth();
  const staff = user?.role === "admin" || user?.role === "moderator";
  const sectionVisible = useSectionVisible("contests");
  const now = useNow(1000);

  const [list, setList] = useState<Contest[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [tab, setTab] = useState<Tab>("live");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<ContestCategory | null>(null);
  const [sort, setSort] = useState<Sort>("ending");
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [occOpen, setOccOpen] = useState<Occasion | null>(null);

  const [mine, setMine] = useState<MyContest[] | null>(null);
  const [mineErr, setMineErr] = useState(false);
  const [hall, setHall] = useState<HallOfFame | null>(null);
  const [hallErr, setHallErr] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [l, o] = await Promise.all([contestsApi.list(token), contestsApi.occasions().catch(() => [] as Occasion[])]);
      setList(l);
      setOccasions(o);
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const loadMine = useCallback(async () => {
    if (!token || isGuest) return;
    setMineErr(false);
    try { setMine(await contestsApi.mine(token)); } catch { setMineErr(true); }
  }, [token, isGuest]);

  const loadHall = useCallback(async () => {
    setHallErr(false);
    try { setHall(await contestsApi.hallOfFame(token)); } catch { setHallErr(true); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); reminderKeys().then(setReminders); }, [load]));
  useEffect(() => {
    if (tab === "mine") loadMine();
    if (tab === "hall") loadHall();
  }, [tab, loadMine, loadHall]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
    if (tab === "mine") loadMine();
    if (tab === "hall") loadHall();
  };

  // ── المسابقة المميّزة في الواجهة ──
  const spotlight = useMemo((): Spot | null => {
    const live = list.filter((c) => c.state === "active").sort((a, b) => +new Date(a.ends_at) - +new Date(b.ends_at));
    const feat = live.find((c) => c.featured) ?? live[0];
    if (feat) return { kind: "live", c: feat };
    const up = list.filter((c) => c.state === "upcoming").sort((a, b) => (Number(!!b.featured) - Number(!!a.featured)) || (+new Date(a.starts_at) - +new Date(b.starts_at)))[0];
    if (up) return { kind: "upcoming", c: up };
    if (occasions[0]) return { kind: "occasion", o: occasions[0] };
    return null;
  }, [list, occasions]);

  const categories = useMemo(() => {
    const set = new Set<ContestCategory>();
    list.forEach((c) => { if (c.category && CATEGORIES[c.category]) set.add(c.category); });
    return [...set];
  }, [list]);

  const shown = useMemo(() => {
    const q = query.trim();
    let r = list.filter((c) => (tab === "ended" ? c.state === "ended" : c.state !== "ended"));
    if (cat) r = r.filter((c) => c.category === cat);
    if (q) r = r.filter((c) => [c.title, c.description, c.sponsor_name, c.prize].some((x) => x && x.includes(q)));
    // المسابقة المعروضة في الواجهة لا تتكرر في القائمة ما لم يبحث المستخدم أو يصفّي
    if (tab === "live" && !q && !cat && spotlight && spotlight.kind !== "occasion") r = r.filter((c) => c.id !== spotlight.c.id);
    const eff: Sort = tab === "ended" && sort === "ending" ? "newest" : sort;
    const key = (c: Contest) =>
      eff === "popular" ? -c.entries_count
        : eff === "newest" ? -new Date(c.created_at ?? c.starts_at).getTime()
          : (c.state === "active" ? 0 : 1e15) + new Date(c.state === "active" ? c.ends_at : c.starts_at).getTime();
    return [...r].sort((a, b) => key(a) - key(b));
  }, [list, tab, cat, query, sort, spotlight]);

  const remind = async (key: string, title: string, startIso: string) => {
    const r = await toggleReminder(key, "حان موعد المسابقة", `${title}: ادخل الآن وشارك.`, startIso);
    setReminders(await reminderKeys());
    if (r.on) {
      notify("سنذكّرك", Platform.OS === "web" ? "حفظنا اختيارك. فعّل الإشعارات من تطبيق الهاتف لتصلك التذكيرات." : r.scheduled ? "يصلك إشعار يوم البدء." : "حفظنا اختيارك. اسمح بالإشعارات ليصلك التنبيه.");
    }
  };

  const openContest = (id: number) => router.push({ pathname: "/contest" as any, params: { id: String(id) } });

  const header = (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={s.glassBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityRole="button" accessibilityLabel="رجوع" hitSlop={6}>
        <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.heroTitle}>المسابقات</Text>
        <Text style={s.heroSub}>جوائز طوال العام، في المناسبات وبرعاية جهات المدينة</Text>
      </View>
      {staff ? (
        <TouchableOpacity style={s.glassBtn} onPress={() => router.push("/contests-admin" as any)} accessibilityRole="button" accessibilityLabel="إدارة المسابقات" hitSlop={6}>
          <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ) : <View style={{ width: 44 }} />}
    </View>
  );

  if (!sectionVisible && !staff) {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <LinearGradient colors={["#006B4A", "#004D36"]} style={{ paddingBottom: 18 }}>{header}</LinearGradient>
        <View style={s.empty}>
          <EmptyArt />
          <Text style={s.emptyTitle}>قسم المسابقات غير متاح حالياً</Text>
        </View>
      </View>
    );
  }

  const heroTheme = spotlight && spotlight.kind !== "occasion" ? themeOf(spotlight.c) : spotlight?.kind === "occasion" ? (OCCASION_THEME[spotlight.o.key] ?? OCCASION_THEME.sponsored) : OCCASION_THEME.sponsored;

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── الواجهة ── */}
        <View style={s.hero}>
          <LinearGradient colors={heroTheme.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {spotlight && spotlight.kind !== "occasion" && spotlight.c.cover_image ? (
            <>
              <Image source={{ uri: spotlight.c.cover_image }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.85)"]} style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <>
              <View style={[s.ring, { width: 280, height: 280, top: -110, left: -100, borderColor: heroTheme.accent }]} />
              <View style={[s.ring, { width: 160, height: 160, bottom: -40, right: -50, borderColor: heroTheme.accent }]} />
            </>
          )}
          {header}
          {!sectionVisible && staff ? (
            <View style={s.hiddenNote}>
              <Ionicons name="eye-off-outline" size={16} color="#1F1300" />
              <Text style={s.hiddenNoteText}>القسم مخفي عن المستخدمين. أظهره من لوحة الإدارة ← أقسام التطبيق</Text>
            </View>
          ) : null}
          <View style={s.spot}>
            {loading ? (
              <View style={{ gap: 10 }}>
                <Skeleton style={{ height: 26, width: "60%", alignSelf: "flex-end", backgroundColor: "rgba(255,255,255,0.18)" }} />
                <Skeleton style={{ height: 70, backgroundColor: "rgba(255,255,255,0.14)" }} />
                <Skeleton style={{ height: 50, backgroundColor: "rgba(255,255,255,0.14)" }} />
              </View>
            ) : spotlight?.kind === "live" || spotlight?.kind === "upcoming" ? (
              <Spotlight
                c={spotlight.c} now={now} accent={heroTheme.accent}
                reminded={reminders.has(`contest:${spotlight.c.id}`)}
                onOpen={() => openContest(spotlight.c.id)}
                onRemind={() => remind(`contest:${spotlight.c.id}`, spotlight.c.title, spotlight.c.starts_at)}
              />
            ) : spotlight?.kind === "occasion" ? (
              <View style={{ gap: 12 }}>
                <View style={s.spotLabel}>
                  <Ionicons name={heroTheme.icon as any} size={16} color={heroTheme.accent} />
                  <Text style={[s.spotLabelText, { color: heroTheme.accent }]}>المناسبة القادمة</Text>
                </View>
                <Text style={s.spotTitle} numberOfLines={2}>{spotlight.o.name}</Text>
                <Text style={s.spotBody} numberOfLines={2}>{spotlight.o.title}: {spotlight.o.description}</Text>
                <Text style={s.spotWhen}>تبدأ خلال {spotlight.o.daysAway <= 0 ? "ساعات" : daysLabel(spotlight.o.daysAway).replace("بعد ", "")} · {arDate(spotlight.o.date)}</Text>
                <Countdown to={`${spotlight.o.date}T00:00:00`} now={now} />
                <TouchableOpacity
                  style={[s.cta, { backgroundColor: heroTheme.accent }]}
                  onPress={() => remind(`occasion:${spotlight.o.key}`, spotlight.o.title, `${spotlight.o.date}T00:00:00`)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reminders.has(`occasion:${spotlight.o.key}`) }}
                >
                  <Ionicons name={reminders.has(`occasion:${spotlight.o.key}`) ? "notifications" : "notifications-outline"} size={18} color="#1F1300" />
                  <Text style={s.ctaText}>{reminders.has(`occasion:${spotlight.o.key}`) ? "التذكير مفعّل، اضغط للإلغاء" : "ذكّرني"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={s.spotBody}>لا توجد مسابقات الآن.</Text>
            )}
          </View>
        </View>

        {/* ── المناسبات القادمة ── */}
        {occasions.length > 0 && (
          <View style={{ gap: 10, marginTop: 18 }}>
            <View style={s.sectionRow}>
              <Text style={s.section}>مناسبات قادمة</Text>
              <Text style={s.sectionHint}>اضغط مناسبة لتفاصيلها</Text>
            </View>
            <RtlScrollRow contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {occasions.map((o) => {
                const t = OCCASION_THEME[o.key] ?? OCCASION_THEME.sponsored;
                const related = list.filter((c) => c.occasion === o.key && c.state !== "ended").length;
                return (
                  <Pressable key={o.key} onPress={() => setOccOpen(o)} accessibilityRole="button" accessibilityLabel={`${o.name}، ${daysLabel(o.daysAway)}`}
                    style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}>
                    <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.occ}>
                      <View style={s.occTop}>
                        <View style={[s.occIcon, { borderColor: t.accent }]}><Ionicons name={t.icon as any} size={17} color={t.accent} /></View>
                        {reminders.has(`occasion:${o.key}`) ? <Ionicons name="notifications" size={16} color={t.accent} accessibilityLabel="التذكير مفعّل" /> : null}
                      </View>
                      <Text style={s.occName} numberOfLines={2}>{o.name}</Text>
                      <View style={s.occFoot}>
                        <Text style={[s.occDays, { color: t.accent }]}>{daysLabel(o.daysAway)}</Text>
                        {related > 0 ? <Text style={s.occRel}>{related} مسابقة</Text> : null}
                      </View>
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </RtlScrollRow>
          </View>
        )}

        {/* ── التبويبات ── */}
        <View style={s.tabs} accessibilityRole="tablist">
          {TABS.map(([k, l, icon]) => {
            const on = tab === k;
            return (
              <TouchableOpacity key={k} style={[s.tab, on && s.tabOn]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Ionicons name={icon} size={16} color={on ? Colors.onColor : Colors.textSecondary} />
                <Text style={[s.tabText, on && { color: Colors.onColor }]} numberOfLines={1}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14, marginTop: 14 }}>
          {(tab === "live" || tab === "ended") && (
            loading ? <ContestsSkeleton /> : error ? (
              <LoadError onRetry={() => { setLoading(true); load(); }} message="تعذّر تحميل المسابقات" />
            ) : (
              <>
                {list.some((c) => (tab === "ended" ? c.state === "ended" : c.state !== "ended")) && (
                  <View style={{ gap: 10 }}>
                    <View style={s.search}>
                      <Ionicons name="search" size={18} color={Colors.textMuted} />
                      <TextInput
                        style={s.searchInput} value={query} onChangeText={setQuery} placeholder="ابحث باسم المسابقة أو الراعي أو الجائزة"
                        placeholderTextColor={Colors.textMuted} textAlign="right" accessibilityLabel="بحث في المسابقات" returnKeyType="search"
                      />
                      {query ? (
                        <TouchableOpacity onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="مسح البحث" hitSlop={10}>
                          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {categories.length > 0 && (
                      <RtlScrollRow contentContainerStyle={{ gap: 8 }}>
                        <Chip label="الكل" on={!cat} onPress={() => setCat(null)} />
                        {categories.map((k) => (
                          <Chip key={k} label={CATEGORIES[k].label} icon={CATEGORIES[k].icon as any} on={cat === k} onPress={() => setCat(cat === k ? null : k)} />
                        ))}
                      </RtlScrollRow>
                    )}
                    <View style={s.sortRow}>
                      <Ionicons name="swap-vertical" size={16} color={Colors.textSecondary} />
                      {([["ending", "الأقرب انتهاءً"], ["newest", "الأحدث"], ["popular", "الأكثر مشاركة"]] as const)
                        .filter(([k]) => !(tab === "ended" && k === "ending"))
                        .map(([k, l]) => {
                          const on = (tab === "ended" && sort === "ending" ? "newest" : sort) === k;
                          return (
                            <TouchableOpacity key={k} onPress={() => setSort(k)} style={[s.sortBtn, on && s.sortOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                              <Text style={[s.sortText, on && { color: Colors.primaryDeep }]}>{l}</Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </View>
                )}

                {shown.length === 0 ? (
                  query || cat ? (
                    <EmptyState icon="search" title="لا نتائج مطابقة" body="جرّب كلمة أخرى أو اعرض كل التصنيفات."
                      primary={{ label: "مسح البحث والتصفية", onPress: () => { setQuery(""); setCat(null); } }} />
                  ) : tab === "live" ? (
                    spotlight && spotlight.kind !== "occasion" ? (
                      <Text style={s.muted}>لا مسابقات أخرى الآن غير المعروضة في الأعلى.</Text>
                    ) : (
                      <EmptyState
                        title="لا مسابقات جارية الآن"
                        body={occasions[0] ? `أقرب مناسبة: ${occasions[0].name} (${daysLabel(occasions[0].daysAway)}). فعّل التذكير ليصلك إشعار عند انطلاق مسابقتها.` : "تابعنا، نعلن المسابقات الجديدة هنا."}
                        primary={occasions[0] ? { label: reminders.has(`occasion:${occasions[0].key}`) ? "التذكير مفعّل" : "ذكّرني بالمناسبة القادمة", icon: "notifications-outline", onPress: () => remind(`occasion:${occasions[0].key}`, occasions[0].title, `${occasions[0].date}T00:00:00`) } : undefined}
                        secondary={{ label: "تصفّح الفائزين السابقين", onPress: () => setTab("hall") }}
                      />
                    )
                  ) : (
                    <EmptyState icon="flag" title="لم تنتهِ أي مسابقة بعد" body="حين تنتهي مسابقة يظهر هنا فائزوها وجوائزهم."
                      primary={{ label: "اعرض المسابقات الجارية", onPress: () => setTab("live") }} />
                  )
                ) : (
                  shown.map((c) => (
                    c.state === "ended" && (c.top_winners?.length ?? 0) > 0
                      ? <EndedCard key={c.id} c={c} onPress={() => openContest(c.id)} />
                      : <ContestCard key={c.id} c={c} now={now} onPress={() => openContest(c.id)} />
                  ))
                )}
              </>
            )
          )}

          {tab === "hall" && (
            hallErr ? <LoadError onRetry={loadHall} message="تعذّر تحميل لوحة الشرف" /> : !hall ? (
              <View style={{ gap: 12 }}><Skeleton style={{ height: 230, borderRadius: 22 }} /><Skeleton style={{ height: 70 }} /><Skeleton style={{ height: 70 }} /></View>
            ) : hall.leaders.length === 0 ? (
              <EmptyState icon="ribbon" title="لوحة الشرف تنتظر أول فائز"
                body="يدخلها كل من يفوز في مسابقة. شارك في المسابقات الجارية لتكون أول الأسماء."
                primary={{ label: "اعرض المسابقات الجارية", onPress: () => setTab("live") }} />
            ) : (
              <>
                <View style={s.card}>
                  <Text style={s.cardTitle}>الأكثر فوزاً</Text>
                  <Podium
                    items={hall.leaders.slice(0, 3).map((l, i) => ({ ...l, rank: i + 1, sub: `${l.wins} ${l.wins === 1 ? "فوز" : "مرات فوز"}` }))}
                    onPress={(id) => router.push({ pathname: "/profile" as any, params: { id: String(id) } })}
                  />
                  {hall.leaders.slice(3, 10).map((l, i) => (
                    <TouchableOpacity key={l.user_id} style={s.leaderRow} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(l.user_id) } })} accessibilityRole="button">
                      <Text style={s.leaderRank}>{i + 4}</Text>
                      <UserAvatar name={l.name} avatarUrl={l.avatar_url} size={36} borderRadius={18} />
                      <Text style={[s.leaderName, { flex: 1 }]} numberOfLines={1}>{l.name}</Text>
                      <Text style={s.leaderWins}>{l.wins} فوز</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.section, { paddingHorizontal: 0 }]}>لوحة الشرف: آخر الفائزين</Text>
                {hall.recent.map((w) => {
                  const t = OCCASION_THEME[w.occasion ?? ""] ?? OCCASION_THEME.sponsored;
                  return (
                    <TouchableOpacity key={`${w.contest_id}-${w.user_id}`} style={s.honorRow} onPress={() => openContest(w.contest_id)} accessibilityRole="button"
                      accessibilityLabel={`${w.name}، المركز ${w.rank ?? 1} في ${w.contest_title}`}>
                      <View>
                        <UserAvatar name={w.name} avatarUrl={w.avatar_url} size={46} borderRadius={23} />
                        <View style={[s.rankBadge, { backgroundColor: (w.rank ?? 1) === 1 ? "#F2C94C" : (w.rank ?? 1) === 2 ? "#CBD5E1" : "#E3B583" }]}>
                          <Text style={s.rankBadgeText}>{w.rank ?? 1}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.leaderName} numberOfLines={1}>{w.name}</Text>
                        <Text style={s.muted} numberOfLines={1}>{w.contest_title}</Text>
                        {w.prize ? (
                          <View style={s.row}><Ionicons name="gift-outline" size={13} color={Colors.accentDeep} /><Text style={s.prizeSmall} numberOfLines={1}>{w.prize}</Text></View>
                        ) : null}
                      </View>
                      <View style={[s.honorIcon, { backgroundColor: t.grad[0] }]}><Ionicons name={t.icon as any} size={16} color={t.accent} /></View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )
          )}

          {tab === "mine" && (
            !token || isGuest ? (
              <EmptyState icon="person" title="سجّل الدخول لتتابع مشاركاتك" body="نحفظ لك كل مسابقة شاركت فيها، رقم مشاركتك، ونتيجتك."
                primary={{ label: "تسجيل الدخول", icon: "log-in-outline", onPress: () => router.push("/login" as any) }} />
            ) : mineErr ? <LoadError onRetry={loadMine} message="تعذّر تحميل مسابقاتك" /> : !mine ? (
              <View style={{ gap: 12 }}><Skeleton style={{ height: 120, borderRadius: 20 }} /><Skeleton style={{ height: 90 }} /><Skeleton style={{ height: 90 }} /></View>
            ) : (
              <MineView mine={mine} onOpen={openContest} onBrowse={() => setTab("live")} />
            )
          )}
        </View>
      </ScrollView>

      {/* ── تفاصيل المناسبة ── */}
      <Modal visible={!!occOpen} transparent animationType="slide" onRequestClose={() => setOccOpen(null)}>
        <Pressable style={s.backdrop} onPress={() => setOccOpen(null)} accessibilityLabel="إغلاق" />
        {occOpen ? (() => {
          const o = occOpen;
          const t = OCCASION_THEME[o.key] ?? OCCASION_THEME.sponsored;
          const related = list.filter((c) => c.occasion === o.key);
          const on = reminders.has(`occasion:${o.key}`);
          return (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sheetHead}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <View style={[s.occIcon, { borderColor: t.accent, width: 44, height: 44, borderRadius: 22 }]}><Ionicons name={t.icon as any} size={22} color={t.accent} /></View>
                  <TouchableOpacity style={s.glassBtn} onPress={() => setOccOpen(null)} accessibilityRole="button" accessibilityLabel="إغلاق" hitSlop={6}>
                    <Ionicons name="close" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                <Text style={s.spotTitle}>{o.name}</Text>
                <Text style={[s.spotWhen, { color: t.accent }]}>{arDate(o.date)} · {daysLabel(o.daysAway)}</Text>
              </LinearGradient>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Text style={s.cardTitle}>{o.title}</Text>
                <Text style={s.body}>{o.description}</Text>
                {o.calendar === "hijri" ? <Text style={s.mutedSmall}>التاريخ محسوب بالتقويم الهجري، وقد يختلف يوماً حسب رؤية الهلال.</Text> : null}
                <TouchableOpacity style={[s.btn, on && s.btnGhost]} onPress={() => remind(`occasion:${o.key}`, o.title, `${o.date}T00:00:00`)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Ionicons name={on ? "notifications-off-outline" : "notifications-outline"} size={18} color={on ? Colors.primaryDeep : Colors.onColor} />
                  <Text style={[s.btnText, on && { color: Colors.primaryDeep }]}>{on ? "إلغاء التذكير" : "ذكّرني بموعدها"}</Text>
                </TouchableOpacity>
                <Text style={s.section}>مسابقات هذه المناسبة</Text>
                {related.length === 0 ? (
                  <Text style={s.muted}>لم تُعلن مسابقة لهذه المناسبة بعد.</Text>
                ) : related.map((c) => (
                  <TouchableOpacity key={c.id} style={s.relRow} onPress={() => { setOccOpen(null); openContest(c.id); }} accessibilityRole="button">
                    <StatusPill state={c.state} />
                    <Text style={[s.leaderName, { flex: 1 }]} numberOfLines={2}>{c.title}</Text>
                    <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
                {staff ? (
                  <TouchableOpacity style={s.btnGhost} onPress={() => { setOccOpen(null); router.push({ pathname: "/contests-admin" as any, params: { occasion: o.key } }); }} accessibilityRole="button">
                    <Ionicons name="add-circle-outline" size={18} color={Colors.primaryDeep} />
                    <Text style={[s.btnText, { color: Colors.primaryDeep }]}>أنشئ مسابقة لهذه المناسبة</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            </View>
          );
        })() : null}
      </Modal>
    </View>
  );
}

// ── المسابقة المميّزة ─────────────────────────────────────────────
function Spotlight({ c, now, accent, reminded, onOpen, onRemind }: {
  c: Contest; now: number; accent: string; reminded: boolean; onOpen: () => void; onRemind: () => void;
}) {
  const t = themeOf(c);
  const tiers = prizeTiers(c);
  const live = c.state === "active";
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        <StatusPill state={c.state} />
        <CategoryChip category={c.category} onDark />
        {c.sponsor_name ? <SponsorChip name={c.sponsor_name} logo={c.sponsor_logo} onDark /> : (
          <View style={s.spotLabel}><Ionicons name={t.icon as any} size={14} color={accent} /><Text style={[s.spotLabelText, { color: accent }]}>{t.label}</Text></View>
        )}
      </View>
      <Pressable onPress={onOpen} accessibilityRole="link">
        <Text style={s.spotTitle} numberOfLines={3}>{c.title}</Text>
      </Pressable>
      {tiers.length > 0 && (
        <View style={[s.prizeHero, { borderColor: accent }]}>
          <View style={[s.prizeIcon, { backgroundColor: accent }]}><Ionicons name="gift" size={18} color="#1F1300" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.prizeLabel, { color: accent }]}>{tiers.length > 1 ? `جائزة المركز الأول · ${tiers.length} جوائز` : "الجائزة"}</Text>
            <Text style={s.prizeValue} numberOfLines={2}>{tiers[0]}</Text>
          </View>
        </View>
      )}
      <Text style={s.spotWhen}>{live ? "تنتهي خلال" : "تبدأ خلال"}</Text>
      <Countdown to={live ? c.ends_at : c.starts_at} now={now} />
      <View style={[s.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
        <AvatarStack people={c.participants ?? []} total={c.entries_count} onDark />
        {c.entered ? <View style={s.joinedHero}><Ionicons name="checkmark-circle" size={15} color="#14532D" /><Text style={s.joinedHeroText}>شاركت</Text></View> : null}
      </View>
      {live ? (
        <TouchableOpacity style={[s.cta, { backgroundColor: accent }]} onPress={onOpen} accessibilityRole="button">
          <Text style={s.ctaText}>{c.entered ? "اعرض مشاركتك" : "شارك الآن"}</Text>
          <Ionicons name="arrow-back" size={18} color="#1F1300" />
        </TouchableOpacity>
      ) : (
        <View style={s.row}>
          <TouchableOpacity style={[s.cta, { backgroundColor: accent, flex: 1 }]} onPress={onRemind} accessibilityRole="button" accessibilityState={{ selected: reminded }}>
            <Ionicons name={reminded ? "notifications" : "notifications-outline"} size={18} color="#1F1300" />
            <Text style={s.ctaText}>{reminded ? "سنذكّرك" : "ذكّرني"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.ctaGhost, { flex: 1 }]} onPress={onOpen} accessibilityRole="button">
            <Text style={s.ctaGhostText}>التفاصيل</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── بطاقة مسابقة منتهية بمنصة تتويج مصغرة ──────────────────────────
function EndedCard({ c, onPress }: { c: Contest; onPress: () => void }) {
  const t = themeOf(c);
  const tiers = prizeTiers(c);
  const ws = (c.top_winners ?? []).map((w, i) => ({ ...w, rank: w.rank ?? i + 1, sub: tiers.length > 1 ? tiers[(w.rank ?? i + 1) - 1] ?? null : null }));
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { padding: 0, overflow: "hidden" }, pressed && { opacity: 0.95 }]} accessibilityRole="button" accessibilityLabel={`${c.title}، منتهية`}>
      <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 14, gap: 8 }}>
        <View style={[s.row, { flexWrap: "wrap" }]}>
          <StatusPill state="ended" />
          <CategoryChip category={c.category} onDark />
          {c.sponsor_name ? <SponsorChip name={c.sponsor_name} logo={c.sponsor_logo} onDark /> : null}
        </View>
        <Text style={[s.spotTitle, { fontSize: 18, lineHeight: 30 }]} numberOfLines={2}>{c.title}</Text>
        <Text style={[s.spotWhen, { fontSize: 12 }]}>انتهت في {arDate(c.ends_at)} · {c.entries_count} مشارك</Text>
      </LinearGradient>
      <View style={{ padding: 14, gap: 8 }}>
        <Podium items={ws} />
        {tiers.length === 1 ? <Text style={[s.muted, { textAlign: "center" }]}>الجائزة: {tiers[0]}</Text> : null}
      </View>
    </Pressable>
  );
}

// ── مسابقاتي ───────────────────────────────────────────────────────
function MineView({ mine, onOpen, onBrowse }: { mine: MyContest[]; onOpen: (id: number) => void; onBrowse: () => void }) {
  if (mine.length === 0) {
    return <EmptyState icon="person" title="لم تشارك في أي مسابقة بعد" body="اختر مسابقة جارية وشارك، وتابع نتيجتك من هنا."
      primary={{ label: "تصفّح المسابقات الجارية", onPress: onBrowse }} />;
  }
  const wins = mine.filter((m) => m.my_entry.is_winner);
  const firsts = wins.filter((m) => m.my_entry.rank === 1).length;
  // شارات محسوبة من مشاركاتك الفعلية
  const badges: { label: string; icon: keyof typeof Ionicons.glyphMap; got: boolean; hint: string }[] = [
    { label: "أول مشاركة", icon: "footsteps-outline", got: mine.length >= 1, hint: "شارك في مسابقة" },
    { label: "مشارك دائم", icon: "flame-outline", got: mine.length >= 5, hint: `${Math.min(mine.length, 5)}/5 مسابقات` },
    { label: "فائز", icon: "medal-outline", got: wins.length >= 1, hint: "افُز في مسابقة" },
    { label: "بطل", icon: "trophy-outline", got: firsts >= 1, hint: "المركز الأول" },
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={s.statsRow}>
        <Stat n={mine.length} label="مشاركة" icon="create-outline" />
        <Stat n={wins.length} label="فوز" icon="trophy-outline" />
        <Stat n={mine.filter((m) => m.state !== "ended").length} label="جارية" icon="time-outline" />
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>شاراتك</Text>
        <View style={s.badges}>
          {badges.map((b) => (
            <View key={b.label} style={[s.badge, b.got ? s.badgeOn : s.badgeOff]} accessibilityLabel={`${b.label}، ${b.got ? "مكتسبة" : "لم تُكتسب بعد"}`}>
              <View style={[s.badgeIcon, { backgroundColor: b.got ? Colors.accent : Colors.border }]}>
                <Ionicons name={b.got ? b.icon : "lock-closed-outline"} size={18} color={b.got ? "#1F1300" : Colors.textSecondary} />
              </View>
              <Text style={s.badgeLabel} numberOfLines={1}>{b.label}</Text>
              <Text style={s.mutedSmall} numberOfLines={1}>{b.got ? "مكتسبة" : b.hint}</Text>
            </View>
          ))}
        </View>
      </View>
      {mine.map((m) => {
        const t = themeOf(m);
        const e = m.my_entry;
        const announced = (m.top_winners?.length ?? 0) > 0;
        const result = e.is_winner ? `فزت بالمركز ${e.rank ?? 1}` : m.state !== "ended" ? "المسابقة جارية" : announced ? "لم تفُز هذه المرة" : "بانتظار إعلان النتائج";
        return (
          <TouchableOpacity key={m.id} style={s.mineRow} onPress={() => onOpen(m.id)} accessibilityRole="button" accessibilityLabel={`${m.title}، ${result}`}>
            <View style={[s.mineIcon, { backgroundColor: t.grad[0] }]}><Ionicons name={(e.is_winner ? "trophy" : m.category && CATEGORIES[m.category] ? CATEGORIES[m.category].icon.replace("-outline", "") : t.icon) as any} size={20} color={t.accent} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.leaderName} numberOfLines={2}>{m.title}</Text>
              <View style={[s.row, { flexWrap: "wrap" }]}>
                <StatusPill state={m.state} />
                <Text style={s.mutedSmall}>مشاركتك رقم {e.entry_number} من {m.entries_count}</Text>
              </View>
              <View style={s.row}>
                <Ionicons name={e.is_winner ? "trophy" : m.state !== "ended" ? "hourglass-outline" : announced ? "close-circle-outline" : "time-outline"} size={14}
                  color={e.is_winner ? Colors.accentDeep : Colors.textSecondary} />
                <Text style={[s.mutedSmall, e.is_winner && { color: Colors.accentDeep, fontFamily: "Cairo_700Bold" }]}>
                  {result}{m.type === "quiz" && m.questions_count ? ` · نتيجتك ${e.score}/${m.questions_count}` : ""}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Stat({ n, label, icon }: { n: number; label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={18} color={Colors.primaryDeep} />
      <Text style={s.statNum}>{n}</Text>
      <Text style={s.mutedSmall}>{label}</Text>
    </View>
  );
}

function Chip({ label, icon, on, onPress }: { label: string; icon?: keyof typeof Ionicons.glyphMap; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {icon ? <Ionicons name={icon} size={15} color={on ? Colors.onColor : Colors.textSecondary} /> : null}
      <Text style={[s.chipText, on && { color: Colors.onColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ icon = "trophy", title, body, primary, secondary }: {
  icon?: keyof typeof Ionicons.glyphMap; title: string; body: string;
  primary?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }; secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={s.empty}>
      <EmptyArt icon={icon} />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{body}</Text>
      {primary ? (
        <TouchableOpacity style={[s.btn, { alignSelf: "stretch" }]} onPress={primary.onPress} accessibilityRole="button">
          {primary.icon ? <Ionicons name={primary.icon} size={18} color={Colors.onColor} /> : null}
          <Text style={s.btnText}>{primary.label}</Text>
        </TouchableOpacity>
      ) : null}
      {secondary ? (
        <TouchableOpacity style={[s.btnGhost, { alignSelf: "stretch" }]} onPress={secondary.onPress} accessibilityRole="button">
          <Text style={[s.btnText, { color: Colors.primaryDeep }]}>{secondary.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden", paddingBottom: 20 },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 22, opacity: 0.1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  glassBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.25)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, lineHeight: 34, color: "#FFFFFF", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_500Medium", fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.9)", textAlign: "right" },
  hiddenNote: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#FDE68A" },
  hiddenNoteText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#1F1300", textAlign: "right" },
  spot: { marginTop: 16, marginHorizontal: 16, padding: 16, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  spotLabel: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  spotLabelText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  spotTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, lineHeight: 38, color: "#FFFFFF", textAlign: "right" },
  spotBody: { fontFamily: "Cairo_500Medium", fontSize: 14, lineHeight: 24, color: "rgba(255,255,255,0.92)", textAlign: "right" },
  spotWhen: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "rgba(255,255,255,0.92)", textAlign: "right" },
  prizeHero: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 16, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.22)" },
  prizeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  prizeLabel: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "right" },
  prizeValue: { fontFamily: "Cairo_700Bold", fontSize: 16, lineHeight: 26, color: "#FFFFFF", textAlign: "right" },
  cta: { minHeight: 50, borderRadius: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  ctaText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#1F1300" },
  ctaGhost: { minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", backgroundColor: "rgba(0,0,0,0.2)" },
  ctaGhostText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FFFFFF" },
  joinedHero: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 28, borderRadius: 999, backgroundColor: "#DCFCE7" },
  joinedHeroText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#14532D" },
  sectionRow: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 16 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  sectionHint: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  occ: { width: 156, height: 124, padding: 12, borderRadius: 18, justifyContent: "space-between" },
  occTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  occIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  occName: { fontFamily: "Cairo_700Bold", fontSize: 14, lineHeight: 21, color: "#FFFFFF", textAlign: "right" },
  occFoot: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 4 },
  occDays: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "right" },
  occRel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  tabs: { flexDirection: "row-reverse", marginHorizontal: 16, marginTop: 18, padding: 4, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  tab: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 1, paddingHorizontal: 2 },
  tabOn: { backgroundColor: "#006B4A" },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 48, borderRadius: 14, paddingHorizontal: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, paddingVertical: 8 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 14, minHeight: 40, borderRadius: 999, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  chipOn: { backgroundColor: "#006B4A", borderColor: "#006B4A" },
  chipText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  sortRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" },
  sortBtn: { paddingHorizontal: 10, minHeight: 36, borderRadius: 10, justifyContent: "center" },
  sortOn: { backgroundColor: Colors.primarySoft },
  sortText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 24, color: Colors.textSecondary, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  mutedSmall: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  prizeSmall: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.accentDeep, textAlign: "right", flexShrink: 1 },
  leaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 8, borderRadius: 14, backgroundColor: Colors.bg },
  leaderRank: { width: 24, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary, textAlign: "center" },
  leaderName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  leaderWins: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.accentDeep },
  honorRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  rankBadge: { position: "absolute", bottom: -4, left: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.cardBg },
  rankBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, lineHeight: 16, color: "#1F1300" },
  honorIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row-reverse", gap: 10 },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 12, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22, lineHeight: 32, color: Colors.text },
  badges: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  badge: { width: "48%", flexGrow: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 16, borderWidth: 1 },
  badgeOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent + "66" },
  badgeOff: { backgroundColor: Colors.bg, borderColor: Colors.border },
  badgeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badgeLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text },
  mineRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  mineIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  relRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, backgroundColor: Colors.bg },
  btn: { minHeight: 50, borderRadius: 14, backgroundColor: "#006B4A", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnGhost: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "55", backgroundColor: Colors.primarySoft, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FFFFFF" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: 6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "82%", backgroundColor: Colors.cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  sheetHead: { padding: 16, gap: 6 },
});
