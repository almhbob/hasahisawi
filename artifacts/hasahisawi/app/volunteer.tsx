import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import VolunteerCard from "@/components/volunteer/VolunteerCard";
import {
  volunteerApi, TASK_CATEGORIES, TIER_STYLE, fmtDate, type VolunteerMe, type VolunteerTask,
} from "@/lib/volunteer";
import { shareViewAsImage } from "@/lib/share-image";
import { APP_INVITE, HASHTAGS } from "@/constants/app-invite";
import { confirmAction, notify } from "@/lib/xplatform";

type Tab = "tasks" | "me" | "card" | "top";
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "tasks", label: "المهام", icon: "list-outline" },
  { key: "me", label: "نقاطي", icon: "star-outline" },
  { key: "card", label: "البطاقة", icon: "card-outline" },
  { key: "top", label: "المتصدرون", icon: "trophy-outline" },
];

export default function VolunteerScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest, user } = useAuth();
  const [tab, setTab] = useState<Tab>("tasks");
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [me, setMe] = useState<VolunteerMe | null>(null);
  const [top, setTop] = useState<Awaited<ReturnType<typeof volunteerApi.leaderboard>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [t, lb] = await Promise.all([volunteerApi.tasks(token), volunteerApi.leaderboard().catch(() => [])]);
      setTasks(t);
      setTop(lb);
      if (token && !isGuest) setMe(await volunteerApi.me(token).catch(() => null));
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isGuest]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleJoin = async (t: VolunteerTask) => {
    if (!token || isGuest) { notify("تسجيل مطلوب", "سجّل الدخول لتتطوع وتجمع النقاط."); return; }
    const joined = t.my_status === "joined";
    if (joined && !(await confirmAction("الانسحاب من المهمة؟", t.title, "انسحاب", true))) return;
    setBusy(t.id);
    try {
      await (joined ? volunteerApi.leave(t.id, token) : volunteerApi.join(t.id, token));
      if (!joined) notify("تم التسجيل 🤝", "سيتواصل معك المنظم، وتُضاف نقاطك بعد اعتماد إنجازك.");
      await load();
    } catch (e: any) {
      notify("تعذّر التنفيذ", e?.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>التطوع</Text>
        {me?.canManage ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/volunteer-admin" as any)} accessibilityLabel="إدارة التطوع">
            <Ionicons name="settings-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>

      {/* شريط المستوى */}
      {me && (
        <View style={s.levelBar}>
          <View style={[s.tierDot, { backgroundColor: TIER_STYLE[me.level.tier].metal[0], borderColor: TIER_STYLE[me.level.tier].metal[1] }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.levelName}>{me.level.name} · {me.points} نقطة</Text>
            <View style={s.track}><View style={[s.fill, { width: `${Math.round(me.level.progress * 100)}%` }]} /></View>
            <Text style={s.levelNext}>
              {me.level.next ? `باقي ${me.level.next.remaining} نقطة لتصبح «${me.level.next.name}»` : "بلغت أعلى مستوى — شكراً لعطائك"}
            </Text>
          </View>
        </View>
      )}

      <View style={s.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabOn]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Ionicons name={t.icon} size={16} color={tab === t.key ? Colors.onColor : Colors.textSecondary} />
            <Text style={[s.tabText, tab === t.key && { color: Colors.onColor }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {error ? <Text style={s.error}>{error}</Text> : null}
          {tab === "tasks" && <TasksTab tasks={tasks} busy={busy} onToggle={toggleJoin} />}
          {tab === "me" && (me ? <MeTab me={me} /> : <SignInHint />)}
          {tab === "card" && (me ? <CardTab me={me} name={user?.name ?? ""} token={token} onChanged={load} /> : <SignInHint />)}
          {tab === "top" && <TopTab rows={top} myId={user?.id ? Number(user.id) : null} />}
        </ScrollView>
      )}
    </View>
  );
}

function SignInHint() {
  return (
    <View style={s.empty}>
      <Ionicons name="person-circle-outline" size={52} color={Colors.textMuted} />
      <Text style={s.emptyText}>سجّل الدخول لتتطوع وتجمع النقاط وتحصل على بطاقة المتطوع.</Text>
      <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/login")}><Text style={s.primaryBtnText}>تسجيل الدخول</Text></TouchableOpacity>
    </View>
  );
}

function TasksTab({ tasks, busy, onToggle }: { tasks: VolunteerTask[]; busy: number | null; onToggle: (t: VolunteerTask) => void }) {
  if (!tasks.length) {
    return (
      <View style={s.empty}>
        <Ionicons name="hand-left-outline" size={52} color={Colors.textMuted} />
        <Text style={s.emptyText}>لا توجد مهام تطوعية مفتوحة الآن. تابعنا — تُضاف مهام جديدة باستمرار.</Text>
      </View>
    );
  }
  return (
    <>
      {tasks.map((t) => {
        const cat = TASK_CATEGORIES[t.category] ?? TASK_CATEGORIES.other;
        const full = !!t.slots && t.joined_count >= t.slots && t.my_status !== "joined";
        const joined = t.my_status === "joined";
        const done = t.my_status === "completed";
        return (
          <View key={t.id} style={s.card}>
            <View style={s.rowBetween}>
              <View style={[s.catPill, { backgroundColor: cat.color + "1A" }]}>
                <Ionicons name={cat.icon as any} size={13} color={cat.color} />
                <Text style={[s.catText, { color: cat.color }]}>{cat.label}</Text>
              </View>
              <View style={s.pointsPill}>
                <Ionicons name="star" size={12} color="#946B00" />
                <Text style={s.pointsText}>{t.points} نقطة</Text>
              </View>
            </View>
            <Text style={s.taskTitle}>{t.title}</Text>
            {t.description ? <Text style={s.body} numberOfLines={4}>{t.description}</Text> : null}
            <View style={s.meta}>
              {t.location ? <Meta icon="location-outline" text={t.location} /> : null}
              {t.starts_at ? <Meta icon="calendar-outline" text={fmtDate(t.starts_at)} /> : null}
              {t.organizer ? <Meta icon="business-outline" text={t.organizer} /> : null}
              <Meta icon="people-outline" text={t.slots ? `${t.joined_count} من ${t.slots}` : `${t.joined_count} متطوع`} />
            </View>
            {done ? (
              <View style={[s.stateBox, { backgroundColor: Colors.primarySoft }]}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                <Text style={[s.stateText, { color: Colors.primary }]}>أنجزتها — أُضيفت نقاطك</Text>
              </View>
            ) : t.status !== "open" ? (
              <View style={s.stateBox}><Text style={s.stateText}>التسجيل مغلق</Text></View>
            ) : (
              <TouchableOpacity
                style={[joined ? s.ghostBtn : s.primaryBtn, full && { opacity: 0.5 }]}
                disabled={busy === t.id || full}
                onPress={() => onToggle(t)}
              >
                {busy === t.id ? <ActivityIndicator color={joined ? Colors.primary : Colors.onColor} /> : (
                  <Text style={joined ? s.ghostBtnText : s.primaryBtnText}>{full ? "اكتمل العدد" : joined ? "مسجّل ✓ — انسحاب" : "تطوّع الآن"}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.metaItem}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} />
      <Text style={s.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function MeTab({ me }: { me: VolunteerMe }) {
  return (
    <>
      <View style={s.statsRow}>
        <Stat n={me.points} label="نقطة" />
        <Stat n={me.tasks} label="مهمة منجزة" />
        <Stat n={me.hours} label="ساعة تطوع" />
      </View>
      <Text style={s.section}>مهامي</Text>
      {me.myTasks.length ? me.myTasks.map((t, i) => (
        <View key={i} style={s.listRow}>
          <Text style={[s.listTitle, { flex: 1 }]} numberOfLines={1}>{t.title}</Text>
          <Text style={[s.badge, t.status === "completed" ? s.badgeOk : t.status === "rejected" ? s.badgeBad : null]}>
            {t.status === "completed" ? `+${t.points_awarded}` : t.status === "rejected" ? "لم يُعتمد" : "مسجّل"}
          </Text>
        </View>
      )) : <Text style={s.muted}>لم تشارك في مهام بعد.</Text>}
      <Text style={s.section}>سجل النقاط</Text>
      {me.history.length ? me.history.map((h, i) => (
        <View key={i} style={s.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.listTitle} numberOfLines={1}>{h.reason}</Text>
            <Text style={s.muted}>{fmtDate(h.created_at)}</Text>
          </View>
          <Text style={[s.badge, h.points >= 0 ? s.badgeOk : s.badgeBad]}>{h.points > 0 ? `+${h.points}` : h.points}</Text>
        </View>
      )) : <Text style={s.muted}>لا توجد نقاط بعد.</Text>}
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

function CardTab({ me, name, token, onChanged }: { me: VolunteerMe; name: string; token?: string | null; onChanged: () => void }) {
  const ref = useRef<View>(null);
  const [ref2, setRef2] = useState("");
  const [sending, setSending] = useState(false);
  const c = me.card;
  const cfg = me.cardConfig;
  const active = c?.status === "active";
  const expired = c?.status === "expired";
  const pending = c?.status === "pending";
  const daysLeft = c?.expires_at ? Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400_000) : 0;
  const canRenew = (active && daysLeft <= 30) || expired;
  const canRequest = !c || c.status === "rejected";

  const request = async () => {
    if (me.tasks < 1) { notify("بطاقة المتطوع", "أكمل مهمة تطوعية واحدة على الأقل لتحصل على البطاقة."); return; }
    if (cfg.feeRequired && !ref2.trim()) { notify("رقم الإيصال", "أدخل رقم إيصال الدفع أو مرجع التحويل."); return; }
    setSending(true);
    try {
      const r = await volunteerApi.requestCard(token, ref2.trim() || undefined);
      notify(r.card.status === "active" ? "بطاقتك جاهزة 🎖️" : "وصل طلبك", r.card.status === "active" ? "يمكنك تحميلها ومشاركتها الآن." : "ستُفعَّل البطاقة بعد تأكيد الدفع من الإدارة.");
      setRef2("");
      onChanged();
    } catch (e: any) {
      notify("تعذّر الطلب", e?.message);
    } finally {
      setSending(false);
    }
  };

  const download = async () => {
    try {
      await shareViewAsImage(ref, {
        fileName: `volunteer-card-${c?.card_no}.png`, width: 1012, height: 638,
        caption: `أنا ${me.level.name} في «حصاحيصاوي» 🤝 ${me.points} نقطة تطوعية.\n${HASHTAGS} #تطوع\n\n${APP_INVITE}`,
        dialogTitle: "بطاقة المتطوع",
      });
    } catch { notify("تعذّر حفظ البطاقة", "حاول مرة أخرى."); }
  };

  return (
    <>
      <View style={{ alignItems: "center" }}>
        <VolunteerCard
          ref={ref}
          name={name}
          cardNo={c?.card_no ?? "HSV-••-••••••"}
          levelName={me.level.name}
          tier={me.level.tier}
          points={me.points}
          hours={me.hours}
          issuedAt={c?.issued_at}
          expiresAt={c?.expires_at}
          expired={expired}
        />
        {!active && !expired && (
          <Text style={[s.muted, { marginTop: 8, textAlign: "center" }]}>معاينة — تُصدر البطاقة برقم وتاريخ بعد الطلب</Text>
        )}
      </View>

      {active && (
        <>
          <View style={[s.stateBox, { backgroundColor: Colors.primarySoft }]}>
            <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
            <Text style={[s.stateText, { color: Colors.primary }]}>سارية · باقي {daysLeft} يوماً</Text>
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={download}>
            <Ionicons name="download-outline" size={18} color={Colors.onColor} />
            <Text style={s.primaryBtnText}>تحميل ومشاركة البطاقة</Text>
          </TouchableOpacity>
        </>
      )}
      {pending && (
        <View style={[s.stateBox, { backgroundColor: Colors.accentSoft }]}>
          <Ionicons name="time-outline" size={18} color="#946B00" />
          <Text style={[s.stateText, { color: "#946B00" }]}>
            {c?.kind === "renew" ? "طلب التجديد" : "طلبك"} قيد المراجعة · مرجع الدفع: {c?.payment_ref}
          </Text>
        </View>
      )}
      {c?.status === "rejected" && c.review_note ? <Text style={s.error}>لم يُعتمد الطلب: {c.review_note}</Text> : null}

      {(canRequest || canRenew) && !pending && (
        <View style={s.card}>
          <Text style={s.taskTitle}>{canRenew ? "تجديد البطاقة" : "احصل على بطاقتك"}</Text>
          <Text style={s.body}>
            صلاحية البطاقة {cfg.months} شهراً{canRenew ? "، والتجديد يُضاف إلى ما تبقّى من صلاحيتها" : ""}.
            {cfg.feeRequired ? ` الرسوم: ${cfg.price} ${cfg.currency}.` : " البطاقة مجانية حالياً."}
          </Text>
          {cfg.feeRequired && (
            <>
              {cfg.paymentInfo ? <View style={s.payBox}><Text style={s.body}>{cfg.paymentInfo}</Text></View> : null}
              <TextInput
                style={s.input}
                value={ref2}
                onChangeText={setRef2}
                placeholder="رقم إيصال الدفع / مرجع التحويل"
                placeholderTextColor={Colors.textMuted}
                textAlign="right"
                maxLength={120}
              />
            </>
          )}
          <TouchableOpacity style={[s.primaryBtn, sending && { opacity: 0.6 }]} onPress={request} disabled={sending}>
            {sending ? <ActivityIndicator color={Colors.onColor} /> : (
              <Text style={s.primaryBtnText}>{canRenew ? "جدّد البطاقة" : cfg.feeRequired ? "أرسل الطلب" : "أصدر بطاقتي"}</Text>
            )}
          </TouchableOpacity>
          {me.tasks < 1 && <Text style={s.muted}>تحتاج إنجاز مهمة تطوعية واحدة على الأقل.</Text>}
        </View>
      )}
    </>
  );
}

function TopTab({ rows, myId }: { rows: Awaited<ReturnType<typeof volunteerApi.leaderboard>>; myId: number | null }) {
  if (!rows.length) return <View style={s.empty}><Ionicons name="trophy-outline" size={52} color={Colors.textMuted} /><Text style={s.emptyText}>كن أول المتصدرين!</Text></View>;
  return (
    <>
      {rows.map((r, i) => (
        <TouchableOpacity
          key={r.id}
          style={[s.listRow, myId === r.id && { borderColor: Colors.primary, borderWidth: 1.5 }]}
          onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(r.id) } })}
        >
          <Text style={[s.rank, i < 3 && { color: ["#B8892B", "#8FA0B3", "#A0643C"][i] }]}>{i + 1}</Text>
          <UserAvatar name={r.name} avatarUrl={r.avatar_url} size={40} borderRadius={13} />
          <View style={{ flex: 1 }}>
            <Text style={s.listTitle} numberOfLines={1}>{r.name}</Text>
            <Text style={s.muted}>{r.level.name}</Text>
          </View>
          <Text style={[s.badge, s.badgeOk]}>{r.points}</Text>
        </TouchableOpacity>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  levelBar: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  tierDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  levelName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.bg, marginVertical: 6, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  levelNext: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  tabs: { flexDirection: "row-reverse", marginHorizontal: 16, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  tab: { flex: 1, height: 40, borderRadius: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 },
  tabOn: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  catPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  catText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  pointsPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: Colors.accentSoft },
  pointsText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#946B00" },
  taskTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24 },
  meta: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  metaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 4, maxWidth: "100%" },
  metaText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  primaryBtn: { height: 48, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  primaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.onColor },
  ghostBtn: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  ghostBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.primary },
  stateBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.bg },
  stateText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  statsRow: { flexDirection: "row-reverse", gap: 10 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.primary },
  statL: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right", marginTop: 6 },
  listRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  listTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  badge: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: Colors.bg, overflow: "hidden" },
  badgeOk: { color: Colors.primary, backgroundColor: Colors.primarySoft },
  badgeBad: { color: Colors.danger, backgroundColor: Colors.dangerSoft },
  rank: { width: 24, fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textMuted, textAlign: "center" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "right" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 50 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 24, paddingHorizontal: 20 },
  payBox: { padding: 12, borderRadius: 12, backgroundColor: Colors.accentSoft },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
});

