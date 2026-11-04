// 🗂️ إدارة قوالب السيرة الذاتية — للمدير فقط: الظهور، مجاني/مميز، السعر، الشارة، الترتيب، والإحصاءات.
import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import CVFrame from "@/components/CVFrame";
import { CV_TEMPLATES, SAMPLE_CV, buildCVHtml } from "@/lib/cv-templates";
import { cvTemplatesAdminApi, type AdminCatalog, type AdminTplRow, type TplStats } from "@/lib/cv-catalog";
import { notify } from "@/lib/xplatform";

type Tab = "list" | "stats";
type Period = "d7" | "d30" | "all";
const PERIODS: { id: Period; label: string }[] = [{ id: "d7", label: "٧ أيام" }, { id: "d30", label: "٣٠ يوماً" }, { id: "all", label: "كل الوقت" }];
const BADGES: (string | null)[] = [null, "جديد", "الأكثر طلباً", "مطوّر", "عرض خاص"];
const nameOf = (id: string) => CV_TEMPLATES.find((t) => t.id === id)?.name || id;
const thumbHtml: Record<string, string> = {};
const thumbOf = (id: string) => (thumbHtml[id] ??= buildCVHtml({ ...SAMPLE_CV, showPhoto: !!CV_TEMPLATES.find((t) => t.id === id)?.photo }, id as any, null));

function Bars({ title, icon, rows, color, empty }: { title: string; icon: any; rows: { id: string; n: number; sub?: string }[]; color: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <View style={st.card}>
      <View style={st.cardHead}><Ionicons name={icon} size={17} color={color} /><Text style={st.cardTitle}>{title}</Text></View>
      {rows.length === 0 || rows.every((r) => r.n === 0) ? <Text style={st.muted}>{empty}</Text> : rows.map((r, i) => (
        <View key={r.id} style={st.barRow} accessibilityLabel={`${i + 1}. ${nameOf(r.id)}: ${r.n}`}>
          <Text style={st.rank}>{i + 1}</Text>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}>
              <Text style={st.barName}>{nameOf(r.id)}</Text>
              <Text style={st.barNum}>{r.n}{r.sub ? <Text style={st.muted}>  {r.sub}</Text> : null}</Text>
            </View>
            <View style={st.track}><View style={[st.fill, { width: `${Math.max(3, (r.n / max) * 100)}%`, backgroundColor: color }]} /></View>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function CvTemplatesAdmin() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AdminCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("list");
  const [period, setPeriod] = useState<Period>("d30");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return; }
    setError("");
    try {
      const d = await cvTemplatesAdminApi.list(token);
      setData(d);
      setPrices(Object.fromEntries(d.templates.map((t) => [t.id, t.price == null ? "" : String(t.price)])));
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, isAdmin]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function patch(id: string, body: Partial<Omit<AdminTplRow, "id">>) {
    if (!token || !data) return;
    const prev = data;
    setData({ ...data, templates: data.templates.map((t) => (t.id === id ? { ...t, ...body } : t)) });
    setBusy(id);
    try { await cvTemplatesAdminApi.patch(token, id, body); }
    catch (e: any) { setData(prev); notify("تعذّر الحفظ", e?.message || ""); }
    finally { setBusy(null); }
  }
  async function move(id: string, dir: -1 | 1) {
    if (!token || !data) return;
    const ids = data.templates.map((t) => t.id); const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const prev = data;
    setData({ ...data, templates: ids.map((x, k) => ({ ...data.templates.find((t) => t.id === x)!, sort_order: (k + 1) * 10 })) });
    try { await cvTemplatesAdminApi.reorder(token, ids); } catch (e: any) { setData(prev); notify("تعذّر الترتيب", e?.message || ""); }
  }
  function savePrice(id: string) {
    const raw = (prices[id] || "").trim().replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
    const cur = data?.templates.find((t) => t.id === id)?.price ?? null;
    const next = raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0)) { notify("سعر غير صالح", "اكتب رقماً موجباً أو اتركه فارغاً"); return; }
    if (next !== cur) patch(id, { price: next });
  }

  const S = data?.stats || {};
  const val = (id: string, k: keyof TplStats) => S[id]?.[k]?.[period] ?? 0;
  const ranked = useMemo(() => {
    const ids = CV_TEMPLATES.map((t) => t.id);
    const by = (f: (id: string) => number) => ids.map((id) => ({ id, n: f(id) })).sort((a, b) => b.n - a.n).filter((x) => x.n > 0).slice(0, 8);
    return {
      used: by((id) => val(id, "select") + val(id, "export")).map((r) => ({ ...r, sub: `تصدير ${val(r.id, "export")}` })),
      requested: by((id) => val(id, "request")).map((r) => ({ ...r, sub: `موافقة ${val(r.id, "approved")}` })),
      previewed: by((id) => val(id, "preview")),
    };
  }, [data, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => {
    const ks: (keyof TplStats)[] = ["preview", "select", "export", "request", "approved"];
    return Object.fromEntries(ks.map((k) => [k, CV_TEMPLATES.reduce((a, t) => a + val(t.id, k), 0)])) as Record<keyof TplStats, number>;
  }, [data, period]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) {
    return (
      <View style={[st.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <Ionicons name="lock-closed" size={36} color={Colors.textMuted} />
        <Text style={[st.cardTitle, { textAlign: "center", marginTop: 10 }]}>هذه الصفحة لمدير التطبيق فقط</Text>
        <TouchableOpacity onPress={() => router.back()} style={[st.seg, st.segOn, { marginTop: 16, paddingHorizontal: 22 }]}><Text style={[st.segTxt, { color: "#fff" }]}>رجوع</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.back} hitSlop={10} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.hTitle}>قوالب السيرة الذاتية</Text>
          <Text style={st.hSub}>ما يظهر للمستخدمين، مجاني أو مميز، والأكثر استخداماً وطلباً</Text>
        </View>
      </View>
      <View style={st.tabs}>
        {([["list", "القوالب", "albums-outline"], ["stats", "الإحصائيات", "stats-chart-outline"]] as const).map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Ionicons name={ic} size={16} color={tab === k ? "#fff" : Colors.textSecondary} />
            <Text style={[st.tabTxt, tab === k && { color: "#fff" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {error ? <View style={st.card}><Text style={[st.muted, { color: Colors.danger }]}>{error}</Text><TouchableOpacity onPress={load} style={[st.seg, { alignSelf: "flex-end" }]}><Text style={st.segTxt}>إعادة المحاولة</Text></TouchableOpacity></View> : null}

          {data && tab === "list" ? <>
            <View style={[st.note, { borderColor: (data.pricing_visible ? Colors.primary : Colors.accent) + "55" }]}>
              <Ionicons name={data.pricing_visible ? "pricetag" : "eye-off-outline"} size={16} color={data.pricing_visible ? Colors.primaryDeep : Colors.accentDeep} />
              <Text style={st.noteTxt}>
                {data.pricing_visible ? "إظهار الأسعار مفعّل: سعر القالب المميز يظهر للمستخدمين." : "الأسعار مخفية حالياً عن المستخدمين (تُفعَّل من إعدادات الأسعار). يمكنك تجهيزها هنا مسبقاً."}
                {data.auto_badge_template ? ` الشارة التلقائية «${data.auto_badge}» تذهب الآن إلى «${nameOf(data.auto_badge_template)}» ما لم تضع له شارة يدوية.` : ""}
              </Text>
            </View>
            {data.templates.map((t, i) => (
              <View key={t.id} style={[st.card, !t.visible && { opacity: 0.72 }]}>
                <View style={{ flexDirection: "row-reverse", gap: 12 }}>
                  <View pointerEvents="none"><CVFrame html={thumbOf(t.id)} width={84} /></View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                      <Text style={st.tName}>{nameOf(t.id)}</Text>
                      {busy === t.id ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
                    </View>
                    <Text style={st.muted} numberOfLines={2}>{CV_TEMPLATES.find((x) => x.id === t.id)?.desc}</Text>
                    <Text style={st.small}>٣٠ يوماً: معاينة {S[t.id]?.preview.d30 ?? 0} · اختيار {S[t.id]?.select.d30 ?? 0} · تصدير {S[t.id]?.export.d30 ?? 0} · طلبات {S[t.id]?.request.d30 ?? 0}</Text>
                  </View>
                  <View style={{ gap: 2 }}>
                    <TouchableOpacity onPress={() => move(t.id, -1)} disabled={i === 0} style={st.arrow} accessibilityRole="button" accessibilityLabel={`نقل ${nameOf(t.id)} للأعلى`}><Ionicons name="chevron-up" size={20} color={i === 0 ? Colors.textSubtle : Colors.textPrimary} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => move(t.id, 1)} disabled={i === data.templates.length - 1} style={st.arrow} accessibilityRole="button" accessibilityLabel={`نقل ${nameOf(t.id)} للأسفل`}><Ionicons name="chevron-down" size={20} color={i === data.templates.length - 1 ? Colors.textSubtle : Colors.textPrimary} /></TouchableOpacity>
                  </View>
                </View>

                <View style={st.ctrlRow}>
                  <Text style={st.lbl}>ظاهر للمستخدمين</Text>
                  <Switch value={t.visible} onValueChange={(v) => patch(t.id, { visible: v })} accessibilityLabel={`إظهار ${nameOf(t.id)}`} trackColor={{ true: Colors.primary, false: Colors.border }} />
                </View>
                <View style={st.ctrlRow}>
                  <Text style={st.lbl}>المستوى</Text>
                  <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                    {(["free", "premium"] as const).map((k) => (
                      <TouchableOpacity key={k} onPress={() => t.tier !== k && patch(t.id, { tier: k })} style={[st.seg, t.tier === k && (k === "premium" ? st.segPrem : st.segOn)]} accessibilityRole="button" accessibilityState={{ selected: t.tier === k }}>
                        <Ionicons name={k === "premium" ? "star" : "gift-outline"} size={13} color={t.tier === k ? "#fff" : Colors.textSecondary} />
                        <Text style={[st.segTxt, t.tier === k && { color: "#fff" }]}>{k === "premium" ? "مميز" : "مجاني"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {t.tier === "premium" ? (
                  <View style={st.ctrlRow}>
                    <Text style={st.lbl}>السعر (ج.س)</Text>
                    <TextInput value={prices[t.id] ?? ""} onChangeText={(v) => setPrices((p) => ({ ...p, [t.id]: v }))} onBlur={() => savePrice(t.id)} onSubmitEditing={() => savePrice(t.id)}
                      keyboardType="numeric" placeholder="بدون سعر" placeholderTextColor={Colors.textMuted} style={st.price} accessibilityLabel={`سعر ${nameOf(t.id)}`} />
                  </View>
                ) : null}
                <View style={{ gap: 6 }}>
                  <Text style={st.lbl}>الشارة</Text>
                  <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
                    {BADGES.map((b) => {
                      const on = (t.badge || null) === b;
                      return (
                        <TouchableOpacity key={b || "none"} onPress={() => !on && patch(t.id, { badge: b })} style={[st.seg, on && st.segOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                          <Text style={[st.segTxt, on && { color: "#fff" }]}>{b || "بلا شارة"}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            ))}
          </> : null}

          {data && tab === "stats" ? <>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              {PERIODS.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => setPeriod(p.id)} style={[st.seg, { flex: 1, justifyContent: "center" }, period === p.id && st.segOn]} accessibilityRole="button" accessibilityState={{ selected: period === p.id }}>
                  <Text style={[st.segTxt, period === p.id && { color: "#fff" }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={st.tiles}>
              {([["preview", "معاينات", "eye-outline"], ["select", "اختيارات", "checkmark-done-outline"], ["export", "تصدير PDF", "download-outline"], ["request", "طلبات مميزة", "sparkles-outline"], ["approved", "موافقات", "shield-checkmark-outline"]] as const).map(([k, l, ic]) => (
                <View key={k} style={st.tile}><Ionicons name={ic} size={16} color={Colors.primaryDeep} /><Text style={st.tileNum}>{totals[k]}</Text><Text style={st.tileLbl}>{l}</Text></View>
              ))}
            </View>
            <Bars title="الأكثر استخداماً (اختيار + تصدير)" icon="trending-up" rows={ranked.used} color={Colors.primary} empty="لا استخدام مسجّل في هذه الفترة بعد." />
            <Bars title="الأكثر طلباً (طلبات القوالب المميزة)" icon="flame-outline" rows={ranked.requested} color="#C2410C" empty="لا طلبات في هذه الفترة." />
            <Bars title="الأكثر معاينة" icon="eye-outline" rows={ranked.previewed} color="#0E7490" empty="لا معاينات في هذه الفترة." />
            <Text style={st.muted}>المعاينة تُحسب مرة يومياً لكل جهاز. الطلبات والموافقات من سجل طلبات القوالب المميزة. «كل القوالب» تُحسب كطلب مستقل.</Text>
          </> : null}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  hTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  hSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  tabs: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  tab: { flex: 1, minHeight: 44, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBg },
  tabOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary },
  card: { gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle || Colors.border, backgroundColor: Colors.cardBg },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  note: { flexDirection: "row-reverse", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, backgroundColor: Colors.cardBg },
  noteTxt: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, lineHeight: 20, color: Colors.textSecondary, textAlign: "right" },
  tName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: Colors.textMuted, textAlign: "right" },
  small: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  ctrlRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44 },
  lbl: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  seg: { minHeight: 40, flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg },
  segOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segPrem: { backgroundColor: "#7A5400", borderColor: "#7A5400" },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  price: { width: 130, height: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 14, paddingHorizontal: 10, textAlign: "center" },
  tiles: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tile: { flexGrow: 1, minWidth: 96, alignItems: "center", gap: 2, padding: 10, borderRadius: 14, backgroundColor: Colors.primarySoft },
  tileNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  tileLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  barRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  rank: { width: 22, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  barName: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  barNum: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  track: { height: 10, borderRadius: 5, backgroundColor: Colors.divider, overflow: "hidden", flexDirection: "row-reverse" },
  fill: { height: 10, borderRadius: 5 },
});
