// صفحة منظمة: التعريف، الأهداف، الاحتياجات، التواصل، الفعاليات والحملات.
// مسؤول المنظمة يضيف ويعدّل فعالياتها وحملاتها هنا، والإدارة تعيّن المسؤولين.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import ViewCount from "@/components/ViewCount";
import { LoadError, LoadingBlock } from "@/components/ui/LoadState";
import { useAuth } from "@/lib/auth-context";
import { trackOpen } from "@/lib/views";
import {
  orgsApi, callPhone, openWhatsApp, arNum,
  type Organization, type OrgEvent, type OrgCampaign, type OrgManager,
} from "@/lib/orgs-api";
import { EventCard, CampaignCard, ActivityFormModal, EmptyState, type ActivityKind } from "@/components/orgs/OrgWidgets";
import { typeCfg, HEADER_GRADIENT, SOLID, DANGER } from "@/components/orgs/orgTheme";

type Data = { org: Organization; events: OrgEvent[]; campaigns: OrgCampaign[]; canManage: boolean; isAdmin: boolean };

export default function OrganizationScreen() {
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "missing" | "ok">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<{ kind: ActivityKind; initial?: OrgEvent | OrgCampaign | null } | null>(null);

  const load = useCallback(async () => {
    if (!id) { setStatus("missing"); return; }
    try {
      setData(await orgsApi.detail(String(id), token));
      setStatus("ok");
    } catch (e) {
      setStatus(/غير موجودة/.test((e as Error).message) ? "missing" : "error");
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (id) trackOpen("organization", `o-${id}`, token); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // فتح النموذج مباشرة عند القدوم من «أضف فعالية لمنظمتك»
  useEffect(() => {
    if (data?.canManage && (add === "event" || add === "campaign")) setForm({ kind: add });
  }, [data?.canManage, add]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (status !== "ok" || !data) {
    return (
      <View style={st.root}>
        <ModernHeader title="المنظمة" showBack gradient={HEADER_GRADIENT} />
        {status === "loading" && <LoadingBlock label="جارٍ التحميل…" />}
        {status === "error" && <LoadError onRetry={() => { setStatus("loading"); load(); }} />}
        {status === "missing" && <EmptyState icon="business-outline" title="المنظمة غير موجودة" body="ربما أُزيلت صفحتها أو تغيّر رابطها." />}
      </View>
    );
  }

  const { org, events, campaigns, canManage, isAdmin } = data;
  const cfg = typeCfg(org.type);

  const confirm = (msg: string, fn: () => Promise<unknown>) =>
    Alert.alert(msg, "", [
      { text: "تراجع", style: "cancel" },
      { text: "تأكيد", style: "destructive", onPress: () => { fn().then(load).catch((e) => Alert.alert("تعذّر التنفيذ", (e as Error).message)); } },
    ]);

  const submitForm = async (body: Record<string, unknown>) => {
    if (!form) return;
    const init = form.initial;
    if (form.kind === "event") {
      if (init) await orgsApi.updateEvent(init.id, body, token); else await orgsApi.createEvent(org.id, body, token);
    } else {
      if (init) await orgsApi.updateCampaign(init.id, body, token); else await orgsApi.createCampaign(org.id, body, token);
    }
    await load();
  };

  return (
    <View style={st.root}>
      <ModernHeader title={org.name} subtitle={cfg.label} showBack gradient={HEADER_GRADIENT} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── التعريف ── */}
        <View style={st.card}>
          <View style={st.row}>
            <View style={[st.icon, { backgroundColor: cfg.soft }]}>
              <MaterialCommunityIcons name={cfg.icon as never} size={28} color={cfg.color} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={st.name}>{org.name}</Text>
              <View style={st.chips}>
                <View style={[st.chip, { backgroundColor: cfg.soft }]}><Text style={[st.chipText, { color: cfg.color }]}>{cfg.label}</Text></View>
                {org.isVerified ? (
                  <View style={st.verified}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={Colors.primaryDeep} />
                    <Text style={st.verifiedText}>موثّقة من الإدارة</Text>
                  </View>
                ) : (
                  <Text style={st.muted}>بانتظار التوثيق</Text>
                )}
                <ViewCount kind="organization" id={`o-${org.id}`} label />
              </View>
            </View>
          </View>
          {!!(org.fullDescription || org.description) && <Text style={st.body}>{org.fullDescription || org.description}</Text>}
          <View style={st.facts}>
            {org.members > 0 && <Fact icon="people-outline" text={`${arNum(org.members)} عضو`} />}
            {!!org.founded && <Fact icon="flag-outline" text={`تأسست عام ${arNum(org.founded)}`} />}
          </View>
        </View>

        {/* ── التواصل ── */}
        {!!org.contact && (
          <View style={st.contactRow}>
            <TouchableOpacity style={[st.contactBtn, { backgroundColor: SOLID }]} onPress={() => callPhone(org.contact)} accessibilityRole="button" accessibilityLabel={`اتصال بـ ${org.name}`}>
              <Ionicons name="call-outline" size={18} color="#fff" />
              <Text style={[st.contactText, { color: "#fff" }]}>اتصال</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.contactBtn, st.contactGhost]} onPress={() => openWhatsApp(org.contact, `السلام عليكم، تواصلت معكم عبر تطبيق حصاحيصاوي.`)} accessibilityRole="button" accessibilityLabel={`مراسلة ${org.name} عبر واتساب`}>
              <Ionicons name="logo-whatsapp" size={18} color={Colors.primaryDeep} />
              <Text style={[st.contactText, { color: Colors.primaryDeep }]}>واتساب</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.contactBtn, st.contactGhost]} onPress={() => openWhatsApp(org.contact, `السلام عليكم، أرغب في التطوع مع ${org.name}.`)} accessibilityRole="button" accessibilityLabel={`التطوع مع ${org.name}`}>
              <Ionicons name="hand-left-outline" size={18} color={Colors.primaryDeep} />
              <Text style={[st.contactText, { color: Colors.primaryDeep }]}>أرغب بالتطوع</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── الأهداف والاحتياجات ── */}
        {org.goals.length > 0 && <ListBlock title="أهداف المنظمة" icon="flag-outline" items={org.goals} color={cfg.color} />}
        {org.needs.length > 0 && <ListBlock title="ما تحتاجه المنظمة" icon="hand-left-outline" items={org.needs} color={cfg.color} />}

        {/* ── الفعاليات ── */}
        <SectionTitle title="الفعاليات" count={events.length} action={canManage ? { label: "إضافة فعالية", onPress: () => setForm({ kind: "event" }) } : undefined} />
        {events.length === 0 ? (
          <Text style={st.emptyLine}>{canManage ? "لم تُنشر فعاليات بعد. أضف أول فعالية لتظهر في قسم الفعاليات." : "لا توجد فعاليات قادمة لهذه المنظمة."}</Text>
        ) : events.map((ev) => (
          <EventCard key={ev.id} ev={ev} showOrg={false} manage={canManage ? [
            { label: "تعديل", icon: "create-outline", onPress: () => setForm({ kind: "event", initial: ev }) },
            ev.status === "cancelled"
              ? { label: "إعادة النشر", icon: "refresh", onPress: () => confirm("إعادة نشر الفعالية؟", () => orgsApi.updateEvent(ev.id, { status: "published" }, token)) }
              : { label: "إلغاء الفعالية", icon: "close-circle-outline", onPress: () => confirm("إلغاء الفعالية؟ ستُخفى من القائمة العامة.", () => orgsApi.updateEvent(ev.id, { status: "cancelled" }, token)) },
            { label: "حذف", icon: "trash-outline", danger: true, onPress: () => confirm("حذف الفعالية نهائياً؟", () => orgsApi.deleteEvent(ev.id, token)) },
          ] : undefined} />
        ))}

        {/* ── الحملات ── */}
        <SectionTitle title="حملات التبرع" count={campaigns.length} action={canManage ? { label: "إضافة حملة", onPress: () => setForm({ kind: "campaign" }) } : undefined} />
        {campaigns.length === 0 ? (
          <Text style={st.emptyLine}>{canManage ? "لا توجد حملات. أضف حملة مع طريقة التبرع لتظهر للمتبرعين." : "لا توجد حملات تبرع قائمة لهذه المنظمة."}</Text>
        ) : campaigns.map((c) => (
          <CampaignCard key={c.id} c={c} showOrg={false} manage={canManage ? [
            { label: "تعديل / تحديث المبلغ", icon: "create-outline", onPress: () => setForm({ kind: "campaign", initial: c }) },
            c.status === "closed"
              ? { label: "إعادة فتح", icon: "refresh", onPress: () => confirm("إعادة فتح الحملة؟", () => orgsApi.updateCampaign(c.id, { status: "active" }, token)) }
              : { label: "إغلاق الحملة", icon: "lock-closed-outline", onPress: () => confirm("إغلاق الحملة؟ ستُخفى من القائمة العامة.", () => orgsApi.updateCampaign(c.id, { status: "closed" }, token)) },
            { label: "حذف", icon: "trash-outline", danger: true, onPress: () => confirm("حذف الحملة نهائياً؟", () => orgsApi.deleteCampaign(c.id, token)) },
          ] : undefined} />
        ))}

        {canManage && !org.isVerified && (
          <View style={st.notice}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primaryDeep} />
            <Text style={st.noticeText}>المنظمة لم توثّق بعد، لذلك تظهر فعالياتها وحملاتها لك وحدك حتى توثّقها الإدارة.</Text>
          </View>
        )}

        {isAdmin && <ManagersPanel orgId={org.id} token={token} />}
      </ScrollView>

      <ActivityFormModal
        visible={!!form}
        kind={form?.kind || "event"}
        initial={form?.initial}
        orgName={org.name}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
      />
    </View>
  );
}

function Fact({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={st.fact}>
      <Ionicons name={icon} size={15} color={Colors.textMuted} />
      <Text style={st.factText}>{text}</Text>
    </View>
  );
}

function ListBlock({ title, icon, items, color }: { title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; items: string[]; color: string }) {
  return (
    <View style={st.card}>
      <View style={st.blockHead}>
        <Ionicons name={icon} size={17} color={color} />
        <Text style={st.blockTitle}>{title}</Text>
      </View>
      {items.map((t, i) => (
        <View key={i} style={st.li}>
          <View style={[st.dot, { backgroundColor: color }]} />
          <Text style={st.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title, count, action }: { title: string; count: number; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={st.secRow}>
      <Text style={st.secTitle}>{title}{count ? ` (${arNum(count)})` : ""}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} style={st.secBtn} accessibilityRole="button" accessibilityLabel={action.label}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={st.secBtnText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// إدارة التطبيق: تعيين مسؤولي المنظمة الذين ينشرون باسمها
function ManagersPanel({ orgId, token }: { orgId: string; token: string | null }) {
  const [list, setList] = useState<OrgManager[] | null>(null);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { orgsApi.managers(orgId, token).then(setList).catch(() => setList([])); }, [orgId, token]);
  useEffect(load, [load]);
  const add = async () => {
    if (!who.trim()) return;
    setBusy(true); setMsg("");
    try { await orgsApi.addManager(orgId, who.trim(), token); setWho(""); load(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <View style={[st.card, { borderColor: Colors.borderGlow }]}>
      <View style={st.blockHead}>
        <Ionicons name="key-outline" size={17} color={Colors.primaryDeep} />
        <Text style={st.blockTitle}>مسؤولو المنظمة (للإدارة)</Text>
      </View>
      <Text style={st.muted}>المسؤول ينشر الفعاليات والحملات باسم المنظمة ويعدّلها.</Text>
      {list === null ? <ActivityIndicator color={Colors.primary} /> : list.length === 0 ? (
        <Text style={st.muted}>لا يوجد مسؤول بعد.</Text>
      ) : list.map((m) => (
        <View key={m.user_id} style={st.mgrRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.liText}>{m.name}</Text>
            <Text style={st.muted}>{m.phone || `#${m.user_id}`}</Text>
          </View>
          <TouchableOpacity
            onPress={() => orgsApi.removeManager(orgId, m.user_id, token).then(load).catch(() => {})}
            style={st.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={`إزالة ${m.name} من المسؤولين`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="person-remove-outline" size={18} color={DANGER} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={st.mgrAdd}>
        <TextInput
          style={st.input}
          value={who}
          onChangeText={setWho}
          placeholder="رقم الهاتف أو معرّف المستخدم"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
          accessibilityLabel="رقم هاتف المسؤول أو معرّفه"
        />
        <TouchableOpacity style={[st.secBtn, { minHeight: 44 }]} onPress={add} disabled={busy} accessibilityRole="button" accessibilityLabel="إضافة مسؤول">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.secBtnText}>إضافة</Text>}
        </TouchableOpacity>
      </View>
      {!!msg && <Text style={[st.muted, { color: DANGER }]}>{msg}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  icon: { width: 56, height: 56, borderRadius: Colors.radius.md, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 17, lineHeight: 28, color: Colors.textPrimary, textAlign: "right" },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Colors.radius.pill },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  verified: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  verifiedText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primaryDeep },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 24, color: Colors.textSecondary, textAlign: "right" },
  facts: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 16 },
  fact: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  factText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  contactRow: { flexDirection: "row-reverse", gap: 8 },
  contactBtn: { flex: 1, minHeight: 46, borderRadius: Colors.radius.md, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 },
  contactGhost: { backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.borderGlow },
  contactText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  blockHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  blockTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  li: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  liText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", flex: 1 },
  secRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  secTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  secBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: SOLID, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 },
  secBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  emptyLine: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textSecondary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md, padding: 14, borderWidth: 1, borderColor: Colors.border },
  notice: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-start", backgroundColor: Colors.primarySoft, borderRadius: Colors.radius.md, padding: 12 },
  noticeText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textPrimary, textAlign: "right" },
  mgrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 4 },
  mgrAdd: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: Colors.radius.md, backgroundColor: Colors.bg, paddingHorizontal: 12, minHeight: 44, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
});
