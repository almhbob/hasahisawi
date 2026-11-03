// «نافذة الصحافة» — التوأمة مع نقابة الصحفيين السودانيين:
// البيانات والأخبار الرسمية، دليل الصحفيين المعتمد، الأرشيف الرقمي، وعن الشراكة (المزايا وخارطة التنفيذ).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet, Linking, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { openExternal } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { pressApi, PRESS_INK, PRESS_RED, PARTNER_STATUS, fmtDay, type PressOverview, type PressPost, type PressArchive, type Journalist } from "@/lib/press";
import { Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

type Tab = "news" | "directory" | "archive" | "about";
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "news", label: "البيانات والأخبار", icon: "megaphone-outline" },
  { key: "directory", label: "دليل الصحفيين", icon: "people-outline" },
  { key: "archive", label: "الأرشيف", icon: "archive-outline" },
  { key: "about", label: "عن الشراكة", icon: "git-merge-outline" },
];

export default function PressScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.key === params.tab) ? params.tab : "news") as Tab);
  const [ov, setOv] = useState<PressOverview | null>(null);
  const [posts, setPosts] = useState<PressPost[]>([]);
  const [kind, setKind] = useState("");
  const [dir, setDir] = useState<Journalist[]>([]);
  const [accOnly, setAccOnly] = useState(false);
  const [arch, setArch] = useState<{ items: PressArchive[]; years: number[] }>({ items: [], years: [] });
  const [akind, setAkind] = useState(""); const [year, setYear] = useState("");
  const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 400); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const o = await pressApi.overview(token).catch(() => null);
      if (o) setOv(o);
      if (tab === "news") setPosts((await pressApi.posts({ kind: kind || undefined, q: query || undefined }, token)).posts);
      if (tab === "directory") setDir((await pressApi.directory({ q: query || undefined, accredited: accOnly })).journalists);
      if (tab === "archive") setArch(await pressApi.archive({ kind: akind || undefined, year: year || undefined, q: query || undefined }));
    } catch { /* */ } finally { setLoading(false); }
  }, [tab, kind, query, accOnly, akind, year, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const s = ov?.settings;
  const ps = PARTNER_STATUS[s?.status || "proposed"];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any));
  const openPost = (p: PressPost) => router.push({ pathname: "/press-post", params: { id: String(p.id) } } as any);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={PRESS_RED} />} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={["#020617", PRESS_INK, "#1E293B"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={[u.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={back} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            {ov?.me && <Pressable onPress={() => router.push("/press-admin" as any)} style={st.adminBtn}><Ionicons name="create" size={15} color="#fff" /><Text style={st.adminT}>لوحة الأمانة الإعلامية</Text></Pressable>}
          </View>
          <View style={[u.rowR, { gap: 12, marginTop: 10 }]}>
            <View style={st.logo}>{s?.logo_url ? <Image source={{ uri: s.logo_url }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="newspaper" size={26} color="#fff" />}</View>
            <View style={{ flex: 1 }}>
              <Text style={st.kicker}>حصاحيصاوي × {s?.partner_name || "نقابة الصحفيين السودانيين"}</Text>
              <Text style={st.title}>{s?.window_title || "نافذة الصحافة"}</Text>
            </View>
          </View>
          <View style={[st.status, { borderColor: ps.color }]}>
            <View style={[st.dot, { backgroundColor: ps.color }]} />
            <Text style={st.statusT}>{ps.label} · {s?.agreement_no}</Text>
          </View>
          <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
            <Stat n={ov?.stats.posts ?? 0} l="بيان وخبر" /><Stat n={ov?.stats.accredited ?? 0} l="صحفي معتمد" /><Stat n={ov?.stats.archive ?? 0} l="مادة مؤرشفة" />
          </View>
        </LinearGradient>

        <View style={st.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => { setTab(t.key); setQ(""); }} style={[st.tab, { transform: [{ scaleX: -1 }] }, tab === t.key && { backgroundColor: PRESS_INK }]}>
                <Ionicons name={t.icon} size={15} color={tab === t.key ? "#fff" : Colors.textSecondary} /><Text style={[st.tabT, tab === t.key && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {s?.status === "proposed" && <View style={st.disclaimer}><Ionicons name="information-circle" size={16} color="#B7791F" /><Text style={st.discT}>{ps.note}</Text></View>}

          {ov?.urgent && tab === "news" && (
            <Pressable onPress={() => openPost(ov.urgent!)} style={st.urgent}>
              <View style={st.urgentTag}><Text style={st.urgentTagT}>عاجل</Text></View>
              <Text style={st.urgentT} numberOfLines={2}>{ov.urgent.title}</Text>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </Pressable>
          )}

          {tab !== "about" && (
            <View style={st.search}>
              <Ionicons name="search" size={17} color={Colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder={tab === "directory" ? "ابحث باسم الصحفي أو المؤسسة أو المنطقة" : tab === "archive" ? "ابحث في الأرشيف" : "ابحث بعنوان أو رقم مرجعي"} placeholderTextColor={Colors.textMuted} style={st.searchIn} />
            </View>
          )}

          {tab === "news" && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
                {[["", "الكل"], ...Object.entries(ov?.kinds ?? {}).map(([k, v]) => [k, v.label])].map(([k, l]) => (
                  <View key={k || "all"} style={{ transform: [{ scaleX: -1 }] }}><Pill label={l} on={kind === k} onPress={() => setKind(k)} color={PRESS_INK} /></View>
                ))}
              </ScrollView>
              {loading ? <ActivityIndicator color={PRESS_RED} style={{ marginTop: 24 }} /> : (
                <View style={{ marginTop: 12 }}>
                  {posts.map((p, i) => <PostCard key={p.id} p={p} lead={i === 0 && !kind && !query} onPress={() => openPost(p)} />)}
                  {!posts.length && <Empty icon="megaphone-outline" title="لا توجد منشورات بعد" sub="ستظهر هنا بيانات وتصريحات وأخبار الأمانة الإعلامية." />}
                </View>
              )}
            </>
          )}

          {tab === "directory" && (
            <>
              <View style={[u.rowR, { gap: 6, marginTop: 10 }]}>
                <Pill label="كل الصحفيين" on={!accOnly} onPress={() => setAccOnly(false)} color={PRESS_INK} />
                <Pill label="المعتمدون من النقابة" on={accOnly} onPress={() => setAccOnly(true)} color={PRESS_RED} icon="shield-checkmark" />
              </View>
              {loading ? <ActivityIndicator color={PRESS_RED} style={{ marginTop: 24 }} /> : (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {dir.map((j) => <JournalistCard key={j.user_id} j={j} />)}
                  {!dir.length && <Empty icon="people-outline" title="لا يوجد صحفيون في الدليل بعد" sub="الانضمام عبر العضوية الصحفية في ديوان الكُتّاب، ثم اعتماد الأمانة الإعلامية." action="العضوية الصحفية" onAction={() => router.push("/writers-membership" as any)} />}
                </View>
              )}
              <Pressable onPress={() => router.push("/writers-apply" as any)} style={[st.joinBox]}>
                <Ionicons name="id-card" size={22} color={PRESS_RED} />
                <View style={{ flex: 1 }}><Text style={st.joinT}>صحفي أو مراسل بالمنطقة؟</Text><Text style={u.hint}>قدّم على العضوية الصحفية لتُدرج في الدليل وتحصل على بطاقة رقمية برمز تحقق.</Text></View>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </Pressable>
            </>
          )}

          {tab === "archive" && (
            <>
              <View style={[u.wrap, { marginTop: 10 }]}>
                <Pill label="كل المواد" on={!akind} onPress={() => setAkind("")} color={PRESS_INK} />
                {Object.entries(ov?.archive_kinds ?? {}).map(([k, l]) => <Pill key={k} label={l} on={akind === k} onPress={() => setAkind(k)} color={PRESS_INK} />)}
              </View>
              {arch.years.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 6 }}>
                  {["", ...arch.years.map(String)].map((y) => <View key={y || "all"} style={{ transform: [{ scaleX: -1 }] }}><Pill label={y || "كل السنوات"} on={year === y} onPress={() => setYear(y)} color={PRESS_RED} /></View>)}
                </ScrollView>
              )}
              {loading ? <ActivityIndicator color={PRESS_RED} style={{ marginTop: 24 }} /> : (
                <View style={st.timeline}>
                  {arch.items.map((a) => (
                    <View key={a.id} style={st.tItem}>
                      <View style={st.tRail}><View style={st.tDot} /></View>
                      <Pressable onPress={() => setOpen(open === a.id ? null : a.id)} style={[u.card, { flex: 1, marginBottom: 12 }]}>
                        <View style={[u.rowR, { justifyContent: "space-between" }]}>
                          <Text style={st.aKind}>{a.kind_label}</Text>
                          <Text style={u.hint}>{a.event_date ? fmtDay(a.event_date) : ""}{a.place ? ` · ${a.place}` : ""}</Text>
                        </View>
                        <Text style={st.aTitle}>{a.title}</Text>
                        {!!a.description && <Text style={st.aDesc} numberOfLines={open === a.id ? undefined : 3}>{a.description}</Text>}
                        {open === a.id && a.files.map((f, i) => (
                          <Pressable key={i} onPress={() => openExternal(f.url)} style={st.file}><Ionicons name="document-attach" size={16} color={PRESS_RED} /><Text style={st.fileT} numberOfLines={1}>{f.name}</Text><Ionicons name="open-outline" size={14} color={Colors.textMuted} /></Pressable>
                        ))}
                        {a.tags.length > 0 && <Text style={[u.hint, { marginTop: 4 }]}>{a.tags.map((t) => `#${t}`).join("  ")}</Text>}
                        {!!a.source && open === a.id && <Text style={u.hint}>المصدر: {a.source}</Text>}
                      </Pressable>
                    </View>
                  ))}
                  {!arch.items.length && <Empty icon="archive-outline" title="الأرشيف فارغ" sub="مساحة لحفظ التغطيات والتقارير والصور والوثائق التاريخية للمنطقة." />}
                </View>
              )}
            </>
          )}

          {tab === "about" && s && <About s={s} />}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{l}</Text></View>;
}

function PostCard({ p, lead, onPress }: { p: PressPost; lead?: boolean; onPress: () => void }) {
  const official = p.kind === "statement" || p.kind === "press_release" || p.kind === "circular";
  return (
    <Pressable onPress={onPress} style={[st.post, lead && st.postLead]}>
      {!!p.cover_url && lead && <Image source={{ uri: p.cover_url }} style={st.cover} />}
      <View style={[u.rowR, { gap: 6, flexWrap: "wrap" }]}>
        {p.urgent && <Text style={st.tagRed}>عاجل</Text>}
        {p.pinned && <Ionicons name="pin" size={13} color={PRESS_RED} />}
        <Text style={[st.kindT, official && { color: PRESS_RED }]}>{p.kind_label}</Text>
        <Text style={st.ref}>{p.ref_no}</Text>
      </View>
      <Text style={[st.postT, lead && { fontSize: 19, lineHeight: 30 }]} numberOfLines={3}>{p.title}</Text>
      <Text style={st.postS} numberOfLines={lead ? 4 : 2}>{p.summary}</Text>
      <View style={[u.rowR, { justifyContent: "space-between", marginTop: 6 }]}>
        <Text style={u.hint}>{p.signed_by || "الأمانة الإعلامية"} · {fmtDay(p.published_at)}</Text>
        <View style={[u.rowR, { gap: 8 }]}>
          {p.attachments.length > 0 && <Ionicons name="attach" size={14} color={Colors.textMuted} />}
          <Text style={u.hint}>{p.views} قراءة</Text>
        </View>
      </View>
    </Pressable>
  );
}

function JournalistCard({ j }: { j: Journalist }) {
  return (
    <Pressable onPress={() => router.push({ pathname: "/profile", params: { id: String(j.user_id) } } as any)} style={[st.jCard, j.accredited && { borderColor: PRESS_RED + "55" }]}>
      <View>
        <UserAvatar name={j.name} avatarUrl={j.avatar_url} size={54} borderRadius={14} />
        {j.accredited && <View style={st.accBadge}><Ionicons name="shield-checkmark" size={12} color="#fff" /></View>}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={st.jName}>{j.pen_name || j.name}</Text>
        <Text style={st.jRole}>{[j.press_role, j.press_org].filter(Boolean).join(" · ")}</Text>
        <Text style={u.hint}>{[j.specialty, j.beat || j.city, j.press_years ? `${j.press_years} سنة خبرة` : null].filter(Boolean).join(" · ")}</Text>
        <View style={[u.rowR, { gap: 6, marginTop: 4, flexWrap: "wrap" }]}>
          {j.accredited ? <Text style={st.accT}>معتمد من النقابة{j.union_card_no ? ` · ${j.union_card_no}` : ""}</Text> : <Text style={st.memT}>عضو صحفي</Text>}
          {!!j.member_no && <Text style={st.memT}>{j.member_no}</Text>}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        {!!j.whatsapp && <Pressable onPress={() => Linking.openURL(`https://wa.me/${j.whatsapp!.replace(/\D/g, "")}`)} style={[st.cBtn, { backgroundColor: "#128C7E" }]} accessibilityLabel="واتساب"><Ionicons name="logo-whatsapp" size={16} color="#fff" /></Pressable>}
        {!!j.email && <Pressable onPress={() => Linking.openURL(`mailto:${j.email}`)} style={[st.cBtn, { backgroundColor: PRESS_INK }]} accessibilityLabel="بريد"><Ionicons name="mail" size={15} color="#fff" /></Pressable>}
      </View>
    </Pressable>
  );
}

function About({ s }: { s: PressOverview["settings"] }) {
  const value = [
    ["megaphone", "النافذة الإخبارية الرسمية", "تبويب حصري ومجاني لنشر بيانات وصحف وتصريحات النقابة", "وصول مباشر وسريع للجمهور المحلي"],
    ["people", "دليل الصحفيين المعتمد", "وحدة توثيق تقنية للتعريف بالصحفيين والمراسلين بالمنطقة وسبل التواصل", "حماية المهنة وتسهيل التواصل الميداني"],
    ["notifications", "التنبيهات الفورية", "إشعارات عاجلة للهواتف الذكية للبيانات الصحفية الهامة", "انتشار واسع للتصريحات الرسمية"],
    ["archive", "الأرشيف الرقمي", "مساحة سحابية لحفظ التغطيات والتقارير التاريخية للمنطقة", "توثيق مهني وحفظ للمحتوى"],
  ];
  const phases = [["التنسيق والاعتماد", "تقديم الخطاب الرسمي وعقد جلسة تنسيقية لبحث بنود التوأمة."], ["التكامل التقني", "تهيئة الواجهات ومنح صلاحيات النشر والتحكم للأمانة الإعلامية بالنقابة."], ["الإطلاق المشترك", "الإعلان الرسمي عن الشراكة وتدشين النافذة الإعلامية للمستخدمين."]];
  return (
    <View style={{ marginTop: 14 }}>
      <View style={[u.card, { borderRightWidth: 4, borderRightColor: PRESS_RED }]}>
        <Text style={st.h}>الرؤية</Text>
        <Text style={st.aDesc}>{s.about || "بناء توأمة تقنية وإعلامية موثوقة بين تطبيق حصاحيصاوي ونقابة الصحفيين السودانيين، بوضع البنية التحتية الرقمية للتطبيق في خدمة الصحافة المستقلة، وتأمين مصدر معتمد للأخبار المحلية والخدمات التوثيقية، بما يخدم المجتمع والإعلاميين بمنطقة الحصاحيصا وولاية الجزيرة."}</Text>
      </View>
      <Text style={[st.h, { marginTop: 18, marginBottom: 8 }]}>المزايا والخدمات المتبادلة</Text>
      {value.map(([i, t, a, b]) => (
        <View key={t} style={st.val}>
          <View style={st.valI}><Ionicons name={i as any} size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.valT}>{t}</Text>
            <Text style={st.valA}>{a}</Text>
            <Text style={st.valB}>العائد: {b}</Text>
          </View>
        </View>
      ))}
      <Text style={[st.h, { marginTop: 18, marginBottom: 8 }]}>خارطة التنفيذ</Text>
      {phases.map(([t, d], i) => {
        const done = i + 1 < s.phase || (i + 1 === s.phase && s.status === "active");
        const cur = i + 1 === s.phase && !done;
        return (
          <View key={t} style={[st.phase, cur && { borderColor: PRESS_RED }, done && { borderColor: "#0E8A5F" }]}>
            <Text style={[st.phaseN, done && { backgroundColor: "#0E8A5F" }, cur && { backgroundColor: PRESS_RED }]}>{done ? "✓" : `0${i + 1}`}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.valT}>{t}{cur ? " — المرحلة الحالية" : ""}</Text>
              <Text style={st.valA}>{d}</Text>
            </View>
          </View>
        );
      })}
      {(s.contact_email || s.contact_phone) && (
        <View style={[u.card, { marginTop: 14, gap: 6 }]}>
          <Text style={st.h}>التواصل</Text>
          {!!s.contact_email && <Pressable onPress={() => Linking.openURL(`mailto:${s.contact_email}`)}><Text style={st.link}>{s.contact_email}</Text></Pressable>}
          {!!s.contact_phone && <Pressable onPress={() => Linking.openURL(`https://wa.me/${s.contact_phone!.replace(/\D/g, "")}`)}><Text style={st.link}>{s.contact_phone}</Text></Pressable>}
        </View>
      )}
      <Text style={[u.hint, { textAlign: "center", marginTop: 14 }]}>وثيقة العمل: {s.agreement_no}{s.launched_at ? ` · أُطلقت في ${fmtDay(s.launched_at)}` : ""}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 18 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  adminBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: PRESS_RED, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  adminT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  logo: { width: 54, height: 54, borderRadius: 14, backgroundColor: PRESS_RED, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "rgba(255,255,255,0.7)", textAlign: "right" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right" },
  status: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end", borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusT: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#fff" },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" },
  tabsWrap: { backgroundColor: Colors.bg, paddingVertical: 10 },
  tab: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tabT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  disclaimer: { flexDirection: "row-reverse", gap: 6, backgroundColor: "#B7791F12", borderRadius: 12, padding: 10, marginBottom: 10 },
  discT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "#7A5A12", textAlign: "right", lineHeight: 19 },
  urgent: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: PRESS_RED, borderRadius: 14, padding: 12, marginBottom: 10 },
  urgentTag: { backgroundColor: "#fff", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1 },
  urgentTagT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: PRESS_RED },
  urgentT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, height: 44 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 0 },
  post: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.divider, gap: 4 },
  postLead: { borderTopWidth: 4, borderTopColor: PRESS_RED },
  cover: { height: 170, borderRadius: 10, marginBottom: 8 },
  tagRed: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff", backgroundColor: PRESS_RED, paddingHorizontal: 7, borderRadius: 6, overflow: "hidden" },
  kindT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: PRESS_INK },
  ref: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: Colors.textMuted, letterSpacing: 0.4 },
  postT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", lineHeight: 26 },
  postS: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  jCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  accBadge: { position: "absolute", bottom: -4, left: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: PRESS_RED, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.cardBg },
  jName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  jRole: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: PRESS_RED, textAlign: "right" },
  accT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff", backgroundColor: PRESS_RED, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, overflow: "hidden" },
  memT: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: Colors.textSecondary, backgroundColor: Colors.divider, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, overflow: "hidden" },
  cBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  joinBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: PRESS_RED + "66", backgroundColor: PRESS_RED + "08" },
  joinT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  timeline: { marginTop: 14 },
  tItem: { flexDirection: "row-reverse", gap: 10 },
  tRail: { width: 14, alignItems: "center", borderRightWidth: 2, borderRightColor: Colors.divider, marginRight: 6 },
  tDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: PRESS_RED, marginTop: 16, marginRight: -7 },
  aKind: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: PRESS_RED },
  aTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 2 },
  aDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22, marginTop: 4 },
  file: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: Colors.bg },
  fileT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right" },
  h: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  val: { flexDirection: "row-reverse", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.divider },
  valI: { width: 40, height: 40, borderRadius: 12, backgroundColor: PRESS_INK, alignItems: "center", justifyContent: "center" },
  valT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  valA: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  valB: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: PRESS_RED, textAlign: "right", marginTop: 2 },
  phase: { flexDirection: "row-reverse", gap: 12, alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: Colors.divider },
  phaseN: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.textMuted, color: "#fff", textAlign: "center", lineHeight: 38, fontFamily: "Cairo_700Bold", fontSize: 14, overflow: "hidden" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: PRESS_RED, textAlign: "right" },
});
