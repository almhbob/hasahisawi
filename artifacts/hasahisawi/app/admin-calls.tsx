// تشخيص المكالمات الصوتية (للإدارة): حالة خادم الترحيل (TURN) + نتائج آخر المكالمات
import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

type Outcome = { key: string; label: string; via?: string };
type CallRow = {
  id: number; status: string; created_at: string; answered_at: string | null; ended_at: string | null;
  caller: string; callee: string; outcome: Outcome;
  events: { t: string; role: string; event: string; detail: string }[] | null;
};
type Diag = {
  turn: { cloudflare: boolean; metered: boolean; custom: boolean; relayServers: number };
  stats: { total: number; answered: number; ok: number; failed: number; noaudio: number; mic: number; missed: number; declined: number; viaRelay: number };
  recent: CallRow[];
};

const OUTCOME_COLOR: Record<string, string> = {
  ok: "#16A34A", failed: "#DC2626", noaudio: "#D97706", mic: "#DC2626", missed: "#64748B", declined: "#64748B", ringing: "#0EA5E9", other: "#64748B",
};

const EVENT_LABEL: Record<string, string> = {
  boot: "بدء", connected: "اتصال صوتي", failed: "فشل الشبكة", gathered: "جمع مسارات الشبكة", ice_restart: "إعادة محاولة",
  mic_err: "خطأ الميكروفون", no_media: "لا يوجد ميكروفون", play_err: "خطأ تشغيل الصوت", auth: "انتهت الجلسة",
  offer_err: "خطأ بدء الاتصال", sdp_err: "خطأ تفاوض", signal_err: "خطأ إرسال", ice_add_err: "خطأ مسار",
};

function fmtTime(s: string) {
  const d = new Date(s);
  return `${d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;
}
function duration(c: CallRow) {
  if (!c.answered_at || !c.ended_at) return null;
  const sec = Math.max(0, (new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000);
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export default function AdminCallsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<Diag | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!token) return; // الجلسة لم تُحمَّل بعد
    const my = ++seq.current; // نتجاهل أي رد أقدم من آخر طلب
    setError("");
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/calls/admin/diagnostics`, { headers: { Authorization: `Bearer ${token}` } } as any);
      const j = await res.json().catch(() => ({}));
      if (my !== seq.current) return;
      if (!res.ok) throw new Error(j?.error || `خطأ (${res.status})`);
      setData(j as Diag);
    } catch (e: any) { if (my === seq.current) setError(e?.message || "تعذّر التحميل"); }
    finally { if (my === seq.current) setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const t = data?.turn;
  const relayOk = !!t && t.relayServers > 0;
  const relayConfigured = !!t && (t.cloudflare || t.metered || t.custom);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>تشخيص المكالمات</Text>
        <TouchableOpacity style={s.iconBtn} onPress={() => { setRefreshing(true); load(); }} accessibilityLabel="تحديث">
          <Ionicons name="refresh" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {!data && !error ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      {data ? (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {/* خادم الترحيل */}
          <View style={[s.card, { borderColor: relayOk ? "#16A34A66" : "#DC262666" }]}>
            <View style={s.row}>
              <Ionicons name={relayOk ? "shield-checkmark" : "warning"} size={22} color={relayOk ? "#16A34A" : "#DC2626"} />
              <Text style={s.cardTitle}>خادم الترحيل (TURN): {relayOk ? "يعمل" : relayConfigured ? "مضبوط لكنه لا يستجيب" : "غير مضبوط"}</Text>
            </View>
            <Text style={s.body}>
              {relayOk
                ? `${t!.relayServers} عنوان ترحيل جاهز${t!.cloudflare ? " · Cloudflare" : ""}${t!.metered ? " · Metered" : ""}${t!.custom ? " · خادم خاص" : ""}. المكالمات بين شبكات الجوال المختلفة ستمر عبره عند الحاجة.`
                : relayConfigured
                  ? "المفاتيح موجودة لكن الخادم لم يُرجع عناوين ترحيل — تحقق من صحة المفاتيح وصلاحيتها."
                  : "بدونه تتصل مكالمات كثيرة على بيانات الجوال (زين، MTN، سوداني) دون صوت. أضف في إعدادات خادم الـ API على Vercel: CF_TURN_KEY_ID و CF_TURN_API_TOKEN (من Cloudflare ← Calls ← TURN)."}
            </Text>
            {!relayOk ? (
              <TouchableOpacity style={s.linkBtn} onPress={() => Linking.openURL("https://dash.cloudflare.com/?to=/:account/calls")}>
                <Ionicons name="open-outline" size={15} color={Colors.primary} />
                <Text style={s.linkTxt}>فتح Cloudflare Calls</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* أرقام آخر 30 يوماً */}
          <Text style={s.section}>آخر 30 يوماً</Text>
          <View style={s.stats}>
            {[
              ["إجمالي", data.stats.total, Colors.text],
              ["اتصلت بنجاح", data.stats.ok, "#16A34A"],
              ["فشل الشبكة", data.stats.failed, "#DC2626"],
              ["رُدّ دون صوت", data.stats.noaudio, "#D97706"],
              ["مشكلة ميكروفون", data.stats.mic, "#DC2626"],
              ["عبر الترحيل", data.stats.viaRelay, Colors.primary],
            ].map(([label, n, color]) => (
              <View key={String(label)} style={s.stat}>
                <Text style={[s.statNum, { color: color as string }]}>{n as number}</Text>
                <Text style={s.statLbl}>{label as string}</Text>
              </View>
            ))}
          </View>

          {/* آخر المكالمات */}
          <Text style={s.section}>آخر المكالمات</Text>
          {data.recent.length === 0 ? <Text style={s.empty}>لا توجد مكالمات بعد.</Text> : null}
          {data.recent.map((c) => {
            const color = OUTCOME_COLOR[c.outcome.key] || "#64748B";
            const dur = duration(c);
            const expanded = open === c.id;
            return (
              <TouchableOpacity key={c.id} style={s.call} activeOpacity={0.8} onPress={() => setOpen(expanded ? null : c.id)}>
                <View style={s.row}>
                  <View style={[s.dot, { backgroundColor: color }]} />
                  <Text style={s.callNames} numberOfLines={1}>{c.caller} ← {c.callee}</Text>
                  <Text style={s.callTime}>{fmtTime(c.created_at)}</Text>
                </View>
                <View style={[s.row, { marginTop: 4 }]}>
                  <Text style={[s.outcome, { color }]}>{c.outcome.label}{c.outcome.via ? ` · ${c.outcome.via}` : ""}</Text>
                  {dur ? <Text style={s.callTime}>المدة {dur}</Text> : null}
                </View>
                {expanded && c.events?.length ? (
                  <View style={s.events}>
                    {c.events.map((e, i) => (
                      <Text key={i} style={s.eventTxt} numberOfLines={2}>
                        {new Date(e.t).toLocaleTimeString("ar-EG", { minute: "2-digit", second: "2-digit" })} · {e.role === "caller" ? "المتصل" : e.role === "callee" ? "المستقبِل" : e.role} · {EVENT_LABEL[e.event] || e.event}{e.detail ? ` (${e.detail})` : ""}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.danger, textAlign: "center", marginTop: 30 },
  card: { padding: 14, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1.5, gap: 8 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textSecondary, textAlign: "right" },
  linkBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  linkTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  stats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  stat: { width: "31.5%", paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 20 },
  call: { padding: 12, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  dot: { width: 9, height: 9, borderRadius: 5 },
  callNames: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  callTime: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted },
  outcome: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, textAlign: "right" },
  events: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, gap: 3 },
  eventTxt: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textSecondary, textAlign: "right" },
});
