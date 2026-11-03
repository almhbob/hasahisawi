// إدارة عضويات ديوان الكُتّاب: مراجعة الاستمارات والأعمال الثلاثة، الاعتماد، التجديد السنوي، التعليق وإعادة التفعيل، ومنح الجوائز والأوسمة.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { membersApi, MEMBER_STATUS, type Member } from "@/lib/lit-members";
import { WINE, GOLD, INK } from "@/lib/lit";
import { Pill, Empty, ithraaStyles as u } from "@/components/ithraa/ui";

const TABS: [string, string][] = [["pending", "طلبات جديدة"], ["renewals", "طلبات التجديد"], ["active", "سارية"], ["suspended", "معلّقة"], ["expired", "منتهية"], ["rejected", "مرفوضة"]];
const AWARD_ICONS = ["ribbon", "medal", "trophy", "star", "diamond", "flame", "sparkles"];

export default function MembersAdmin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab, setTab] = useState("pending");
  const [data, setData] = useState<{ members: Member[]; counts: Record<string, number> } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setData(await membersApi.list(token, tab)); } catch (e: any) { notify("تعذّر التحميل", e?.message); } finally { setLoading(false); }
  }, [token, tab]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace("/writers-membership" as any))} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <Text style={st.barTitle}>إدارة العضويات</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={WINE} />} keyboardShouldPersistTaps="handled">
        <View style={u.wrap}>
          {TABS.map(([k, l]) => <Pill key={k} label={`${l}${data?.counts[k] ? ` (${data.counts[k]})` : ""}`} on={tab === k} onPress={() => { setTab(k); setOpen(null); }} color={k === "pending" || k === "renewals" ? "#B7791F" : WINE} />)}
        </View>
        <Text style={[u.hint, { marginTop: 8 }]}>التعليق التلقائي يعمل كل ساعة: عضو لم ينشر 30 يوماً تُعلّق عضويته ويُنبَّه قبلها بأسبوع، وتعود فور نشره نصاً معتمداً.</Text>
        {loading && <ActivityIndicator color={WINE} style={{ marginTop: 24 }} />}
        {!loading && data?.members.map((m) => <MemberRow key={m.id} m={m} token={token!} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} onDone={load} />)}
        {!loading && !data?.members.length && <Empty icon="id-card-outline" title="لا شيء هنا" />}
      </ScrollView>
    </View>
  );
}

function MemberRow({ m, token, open, onToggle, onDone }: { m: Member; token: string; open: boolean; onToggle: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [award, setAward] = useState({ title: "", description: "", icon: "ribbon" });
  const st0 = MEMBER_STATUS[m.status];
  const inactiveDays = m.last_activity_at ? Math.floor((Date.now() - new Date(m.last_activity_at).getTime()) / 86400000) : null;
  const act = async (action: string, confirm?: string) => {
    if (["reject", "suspend"].includes(action) && note.trim().length < 3) return notify("السبب", "اكتب السبب ليصل للعضو.");
    if (confirm && !(await confirmAction(confirm, m.full_name, "تأكيد", action === "suspend"))) return;
    setBusy(true);
    try { await membersApi.action(token, m.id, action, { note: note.trim() || undefined }); setNote(""); onDone(); } catch (e: any) { notify("تعذّر", e?.message); } finally { setBusy(false); }
  };
  const giveAward = async () => {
    if (award.title.trim().length < 3) return notify("الجائزة", "اكتب اسم الجائزة أو الوسام.");
    try { await membersApi.award(token, m.user_id, { ...award, color: GOLD }); setAward({ title: "", description: "", icon: "ribbon" }); notify("تم", "مُنحت الجائزة وأُشعر العضو"); } catch (e: any) { notify("تعذّر", e?.message); }
  };
  return (
    <View style={[u.card, { marginTop: 10, borderRightWidth: 4, borderRightColor: m.color }]}>
      <Pressable onPress={onToggle} style={[u.rowR, { gap: 10 }]}>
        <UserAvatar name={m.full_name} avatarUrl={m.avatar_url} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{m.full_name}{m.pen_name ? ` (${m.pen_name})` : ""}</Text>
          <Text style={[u.hint, { color: m.color }]}>{m.category_label} · {m.tier_label}{m.member_no ? ` · ${m.member_no}` : ""}</Text>
          <Text style={u.hint}>
            <Text style={{ color: st0.color }}>{st0.label}</Text>
            {m.valid_until ? ` · حتى ${new Date(m.valid_until).toLocaleDateString("ar-EG")}` : ""}
            {inactiveDays != null && m.status !== "pending" ? ` · آخر نشر قبل ${inactiveDays} يوماً` : ""}
            {m.renewal_requested_at ? " · طلب تجديد" : ""}
          </Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </Pressable>

      {open && (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Info k="الهاتف" v={m.phone} /><Info k="البريد" v={m.email} /><Info k="المدينة" v={m.city} /><Info k="سنة الميلاد" v={m.birth_year ? String(m.birth_year) : null} />
          {m.category === "journalist" && (<><Info k="المؤسسة" v={m.press_org} /><Info k="الصفة" v={m.press_role} /><Info k="رقم القيد" v={m.press_card_no} /><Info k="الخبرة" v={m.press_years ? `${m.press_years} سنة` : null} /></>)}
          {!!m.genres.length && <Info k="المجالات" v={m.genres.join("، ")} />}
          <Text style={st.sec}>النبذة</Text><Text style={st.body}>{m.bio}</Text>
          {!!m.publications && (<><Text style={st.sec}>الإصدارات والمنشورات</Text><Text style={st.body}>{m.publications}</Text></>)}
          <Text style={st.sec}>الأعمال الثلاثة</Text>
          {(m.works || []).map((w, i) => (
            <Pressable key={i} onPress={() => (w.type === "diwan" && w.text_id ? router.push({ pathname: "/writers-text", params: { id: String(w.text_id) } } as any) : w.link ? openExternal(w.link) : undefined)} style={st.work}>
              <Ionicons name={w.type === "diwan" ? "shield-checkmark" : "link"} size={16} color={WINE} />
              <View style={{ flex: 1 }}>
                <Text style={st.workT}>{w.title}</Text>
                <Text style={u.hint}>{w.type === "diwan" ? `نص موثّق ${w.doc_no}` : [w.kind, w.where, w.year].filter(Boolean).join(" · ")}</Text>
                {!!w.excerpt && <Text style={st.excerpt} numberOfLines={4}>{w.excerpt}</Text>}
              </View>
            </Pressable>
          ))}
          <Text style={u.hint}>وقّع التعهّد: {m.pledge_signature} · {m.pledge_at ? new Date(m.pledge_at).toLocaleDateString("ar-EG") : ""}</Text>
          {!!m.admin_note && <Text style={[u.hint, { color: "#C0392B" }]}>ملاحظة سابقة: {m.admin_note}</Text>}

          <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة / سبب (إلزامي للرفض والتعليق)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 6 }]} />
          <View style={[u.rowR, { gap: 8, flexWrap: "wrap" }]}>
            {m.status === "pending" && <Btn l="اعتماد وإصدار البطاقة" c="#0E8A5F" i="checkmark-circle" on={() => act("approve")} busy={busy} />}
            {m.status === "pending" && <Btn l="رفض" c="#C0392B" i="close-circle" on={() => act("reject")} busy={busy} />}
            {["active", "expired", "suspended"].includes(m.status) && <Btn l="تجديد لعام" c="#2B6CB0" i="refresh-circle" on={() => act("renew", "تجديد العضوية لعام")} busy={busy} />}
            {m.status === "active" && <Btn l="تعليق" c="#C2580A" i="pause-circle" on={() => act("suspend", "تعليق العضوية")} busy={busy} />}
            {m.status === "suspended" && <Btn l="إعادة تفعيل" c="#0E8A5F" i="play-circle" on={() => act("reactivate")} busy={busy} />}
          </View>

          {m.status !== "pending" && m.status !== "rejected" && (
            <View style={st.awardBox}>
              <View style={[u.rowR, { gap: 6 }]}><Ionicons name="trophy" size={16} color={GOLD} /><Text style={st.sec}>منح جائزة أو وسام</Text></View>
              <TextInput value={award.title} onChangeText={(t) => setAward({ ...award, title: t })} placeholder="مثال: وسام الإبداع الشعري 2026" placeholderTextColor={Colors.textMuted} style={u.input} />
              <TextInput value={award.description} onChangeText={(t) => setAward({ ...award, description: t })} placeholder="سبب المنح (اختياري)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 6 }]} />
              <View style={[u.rowR, { gap: 6, marginTop: 6 }]}>
                {AWARD_ICONS.map((ic) => (
                  <Pressable key={ic} onPress={() => setAward({ ...award, icon: ic })} style={[st.ic, award.icon === ic && { backgroundColor: GOLD }]}><Ionicons name={ic as any} size={16} color={award.icon === ic ? "#fff" : GOLD} /></Pressable>
                ))}
              </View>
              <Btn l="منح" c={GOLD} i="ribbon" on={giveAward} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function Info({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return <View style={[u.rowR, { justifyContent: "space-between" }]}><Text style={u.hint}>{k}</Text><Text style={st.v}>{v}</Text></View>;
}
function Btn({ l, c, i, on, busy }: { l: string; c: string; i: string; on: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={on} disabled={busy} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: c + "16", borderWidth: 1, borderColor: c + "55", opacity: busy ? 0.6 : 1, alignSelf: "flex-end", marginTop: 6 }}>
      <Ionicons name={i as any} size={15} color={c} /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12.5, color: c }}>{l}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  v: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary, flex: 1, textAlign: "left" },
  sec: { fontFamily: "Cairo_700Bold", fontSize: 13, color: WINE, textAlign: "right", marginTop: 6 },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  work: { flexDirection: "row-reverse", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg },
  workT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  excerpt: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20, marginTop: 2 },
  awardBox: { marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: GOLD + "0F", borderWidth: 1, borderColor: GOLD + "44" },
  ic: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: GOLD + "66", alignItems: "center", justifyContent: "center" },
});
