// أرشيف أنشطة اتحاد طلاب محلية الحصاحيصا — سجل مصوّر لكل ما أنجزه الاتحاد، مرتّب بالسنة والتصنيف
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Pressable, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { unionPlusApi, fmtDay, type Activity, type ActivityStats } from "@/lib/union-plus";

const UC = "#1F5C8A";
const UC2 = "#9DBBD6";
const CAT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  seminar: "mic-outline", course: "school-outline", trip: "bus-outline", sports: "football-outline", culture: "color-palette-outline",
  volunteer: "hand-left-outline", meeting: "people-outline", celebration: "ribbon-outline", other: "sparkles-outline",
};

export default function StudentUnionArchive() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [year, setYear] = useState<number | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Activity | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await unionPlusApi.activities({ year, category: cat });
      setList(d.activities); setStats(d.stats); setCats(d.categories); setErr(null);
    } catch (e: any) { setErr(e?.message || "تعذّر تحميل الأرشيف"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [year, cat]);
  useEffect(() => { load(); }, [load]);

  // تجميع حسب الشهر لعرض زمني
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of list) {
      const k = new Date(a.activity_date).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
      m.set(k, [...(m.get(k) || []), a]);
    }
    return [...m.entries()];
  }, [list]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/student" as any));
  const cardW = Math.min(width - 32, 640);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={Colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>أرشيف الأنشطة</Text>
          <Text style={s.sub}>اتحاد طلاب محلية الحصاحيصا</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14, alignItems: "center" }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}>
        <LinearGradient colors={["#0B1F33", UC]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { width: cardW }]}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}><Ionicons name="images" size={22} color="#fff" /></View>
            <Text style={s.heroT}>ما أنجزه الاتحاد، بالصور والتواريخ</Text>
          </View>
          <View style={s.stats}>
            {[
              { n: stats?.total ?? 0, l: "نشاط", i: "calendar-outline" as const },
              { n: stats?.attendees ?? 0, l: "مشارك", i: "people-outline" as const },
              { n: stats?.photos ?? 0, l: "صورة", i: "camera-outline" as const },
            ].map((x) => (
              <View key={x.l} style={s.stat}>
                <Ionicons name={x.i} size={16} color={UC2} />
                <Text style={s.statN}>{x.n.toLocaleString("ar-EG")}</Text>
                <Text style={s.statL}>{x.l}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* السنوات والتصنيفات */}
        <View style={{ width: cardW, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            {[null, ...(stats?.years ?? [])].map((y) => {
              const on = year === y;
              return (
                <TouchableOpacity key={String(y)} onPress={() => setYear(y)} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipT, on && s.chipTOn]}>{y ? y.toLocaleString("ar-EG", { useGrouping: false }) : "كل السنوات"}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            {[null, ...Object.keys(cats)].map((k) => {
              const on = cat === k;
              return (
                <TouchableOpacity key={String(k)} onPress={() => setCat(k)} style={[s.chip, on && s.chipOn]}>
                  {k ? <Ionicons name={CAT_ICON[k] ?? "sparkles-outline"} size={14} color={on ? "#fff" : UC} /> : null}
                  <Text style={[s.chipT, on && s.chipTOn]}>{k ? cats[k] : "كل الأنشطة"}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? <ActivityIndicator color={UC} style={{ marginTop: 40 }} /> : err ? (
          <Text style={s.err}>{err}</Text>
        ) : !list.length ? (
          <View style={[s.empty, { width: cardW }]}>
            <View style={s.emptyIcon}><Ionicons name="albums-outline" size={34} color={UC} /></View>
            <Text style={s.emptyT}>{year || cat ? "لا أنشطة في هذا التصنيف" : "الأرشيف فارغ حتى الآن"}</Text>
            <Text style={s.emptyS}>تظهر هنا أنشطة الاتحاد فور توثيقها من الإدارة.</Text>
          </View>
        ) : groups.map(([month, items]) => (
          <View key={month} style={{ width: cardW, gap: 10 }}>
            <View style={s.monthRow}><View style={s.monthDot} /><Text style={s.month}>{month}</Text><View style={s.monthLine} /></View>
            {items.map((a) => (
              <TouchableOpacity key={a.id} activeOpacity={0.9} onPress={() => setOpen(a)} style={s.card} accessibilityRole="button" accessibilityLabel={a.title}>
                {a.cover_url ? (
                  <View>
                    <Image source={{ uri: a.cover_url }} style={s.cover} contentFit="cover" transition={200} />
                    {a.images.length > 1 ? (
                      <View style={s.countBadge}><Ionicons name="images-outline" size={12} color="#fff" /><Text style={s.countT}>{a.images.length}</Text></View>
                    ) : null}
                  </View>
                ) : (
                  <View style={[s.cover, s.coverEmpty]}><Ionicons name={CAT_ICON[a.category] ?? "sparkles-outline"} size={40} color={UC2} /></View>
                )}
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={s.catPill}><Ionicons name={CAT_ICON[a.category] ?? "sparkles-outline"} size={12} color={UC} /><Text style={s.catT}>{a.category_label}</Text></View>
                  <Text style={s.cardT} numberOfLines={2}>{a.title}</Text>
                  <View style={s.metaRow}>
                    <Meta icon="calendar-outline" t={fmtDay(a.activity_date)} />
                    {a.location ? <Meta icon="location-outline" t={a.location} /> : null}
                    {a.attendees ? <Meta icon="people-outline" t={`${a.attendees.toLocaleString("ar-EG")} مشارك`} /> : null}
                  </View>
                  {a.body ? <Text style={s.body} numberOfLines={2}>{a.body}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* التفاصيل */}
      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open ? (
          <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setOpen(null)} style={s.iconBtn} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity>
              <Text style={[s.title, { flex: 1, fontSize: 17 }]} numberOfLines={1}>{open.title}</Text>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30, alignItems: "center" }}>
              {open.images.length ? (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width, maxHeight: Math.min(width * 0.7, 460) }}>
                  {open.images.map((u) => (
                    <Pressable key={u} onPress={() => setViewer(u)} accessibilityLabel="عرض الصورة بملء الشاشة">
                      <Image source={{ uri: u }} style={{ width, height: Math.min(width * 0.7, 460) }} contentFit="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <View style={{ width: cardW, gap: 10, paddingTop: 16 }}>
                <View style={s.catPill}><Ionicons name={CAT_ICON[open.category] ?? "sparkles-outline"} size={12} color={UC} /><Text style={s.catT}>{open.category_label}</Text></View>
                <Text style={[s.cardT, { fontSize: 20, lineHeight: 32 }]}>{open.title}</Text>
                <View style={s.metaRow}>
                  <Meta icon="calendar-outline" t={fmtDay(open.activity_date)} />
                  {open.location ? <Meta icon="location-outline" t={open.location} /> : null}
                  {open.attendees ? <Meta icon="people-outline" t={`${open.attendees.toLocaleString("ar-EG")} مشارك`} /> : null}
                </View>
                {open.body ? <Text style={[s.body, { fontSize: 14.5, lineHeight: 26 }]}>{open.body}</Text> : null}
                {open.images.length > 1 ? (
                  <>
                    <Text style={s.galleryT}>معرض الصور ({open.images.length.toLocaleString("ar-EG")})</Text>
                    <View style={s.grid}>
                      {open.images.map((u) => (
                        <Pressable key={u} onPress={() => setViewer(u)} style={{ width: (cardW - 12) / 3, aspectRatio: 1 }}>
                          <Image source={{ uri: u }} style={{ flex: 1, borderRadius: 10 }} contentFit="cover" />
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </ScrollView>
          </View>
        ) : null}
        {/* عرض صورة بملء الشاشة */}
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
          <Pressable style={s.viewer} onPress={() => setViewer(null)} accessibilityLabel="إغلاق الصورة">
            {viewer ? <Image source={{ uri: viewer }} style={{ width: "100%", height: "86%" }} contentFit="contain" /> : null}
            <Text style={s.viewerT}>اضغط للإغلاق</Text>
          </Pressable>
        </Modal>
      </Modal>
    </View>
  );
}

function Meta({ icon, t }: { icon: keyof typeof Ionicons.glyphMap; t: string }) {
  return (
    <View style={s.meta}><Ionicons name={icon} size={13} color={Colors.textMuted} /><Text style={s.metaT} numberOfLines={1}>{t}</Text></View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  hero: { borderRadius: 22, padding: 16, gap: 14 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  heroT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15.5, color: "#fff", textAlign: "right" },
  stats: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 2 },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  chipsRow: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 13, height: 36, borderRadius: 999, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  chipOn: { backgroundColor: UC, borderColor: UC },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  chipTOn: { color: "#fff" },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#DC2626", textAlign: "center", marginTop: 30 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderSubtle },
  emptyIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  emptyS: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20 },
  monthRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4 },
  monthDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UC },
  month: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
  monthLine: { flex: 1, height: 1, backgroundColor: Colors.borderSubtle },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, overflow: "hidden" },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: Colors.bg },
  coverEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: "#0B1F33" },
  countBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "#000000AA", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  countT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  catPill: { alignSelf: "flex-end", flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.bg, borderWidth: 1, borderColor: UC + "55", paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  catT: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: UC },
  cardT: { fontFamily: "Cairo_700Bold", fontSize: 16, lineHeight: 26, color: Colors.text, textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  meta: { flexDirection: "row-reverse", alignItems: "center", gap: 4, maxWidth: "100%" },
  metaT: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: Colors.textSecondary, textAlign: "right" },
  galleryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right", marginTop: 6 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  viewer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", gap: 10 },
  viewerT: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.7)" },
});
