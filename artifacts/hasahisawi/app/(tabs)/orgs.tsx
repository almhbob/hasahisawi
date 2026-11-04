// قسم «المبادرات والمنظمات»: المنظمات المسجّلة، فعالياتها، وحملات التبرع.
// كل الأرقام والقوائم من الخادم؛ لا بيانات تجريبية.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import ViewCount from "@/components/ViewCount";
import ModernHeader from "@/components/ui/ModernHeader";
import { LoadError, LoadingBlock } from "@/components/ui/LoadState";
import { useAuth } from "@/lib/auth-context";
import {
  orgsApi, openWhatsApp, arNum,
  type Organization, type OrgType, type OrgEvent, type OrgCampaign, type OrgStats, type ManagedOrg,
} from "@/lib/orgs-api";
import { OrgJoinCard, EventCard, CampaignCard, EmptyState } from "@/components/orgs/OrgWidgets";
import { TYPE_CONFIG, typeCfg, HEADER_GRADIENT, SOLID } from "@/components/orgs/orgTheme";

type SubTab = "orgs" | "events" | "campaigns";
type Status = "loading" | "error" | "ok";
const FILTERS: (OrgType | "all")[] = ["all", "charity", "initiative", "volunteer", "cooperative"];

export default function OrgsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>("orgs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OrgType | "all">("all");

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgsStatus, setOrgsStatus] = useState<Status>("loading");
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [eventsStatus, setEventsStatus] = useState<Status>("loading");
  const [campaigns, setCampaigns] = useState<OrgCampaign[]>([]);
  const [campStatus, setCampStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [managed, setManaged] = useState<ManagedOrg[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrgs = useCallback(async () => {
    try { setOrgs(await orgsApi.list({ type: filter, search: search.trim() })); setOrgsStatus("ok"); }
    catch { setOrgsStatus("error"); }
  }, [filter, search]);

  const loadActivity = useCallback(async () => {
    orgsApi.stats().then(setStats).catch(() => {});
    orgsApi.managed(token).then((d) => setManaged(d.organizations || [])).catch(() => {});
    orgsApi.events().then((e) => { setEvents(e); setEventsStatus("ok"); }).catch(() => setEventsStatus("error"));
    orgsApi.campaigns().then((c) => { setCampaigns(c); setCampStatus("ok"); }).catch(() => setCampStatus("error"));
  }, [token]);

  // البحث بعد توقف الكتابة بدل طلب لكل حرف
  useEffect(() => {
    const t = setTimeout(loadOrgs, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [loadOrgs, search]);
  useFocusEffect(useCallback(() => { loadActivity(); }, [loadActivity]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOrgs(), loadActivity()]);
    setRefreshing(false);
  };

  // المشاهدة تُسجَّل في صفحة المنظمة نفسها (trackOpen)
  const openOrg = (id: string | number) => router.push(`/organization?id=${id}` as never);
  const managerCta = (kind: "event" | "campaign") => managed.length
    ? { label: kind === "event" ? "أضف فعالية لمنظمتك" : "أضف حملة لمنظمتك", onPress: () => router.push(`/organization?id=${managed[0].id}&add=${kind}` as never) }
    : { label: "سجّل مؤسستك", onPress: () => router.push("/org-join" as never) };

  const statItems = [
    { n: stats?.total, label: "منظمة" },
    { n: stats?.events, label: "فعالية قادمة" },
    { n: stats?.campaigns, label: "حملة قائمة" },
    { n: stats?.members, label: "عضو" },
  ];
  const typeCount = (k: OrgType | "all") => (k === "all" ? stats?.total : stats?.by_type?.[k]) ?? null;
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />;

  return (
    <View style={s.root}>
      <ModernHeader title="المبادرات والمنظمات" subtitle="جمعيات خيرية، مبادرات، فرق تطوع، تعاونيات" icon="hand-left-outline" gradient={HEADER_GRADIENT}>
        <View style={s.statsRow} accessibilityRole="summary">
          {statItems.map((it) => (
            <View key={it.label} style={s.statItem} accessibilityLabel={`${it.n ?? 0} ${it.label}`}>
              <Text style={s.statNum}>{it.n == null ? "–" : arNum(it.n)}</Text>
              <Text style={s.statLabel} numberOfLines={1}>{it.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.subTabRow} accessibilityRole="tablist">
          {([["orgs", "المنظمات", "business-outline"], ["events", "الفعاليات", "calendar-outline"], ["campaigns", "حملات التبرع", "heart-outline"]] as [SubTab, string, React.ComponentProps<typeof Ionicons>["name"]][]).map(([k, label, icon]) => {
            const active = subTab === k;
            return (
              <TouchableOpacity
                key={k}
                style={[s.subTab, active && s.subTabActive]}
                onPress={() => setSubTab(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <Ionicons name={icon} size={15} color={active ? SOLID : "#fff"} />
                <Text style={[s.subTabText, active && { color: SOLID }]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ModernHeader>

      {/* ══ المنظمات ══ */}
      {subTab === "orgs" && (
        <ScrollView contentContainerStyle={s.list} refreshControl={refresh} keyboardShouldPersistTaps="handled">
          <View style={s.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحث باسم المنظمة أو نشاطها"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              textAlign="right"
              accessibilityLabel="البحث في المنظمات"
              returnKeyType="search"
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="مسح البحث" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.chips}>
            {FILTERS.map((k) => {
              const active = filter === k;
              const n = typeCount(k);
              const label = k === "all" ? "الكل" : TYPE_CONFIG[k].plural;
              return (
                <TouchableOpacity
                  key={k}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => setFilter(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${label}${n ? `، ${n}` : ""}`}
                  hitSlop={{ top: 4, bottom: 4 }}
                >
                  <Text style={[s.chipText, active && { color: "#fff" }]}>{label}{n ? ` (${arNum(n)})` : ""}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <OrgJoinCard registered={stats?.total || null} />

          {orgsStatus === "loading" && orgs.length === 0 && <LoadingBlock label="جارٍ تحميل المنظمات…" />}
          {orgsStatus === "error" && orgs.length === 0 && (
            <LoadError onRetry={() => { setOrgsStatus("loading"); loadOrgs(); }} message="تعذّر تحميل المنظمات" />
          )}
          {orgsStatus === "ok" && orgs.length === 0 && (
            search || filter !== "all"
              ? <EmptyState icon="search-outline" title="لا نتائج مطابقة" body="جرّب كلمة أخرى أو اختر «الكل»." />
              : <EmptyState icon="business-outline" title="لا توجد منظمات مسجّلة بعد" body="تظهر هنا الجمعيات والمبادرات والفرق التطوعية بعد اعتماد طلب تسجيلها." actionLabel="سجّل مؤسستك" onAction={() => router.push("/org-join" as never)} />
          )}

          {orgs.map((org, i) => {
            const cfg = typeCfg(org.type);
            return (
              <Animated.View key={org.id} entering={FadeInDown.delay(Math.min(i, 6) * 50).duration(260)}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => openOrg(org.id)} style={s.card} accessibilityRole="button" accessibilityLabel={`${org.name}، ${cfg.label}. اعرض الصفحة`}>
                  <View style={s.cardHeader}>
                    <View style={[s.iconBox, { backgroundColor: cfg.soft }]}>
                      <MaterialCommunityIcons name={cfg.icon as never} size={26} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={s.nameRow}>
                        <Text style={s.cardName} numberOfLines={2}>{org.name}</Text>
                        {org.isVerified && <Ionicons name="checkmark-circle" size={17} color={Colors.primaryDeep} accessibilityLabel="موثّقة" />}
                      </View>
                      <View style={s.metaRow}>
                        <View style={[s.typeBadge, { backgroundColor: cfg.soft }]}>
                          <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {org.members > 0 && (
                          <View style={s.metaItem}>
                            <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                            <Text style={s.metaText}>{arNum(org.members)} عضو</Text>
                          </View>
                        )}
                        <ViewCount kind="organization" id={`o-${org.id}`} />
                      </View>
                    </View>
                  </View>
                  {!!org.description && <Text style={s.cardDesc} numberOfLines={2}>{org.description}</Text>}
                  <View style={s.cardActions}>
                    <View style={[s.actionBtn, { backgroundColor: SOLID }]}>
                      <Text style={[s.actionText, { color: "#fff" }]}>الصفحة والتفاصيل</Text>
                      <Ionicons name="chevron-back" size={16} color="#fff" />
                    </View>
                    {!!org.contact && (
                      <TouchableOpacity
                        style={[s.actionBtn, s.actionGhost]}
                        onPress={() => openWhatsApp(org.contact, "السلام عليكم، تواصلت معكم عبر تطبيق حصاحيصاوي.")}
                        accessibilityRole="button"
                        accessibilityLabel={`مراسلة ${org.name} عبر واتساب`}
                      >
                        <Ionicons name="logo-whatsapp" size={16} color={Colors.primaryDeep} />
                        <Text style={[s.actionText, { color: Colors.primaryDeep }]}>تواصل</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ══ الفعاليات ══ */}
      {subTab === "events" && (
        <ScrollView contentContainerStyle={s.list} refreshControl={refresh}>
          <SectionHead title="الفعاليات القادمة" sub="تنشرها المنظمات الموثّقة في التطبيق" />
          {eventsStatus === "loading" && <LoadingBlock label="جارٍ تحميل الفعاليات…" />}
          {eventsStatus === "error" && <LoadError onRetry={() => { setEventsStatus("loading"); loadActivity(); }} message="تعذّر تحميل الفعاليات" />}
          {eventsStatus === "ok" && events.length === 0 && (
            <EmptyState
              icon="calendar-outline"
              title="لا توجد فعاليات معلنة حالياً"
              body={managed.length ? "انشر فعالية منظمتك لتظهر هنا لأهل المدينة." : "عندما تعلن منظمة موثّقة عن فعالية ستجدها هنا مع موعدها ومكانها."}
              actionLabel={managerCta("event").label}
              onAction={managerCta("event").onPress}
            />
          )}
          {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
        </ScrollView>
      )}

      {/* ══ الحملات ══ */}
      {subTab === "campaigns" && (
        <ScrollView contentContainerStyle={s.list} refreshControl={refresh}>
          <SectionHead title="حملات التبرع" sub="تبرّع مباشرة للمنظمة صاحبة الحملة" />
          <View style={s.note}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primaryDeep} />
            <Text style={s.noteText}>التطبيق لا يستلم التبرعات. تنشر كل منظمة موثّقة طريقة التبرع لحملتها، فتأكد منها مع المنظمة قبل التحويل.</Text>
          </View>
          {campStatus === "loading" && <LoadingBlock label="جارٍ تحميل الحملات…" />}
          {campStatus === "error" && <LoadError onRetry={() => { setCampStatus("loading"); loadActivity(); }} message="تعذّر تحميل الحملات" />}
          {campStatus === "ok" && campaigns.length === 0 && (
            <EmptyState
              icon="heart-outline"
              title="لا توجد حملات تبرع قائمة"
              body={managed.length ? "أضف حملة لمنظمتك مع طريقة التبرع لتظهر للمتبرعين." : "تظهر هنا حملات المنظمات الموثّقة مع الهدف وطريقة التبرع."}
              actionLabel={managerCta("campaign").label}
              onAction={managerCta("campaign").onPress}
            />
          )}
          {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
        </ScrollView>
      )}
    </View>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={s.secHead}>
      <View style={s.secBar} />
      <View style={{ flex: 1 }}>
        <Text style={s.secTitle}>{title}</Text>
        <Text style={s.secSub}>{sub}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  // الرأس: أرقام بيضاء هادئة بلون واحد
  statsRow: { flexDirection: "row-reverse", backgroundColor: "rgba(255,255,255,0.10)", borderRadius: Colors.radius.md, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 12 },
  statItem: { flex: 1, alignItems: "center", minWidth: 0 },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 19, lineHeight: 28, color: "#fff" },
  statLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.9)" },
  subTabRow: { flexDirection: "row-reverse", gap: 8 },
  subTab: { flex: 1, minHeight: 44, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4, borderRadius: Colors.radius.md, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  subTabActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  subTabText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", flexShrink: 1 },

  list: { padding: 16, gap: 12, paddingBottom: 120 },
  searchRow: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, gap: 8, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 10 },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 38, justifyContent: "center", paddingHorizontal: 14, borderRadius: Colors.radius.pill, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderStrong },
  chipActive: { backgroundColor: SOLID, borderColor: SOLID },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },

  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border, ...Colors.shadow.card },
  cardHeader: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  iconBox: { width: 52, height: 52, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, lineHeight: 26, color: Colors.textPrimary, textAlign: "right", flexShrink: 1 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, flexWrap: "wrap" },
  typeBadge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: Colors.radius.pill },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  metaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  cardActions: { flexDirection: "row-reverse", gap: 8 },
  actionBtn: { flex: 1, minHeight: 44, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: Colors.radius.md },
  actionGhost: { flex: 0.6, backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.borderGlow },
  actionText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  secHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 2 },
  secBar: { width: 4, height: 30, borderRadius: 2, backgroundColor: Colors.primary },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  secSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  note: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, backgroundColor: Colors.primarySoft, borderRadius: Colors.radius.md, padding: 12, borderWidth: 1, borderColor: Colors.borderGlow },
  noteText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textPrimary, textAlign: "right" },
});
