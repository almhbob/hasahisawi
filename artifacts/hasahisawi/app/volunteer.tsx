// التطوع ونقاط المجتمع — فرص التطوع، رصيدي ومستواي، ولوحة الشرف
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  RefreshControl, Modal, Image, Switch, Linking, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ModernHeader from "@/components/ui/ModernHeader";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { rewardsApi, levelStyleByName, fmtDate, type MyPoints, type BoardUser, type Opportunity } from "@/lib/rewards-api";

type Tab = "open" | "mine" | "points" | "board";
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "open", label: "الفرص", icon: "hand-left-outline" },
  { key: "mine", label: "تسجيلاتي", icon: "bookmark-outline" },
  { key: "points", label: "نقاطي", icon: "star-outline" },
  { key: "board", label: "لوحة الشرف", icon: "trophy-outline" },
];
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  registered: { t: "مسجّل", c: Colors.primary },
  attended: { t: "حضرت ✓", c: Colors.success ?? Colors.primary },
  no_show: { t: "لم تحضر", c: Colors.danger },
  cancelled: { t: "ملغى", c: Colors.textMuted },
};

export default function VolunteerScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest } = useAuth();
  const signedIn = !!token && !!user && !isGuest;
  const qp = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((["open", "mine", "points", "board"].includes(String(qp.tab)) ? qp.tab : "open") as Tab);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState<MyPoints | null>(null);
  const [board, setBoard] = useState<BoardUser[]>([]);
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Opportunity> & { notify_all?: boolean; date?: string } | null>(null);
  const [att, setAtt] = useState<{ opp: Opportunity; list: { id: number; name: string; phone: string | null; status: string }[]; sel: Record<number, boolean> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "open" || tab === "mine") {
        if (tab === "mine" && !signedIn) { setOpps([]); return; }
        const r = await rewardsApi.opportunities(token, tab);
        setOpps(r.opportunities); setCanManage(r.can_manage);
      } else if (tab === "points") {
        if (signedIn) setMe(await rewardsApi.myPoints(token!));
      } else {
        setBoard((await rewardsApi.leaderboard(period)).users);
      }
    } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    finally { setLoading(false); }
  }, [tab, period, token, signedIn]);
  useEffect(() => { load(); }, [load]);

  const needLogin = () => { notify("سجّل الدخول", "سجّل الدخول لتتطوع وتجمع النقاط."); };

  const signup = async (o: Opportunity) => {
    if (!signedIn) return needLogin();
    setBusy(o.id);
    try {
      if (o.my_status === "registered") {
        if (!(await confirmAction("إلغاء التسجيل", `إلغاء تسجيلك في «${o.title}»؟`, "إلغاء التسجيل", true))) return;
        await rewardsApi.cancelSignup(token!, o.id);
      } else {
        await rewardsApi.signup(token!, o.id);
        notify("تم التسجيل 🤝", `ستحصل على ${o.points} نقطة بعد تأكيد حضورك.`);
      }
      load();
    } catch (e: any) { notify("تعذّر", e?.message); }
    finally { setBusy(null); }
  };

  const saveForm = async () => {
    if (!form || !token) return;
    let starts_at: string | null = null;
    if (form.date?.trim()) {
      const d = new Date(form.date.trim().replace(" ", "T"));
      if (isNaN(+d)) return notify("صيغة التاريخ", "اكتب التاريخ هكذا: 2026-11-20 08:30");
      starts_at = d.toISOString();
    }
    const body = { ...form, starts_at };
    try {
      if (form.id) await rewardsApi.editOpp(token, form.id, body); else await rewardsApi.createOpp(token, body);
      setForm(null); setTab("open"); load();
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  const openAttendance = async (o: Opportunity) => {
    try {
      const r = await rewardsApi.signups(token!, o.id);
      const sel: Record<number, boolean> = {};
      r.signups.forEach((s) => { sel[s.id] = s.status === "attended"; });
      setAtt({ opp: o, list: r.signups, sel });
    } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const saveAttendance = async () => {
    if (!att) return;
    const attended = att.list.filter((s) => att.sel[s.id] && s.status !== "attended").map((s) => s.id);
    const absent = att.list.filter((s) => !att.sel[s.id] && s.status === "registered").map((s) => s.id);
    try {
      const r = await rewardsApi.attendance(token!, att.opp.id, attended, absent);
      notify("تم الحفظ", r.granted ? `مُنحت النقاط لـ ${r.granted} متطوع` : "حُدّثت قائمة الحضور");
      setAtt(null); load();
    } catch (e: any) { notify("تعذّر", e?.message); }
  };
  const setStatus = async (o: Opportunity, status: string) => {
    try { await rewardsApi.editOpp(token!, o.id, { status }); load(); } catch (e: any) { notify("تعذّر", e?.message); }
  };

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      <ModernHeader title="التطوع والنقاط" subtitle="تطوّع لمدينتك واجمع النقاط" icon="hand-left" showBack onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        rightSlot={canManage ? (
          <TouchableOpacity onPress={() => setForm({ points: 20 })} style={s.hBtn} accessibilityLabel="فرصة جديدة"><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
        ) : undefined}>
        <View style={s.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabOn]}>
              <Ionicons name={t.icon} size={15} color={tab === t.key ? Colors.primaryDeep : "#fff"} />
              <Text style={[s.tabTxt, tab === t.key && { color: Colors.primaryDeep }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ModernHeader>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : null}

        {!loading && (tab === "open" || tab === "mine") && (
          opps.length === 0 ? (
            <Empty icon="hand-left-outline" title={tab === "mine" ? (signedIn ? "لم تسجّل في أي فرصة بعد" : "سجّل الدخول لترى تسجيلاتك") : "لا توجد فرص تطوع مفتوحة الآن"} sub="تابعنا — تُنشر الفرص الجديدة هنا ويصلك إشعار بها." />
          ) : opps.map((o) => {
            const full = !!o.slots && o.registered >= o.slots;
            const st = o.my_status ? STATUS_LABEL[o.my_status] : null;
            return (
              <View key={o.id} style={s.card}>
                {o.cover_url ? <Image source={{ uri: o.cover_url }} style={s.cover} /> : null}
                <View style={s.rowB}>
                  <View style={s.ptsPill}><Ionicons name="star" size={13} color="#fff" /><Text style={s.ptsTxt}>{o.points} نقطة</Text></View>
                  {st && <Text style={[s.status, { color: st.c, borderColor: st.c }]}>{st.t}</Text>}
                </View>
                <Text style={s.title}>{o.title}</Text>
                {o.org_name ? <Text style={s.org}>{o.org_name}</Text> : null}
                {o.description ? <Text style={s.desc}>{o.description}</Text> : null}
                <View style={s.meta}>
                  {o.starts_at ? <Meta icon="calendar-outline" t={fmtDate(o.starts_at)} /> : null}
                  {o.duration_hours ? <Meta icon="time-outline" t={`${o.duration_hours} ساعة`} /> : null}
                  {o.location ? <Meta icon="location-outline" t={o.location} /> : null}
                  <Meta icon="people-outline" t={o.slots ? `${o.registered} / ${o.slots} متطوع` : `${o.registered} متطوع`} />
                </View>
                <View style={s.actions}>
                  {o.status === "open" && o.my_status !== "attended" && (
                    <TouchableOpacity disabled={busy === o.id || (full && o.my_status !== "registered")} onPress={() => signup(o)}
                      style={[s.btn, o.my_status === "registered" ? s.btnGhost : null, full && o.my_status !== "registered" && { opacity: 0.5 }]}>
                      {busy === o.id ? <ActivityIndicator color="#fff" size="small" /> : (
                        <Text style={[s.btnTxt, o.my_status === "registered" && { color: Colors.danger }]}>
                          {o.my_status === "registered" ? "إلغاء التسجيل" : full ? "اكتمل العدد" : "سجّلني متطوعاً"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {o.contact_phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.contact_phone}`)} style={s.iconBtn}><Ionicons name="call-outline" size={18} color={Colors.primary} /></TouchableOpacity>
                  ) : null}
                </View>
                {canManage && (
                  <View style={s.admin}>
                    <AdminBtn icon="checkmark-done-outline" t="الحضور ومنح النقاط" onPress={() => openAttendance(o)} />
                    <AdminBtn icon="create-outline" t="تعديل" onPress={() => setForm({ ...o, date: o.starts_at ? toLocalInput(o.starts_at) : "" })} />
                    {o.status === "open"
                      ? <AdminBtn icon="lock-closed-outline" t="إغلاق التسجيل" onPress={() => setStatus(o, "closed")} />
                      : <AdminBtn icon="lock-open-outline" t="إعادة فتح" onPress={() => setStatus(o, "open")} />}
                  </View>
                )}
              </View>
            );
          })
        )}

        {!loading && tab === "points" && (
          !signedIn ? <Empty icon="star-outline" title="سجّل الدخول لترى نقاطك" sub="تطوّع وشارك في المسابقات لتجمع النقاط وترتقي في المستويات." /> :
          me && <PointsView me={me} />
        )}

        {!loading && tab === "board" && (
          <>
            <View style={s.seg}>
              {(["month", "all"] as const).map((p) => (
                <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[s.segBtn, period === p && s.segOn]}>
                  <Text style={[s.segTxt, period === p && { color: "#fff" }]}>{p === "month" ? "هذا الشهر" : "كل الأوقات"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {board.length === 0 ? <Empty icon="trophy-outline" title="لوحة الشرف فارغة" sub="كن أول من يتصدّرها!" /> :
              board.map((u, i) => {
                const ls = levelStyleByName(u.level);
                return (
                  <TouchableOpacity key={u.id} onPress={() => router.push({ pathname: "/profile", params: { id: String(u.id) } } as any)} style={[s.bRow, i < 3 && { borderColor: ["#D4A017", "#8E9AAF", "#B87333"][i] }]}>
                    <Text style={[s.rank, i < 3 && { color: ["#D4A017", "#8E9AAF", "#B87333"][i] }]}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</Text>
                    {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={s.ava} /> : <View style={[s.ava, s.avaPh]}><Text style={s.avaTxt}>{u.name?.[0] || "؟"}</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={s.bName} numberOfLines={1}>{u.name}{u.is_verified ? " ✓" : ""}</Text>
                      <Text style={[s.bLvl, { color: ls.color }]}>{u.level}</Text>
                    </View>
                    <Text style={s.bPts}>{u.points.toLocaleString("ar-EG")}</Text>
                  </TouchableOpacity>
                );
              })}
          </>
        )}
      </ScrollView>

      {/* نموذج فرصة */}
      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <View style={s.mWrap}><View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.sheetTitle}>{form?.id ? "تعديل فرصة" : "فرصة تطوع جديدة"}</Text><TouchableOpacity onPress={() => setForm(null)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity></View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <Field label="العنوان *" v={form?.title} on={(t) => setForm((f) => ({ ...f!, title: t }))} ph="حملة نظافة سوق المدينة" />
            <Field label="الجهة المنظِّمة" v={form?.org_name} on={(t) => setForm((f) => ({ ...f!, org_name: t }))} ph="جمعية شباب الحصاحيصا" />
            <Field label="التفاصيل" v={form?.description} on={(t) => setForm((f) => ({ ...f!, description: t }))} multi ph="ماذا سيفعل المتطوعون؟ ماذا يحضرون معهم؟" />
            <Field label="المكان" v={form?.location} on={(t) => setForm((f) => ({ ...f!, location: t }))} />
            <Field label="الموعد (2026-11-20 08:30)" v={form?.date} on={(t) => setForm((f) => ({ ...f!, date: t }))} ltr />
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="النقاط" v={form?.points != null ? String(form.points) : ""} on={(t) => setForm((f) => ({ ...f!, points: Number(t.replace(/\D/g, "")) || 0 }))} num /></View>
              <View style={{ flex: 1 }}><Field label="المدة (ساعات)" v={form?.duration_hours != null ? String(form.duration_hours) : ""} on={(t) => setForm((f) => ({ ...f!, duration_hours: Number(t) || null }))} num /></View>
              <View style={{ flex: 1 }}><Field label="العدد المطلوب" v={form?.slots != null ? String(form.slots) : ""} on={(t) => setForm((f) => ({ ...f!, slots: Number(t.replace(/\D/g, "")) || null }))} num /></View>
            </View>
            <Field label="هاتف التواصل" v={form?.contact_phone} on={(t) => setForm((f) => ({ ...f!, contact_phone: t }))} ltr num />
            <Field label="رابط صورة الغلاف (https)" v={form?.cover_url} on={(t) => setForm((f) => ({ ...f!, cover_url: t }))} ltr />
            {!form?.id && (
              <View style={s.swRow}><Text style={s.lbl}>إرسال إشعار لكل المستخدمين</Text><Switch value={!!form?.notify_all} onValueChange={(v) => setForm((f) => ({ ...f!, notify_all: v }))} /></View>
            )}
            <TouchableOpacity onPress={saveForm} style={[s.btn, { marginTop: 6 }]}><Text style={s.btnTxt}>{form?.id ? "حفظ التعديلات" : "نشر الفرصة"}</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>

      {/* الحضور */}
      <Modal visible={!!att} animationType="slide" transparent onRequestClose={() => setAtt(null)}>
        <View style={s.mWrap}><View style={s.sheet}>
          <View style={s.sheetHead}><Text style={s.sheetTitle} numberOfLines={1}>الحضور — {att?.opp.title}</Text><TouchableOpacity onPress={() => setAtt(null)}><Ionicons name="close" size={24} color={Colors.textSecondary} /></TouchableOpacity></View>
          <Text style={s.hint}>علّم من حضر فعلاً — تُمنح النقاط ({att?.opp.points}) مرة واحدة لكل متطوع.</Text>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
            {att?.list.length === 0 && <Text style={s.hint}>لا يوجد مسجّلون بعد.</Text>}
            {att?.list.map((v) => (
              <TouchableOpacity key={v.id} disabled={v.status === "attended"} onPress={() => setAtt((a) => a && ({ ...a, sel: { ...a.sel, [v.id]: !a.sel[v.id] } }))} style={s.attRow}>
                <Ionicons name={att.sel[v.id] ? "checkbox" : "square-outline"} size={24} color={att.sel[v.id] ? Colors.primary : Colors.textMuted} />
                <View style={{ flex: 1 }}><Text style={s.bName}>{v.name}</Text>{v.phone ? <Text style={s.hint}>{v.phone}</Text> : null}</View>
                {v.status !== "registered" && <Text style={[s.status, { color: STATUS_LABEL[v.status]?.c, borderColor: STATUS_LABEL[v.status]?.c }]}>{STATUS_LABEL[v.status]?.t}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={saveAttendance} style={s.btn}><Text style={s.btnTxt}>حفظ ومنح النقاط</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

export function PointsView({ me }: { me: MyPoints }) {
  const ls = levelStyleByName(me.level.name);
  const next = me.level.next;
  const pct = next ? Math.min(1, (me.total - me.level.min) / Math.max(1, next.min - me.level.min)) : 1;
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.hero, { borderColor: ls.color }]}>
        <Ionicons name={ls.icon as any} size={44} color={ls.color} />
        <Text style={s.heroPts}>{me.total.toLocaleString("ar-EG")}</Text>
        <Text style={s.heroLbl}>نقطة · المستوى <Text style={{ color: ls.color }}>{me.level.name}</Text> · الترتيب #{me.rank.toLocaleString("ar-EG")}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: ls.color }]} /></View>
        <Text style={s.hint}>{next ? `بقي ${next.remaining} نقطة للوصول إلى «${next.name}»` : "وصلت لأعلى مستوى — شكراً لعطائك 💎"}</Text>
      </View>
      <View style={s.stats}>
        <Stat n={me.volunteer} l="نقاط التطوع" icon="hand-left-outline" />
        <Stat n={me.competition} l="نقاط المسابقات" icon="trophy-outline" />
        <Stat n={me.this_month} l="هذا الشهر" icon="calendar-outline" />
        <Stat n={me.volunteer_hours} l="ساعة تطوع" icon="time-outline" />
      </View>
      <View style={s.levels}>
        {me.levels.map((l) => {
          const st = levelStyleByName(l.name), on = me.total >= l.min;
          return (
            <View key={l.key} style={[s.lvl, on && { borderColor: st.color }]}>
              <Ionicons name={st.icon as any} size={22} color={on ? st.color : Colors.textSubtle} />
              <Text style={[s.lvlName, { color: on ? st.color : Colors.textMuted }]}>{l.name}</Text>
              <Text style={s.hint}>{l.min}+</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.secTitle}>سجل النقاط</Text>
      {me.history.length === 0 ? <Text style={s.hint}>لا توجد نقاط بعد — سجّل في فرصة تطوع أو شارك في مسابقة.</Text> :
        me.history.map((h, i) => (
          <View key={i} style={s.hRow}>
            <Text style={[s.hPts, { color: h.points >= 0 ? Colors.primary : Colors.danger }]}>{h.points > 0 ? "+" : ""}{h.points}</Text>
            <View style={{ flex: 1 }}><Text style={s.hReason}>{h.reason}</Text><Text style={s.hint}>{fmtDate(h.created_at, false)}</Text></View>
            <Ionicons name={h.kind === "volunteer" ? "hand-left-outline" : h.kind === "competition" ? "trophy-outline" : "gift-outline"} size={18} color={Colors.textMuted} />
          </View>
        ))}
    </View>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function Meta({ icon, t }: { icon: keyof typeof Ionicons.glyphMap; t: string }) {
  return <View style={s.metaItem}><Ionicons name={icon} size={14} color={Colors.textMuted} /><Text style={s.metaTxt}>{t}</Text></View>;
}
function AdminBtn({ icon, t, onPress }: { icon: keyof typeof Ionicons.glyphMap; t: string; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={s.adminBtn}><Ionicons name={icon} size={15} color={Colors.primaryDeep} /><Text style={s.adminTxt}>{t}</Text></TouchableOpacity>;
}
function Stat({ n, l, icon }: { n: number; l: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={s.stat}><Ionicons name={icon} size={18} color={Colors.primary} /><Text style={s.statN}>{Number(n || 0).toLocaleString("ar-EG")}</Text><Text style={s.statL}>{l}</Text></View>;
}
export function Empty({ icon, title, sub }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string }) {
  return <View style={s.empty}><Ionicons name={icon} size={48} color={Colors.textSubtle} /><Text style={s.emptyT}>{title}</Text>{sub ? <Text style={s.hint}>{sub}</Text> : null}</View>;
}
function Field({ label, v, on, ph, multi, ltr, num }: { label: string; v?: string | null; on: (t: string) => void; ph?: string; multi?: boolean; ltr?: boolean; num?: boolean }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput value={v ?? ""} onChangeText={on} placeholder={ph} placeholderTextColor={Colors.textSubtle} multiline={multi}
        keyboardType={num ? "numeric" : "default"} style={[s.input, multi && { minHeight: 90, textAlignVertical: "top" }, ltr && { textAlign: "left", writingDirection: "ltr" }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  hBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,.2)", alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row-reverse", gap: 6, marginTop: 12 },
  tab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,.14)" },
  tabOn: { backgroundColor: "#fff" },
  tabTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  cover: { width: "100%", height: 150, borderRadius: 12, backgroundColor: Colors.bgDeep },
  rowB: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  ptsPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  ptsTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  status: { fontFamily: "Cairo_700Bold", fontSize: 11, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  org: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary, textAlign: "right", marginTop: -4 },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  meta: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  metaTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  actions: { flexDirection: "row-reverse", gap: 8, marginTop: 4 },
  btn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.danger },
  btnTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  iconBtn: { width: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  admin: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  adminBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.primary + "14" },
  adminTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primaryDeep },
  seg: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.divider },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  segOn: { backgroundColor: Colors.primary },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  bRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: Colors.divider },
  rank: { width: 32, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textMuted },
  ava: { width: 44, height: 44, borderRadius: 22 },
  avaPh: { backgroundColor: Colors.primary + "22", alignItems: "center", justifyContent: "center" },
  avaTxt: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },
  bName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  bLvl: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right" },
  bPts: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.accentDeep ?? Colors.accent },
  hero: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 20, alignItems: "center", gap: 6, borderWidth: 2 },
  heroPts: { fontFamily: "Cairo_700Bold", fontSize: 44, color: Colors.textPrimary, lineHeight: 56 },
  heroLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  track: { width: "100%", height: 10, borderRadius: 5, backgroundColor: Colors.divider, overflow: "hidden", marginTop: 8, transform: [{ scaleX: -1 }] },
  fill: { height: "100%", borderRadius: 5 },
  stats: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, alignItems: "center", gap: 2, borderWidth: 1, borderColor: Colors.divider },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  levels: { flexDirection: "row-reverse", gap: 8 },
  lvl: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  lvlName: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginTop: 6 },
  hRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  hPts: { fontFamily: "Cairo_700Bold", fontSize: 18, minWidth: 48, textAlign: "center" },
  hReason: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 50 },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textSecondary, textAlign: "center" },
  mWrap: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.bgAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: "90%", gap: 10 },
  sheetHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  lbl: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 12 : 8, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  swRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  attRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
});
