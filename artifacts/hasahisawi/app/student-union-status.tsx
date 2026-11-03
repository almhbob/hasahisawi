import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { copyText, notify, openExternal, systemShare } from "@/lib/xplatform";

const UC  = "#1F5C8A";
const UC2 = "#9DBBD6";

type SuApplication = {
  id: number; full_name: string; institution: string; major: string; year: string; study_stage?: string | null;
  status: "pending" | "approved" | "rejected"; status_label: string;
  submitted_at: string; reviewed_at?: string | null; note?: string | null;
};
type SuCard = {
  member_no: string; full_name: string; institution: string; major: string; year: string;
  issued_at: string; expires_at: string; valid: boolean; verify_url: string; share_text: string;
};

function fmtDate(s?: string | null) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return s; }
}

// ── بطاقة العضوية الرقمية ───────────────────────────────────────────
function StudentUnionCard({ card }: { card: SuCard }) {
  return (
    <LinearGradient colors={["#0B1224", "#16324F", UC]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cd.card}>
      <View style={cd.ring} />
      <View style={cd.top}>
        <View style={cd.emblem}><Ionicons name="school" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={cd.org}>اتحاد طلاب محلية الحصاحيصا</Text>
          <Text style={cd.orgSub}>بطاقة عضوية رقمية</Text>
        </View>
        <View style={[cd.state, { backgroundColor: card.valid ? "#22C55E" : "#F59E0B" }]}>
          <Text style={cd.stateText}>{card.valid ? "سارية" : "منتهية"}</Text>
        </View>
      </View>

      <View style={cd.body}>
        <View style={cd.qrBox}>
          <QRCode value={card.verify_url} size={92} color="#0B1224" backgroundColor="#FFFFFF" ecl="M" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={cd.name} numberOfLines={2}>{card.full_name}</Text>
          <Text style={cd.line} numberOfLines={1}>{card.institution}</Text>
          <Text style={cd.line} numberOfLines={1}>{card.major}{card.year ? ` — ${card.year}` : ""}</Text>
        </View>
      </View>

      <View style={cd.foot}>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={cd.k}>رقم العضوية</Text>
          <Text style={cd.v}>{card.member_no}</Text>
        </View>
        <View style={{ alignItems: "flex-start" }}>
          <Text style={cd.k}>صالحة حتى</Text>
          <Text style={cd.vSmall}>{fmtDate(card.expires_at)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ── عنصر في الخط الزمني ─────────────────────────────────────────────
function Step({ icon, color, title, sub, done, last, children }: {
  icon: string; color: string; title: string; sub?: string; done: boolean; last?: boolean; children?: React.ReactNode;
}) {
  return (
    <View style={tl.row}>
      <View style={tl.rail}>
        <View style={[tl.dot, { backgroundColor: done ? color : Colors.cardBg, borderColor: done ? color : Colors.borderSubtle }]}>
          <Ionicons name={icon as any} size={14} color={done ? "#fff" : Colors.textMuted} />
        </View>
        {!last && <View style={[tl.line, { backgroundColor: done ? color + "60" : Colors.borderSubtle }]} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
        <Text style={[tl.title, !done && { color: Colors.textMuted }]}>{title}</Text>
        {sub ? <Text style={tl.sub}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export default function StudentUnionStatusScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [app, setApp] = useState<SuApplication | null>(null);
  const [card, setCard] = useState<SuCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || isGuest) { setLoading(false); return; }
    try {
      const r = await fetch(`${getApiUrl()}/api/student-union/me`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "تعذّر تحميل حالة الطلب");
      setApp(d.application ?? null); setCard(d.card ?? null); setError(null);
    } catch (e: any) { setError(e?.message || "تعذّر الاتصال"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, isGuest]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    if (!card) return;
    const ok = await systemShare(card.share_text, card.verify_url);
    if (!ok) {
      const r = await copyText(card.share_text);
      notify(r === "copied" ? "تم النسخ" : "تعذّرت المشاركة", r === "copied" ? "نُسخ نص البطاقة ورابط التحقق" : undefined);
    }
  };
  const copyNo = async () => {
    if (!card) return;
    const r = await copyText(`${card.member_no}\n${card.verify_url}`);
    if (r === "copied") notify("تم النسخ", "نُسخ رقم العضوية ورابط التحقق");
  };

  const decided = app?.status === "approved" || app?.status === "rejected";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>عضويتي في اتحاد الطلاب</Text>
          <Text style={s.headerSub}>حالة الطلب وبطاقة العضوية</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={UC} style={{ marginTop: 60 }} />
        ) : !token || isGuest ? (
          <View style={s.emptyBox}>
            <Ionicons name="person-circle-outline" size={52} color={UC} />
            <Text style={s.emptyTitle}>سجّل الدخول لمتابعة طلبك</Text>
            <Text style={s.emptySub}>حالة طلب العضوية وبطاقتك الرقمية مرتبطتان بحسابك.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => router.push("/login" as any)}>
              <Text style={s.primaryText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        ) : error ? (
          <View style={s.emptyBox}>
            <Ionicons name="cloud-offline-outline" size={46} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>{error}</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.primaryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : !app ? (
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={50} color={UC} />
            <Text style={s.emptyTitle}>لم تقدّم طلب عضوية بعد</Text>
            <Text style={s.emptySub}>انضم لاتحاد طلاب محلية الحصاحيصا واحصل على بطاقة عضوية رقمية.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace("/student-union-join" as any)}>
              <Text style={s.primaryText}>تقديم طلب العضوية</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {card && (
              <Animated.View entering={FadeInDown.springify()} style={{ gap: 10 }}>
                <StudentUnionCard card={card} />
                <View style={s.actions}>
                  <TouchableOpacity style={s.actBtn} onPress={share}>
                    <Ionicons name="share-social-outline" size={18} color={UC} />
                    <Text style={s.actText}>مشاركة</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={copyNo}>
                    <Ionicons name="copy-outline" size={18} color={UC} />
                    <Text style={s.actText}>نسخ الرقم</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={() => openExternal(card.verify_url)}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={UC} />
                    <Text style={s.actText}>صفحة التحقق</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(80).springify()} style={s.box}>
              <View style={s.boxHead}>
                <Text style={s.boxTitle}>مسار الطلب</Text>
                <View style={[s.badge, { backgroundColor: app.status === "approved" ? "#22C55E20" : app.status === "rejected" ? "#EF444420" : "#F59E0B20" }]}>
                  <Text style={[s.badgeText, { color: app.status === "approved" ? "#16A34A" : app.status === "rejected" ? "#DC2626" : "#B45309" }]}>{app.status_label}</Text>
                </View>
              </View>
              <Text style={s.meta}>{app.full_name} · {app.institution} · {app.major}</Text>

              <View style={{ marginTop: 14 }}>
                <Step icon="paper-plane" color={UC} title="تم تقديم الطلب" sub={fmtDate(app.submitted_at)} done />
                <Step icon="time" color="#F59E0B" title="قيد المراجعة لدى إدارة الاتحاد"
                  sub={decided ? "اكتملت المراجعة" : "تُراجع الطلبات عادةً خلال 48 ساعة"} done />
                {app.status === "rejected" ? (
                  <Step icon="close" color="#EF4444" title="لم يُقبل الطلب" sub={fmtDate(app.reviewed_at)} done last>
                    {app.note ? <View style={s.note}><Text style={s.noteLabel}>ملاحظة الإدارة</Text><Text style={s.noteText}>{app.note}</Text></View> : null}
                  </Step>
                ) : (
                  <Step icon="checkmark" color="#22C55E" title={app.status === "approved" ? "تم قبول العضوية" : "القبول وإصدار البطاقة"}
                    sub={app.status === "approved" ? fmtDate(app.reviewed_at) : "بانتظار القرار"} done={app.status === "approved"} last>
                    {app.status === "approved" && app.note ? <View style={s.note}><Text style={s.noteLabel}>رسالة الإدارة</Text><Text style={s.noteText}>{app.note}</Text></View> : null}
                  </Step>
                )}
              </View>
            </Animated.View>

            {app.status === "rejected" && (
              <TouchableOpacity style={s.primaryBtnWide} onPress={() => router.replace({ pathname: "/student-union-join", params: { reapply: "1" } } as any)}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={s.primaryText}>تقديم طلب جديد</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={s.linkRow} onPress={() => router.push("/student-union-contact" as any)}>
              <Ionicons name="chatbubbles-outline" size={20} color={UC} />
              <Text style={s.linkText}>راسل الاتحاد أو تابع ردوده على رسائلك</Text>
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const cd = StyleSheet.create({
  card: { borderRadius: 22, padding: 18, overflow: "hidden", minHeight: 210, ...(Platform.OS === "web" ? {} : { elevation: 6 }) },
  ring: { position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 28, borderColor: "rgba(255,255,255,0.05)", top: -80, left: -70 },
  top: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  emblem: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  org: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "right" },
  orgSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: UC2, textAlign: "right" },
  state: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  stateText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  body: { flexDirection: "row-reverse", alignItems: "center", gap: 14, marginTop: 16 },
  qrBox: { backgroundColor: "#fff", padding: 6, borderRadius: 12 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right", lineHeight: 26 },
  line: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  foot: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  k: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: UC2 },
  v: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", letterSpacing: 0.5 },
  vSmall: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "#fff" },
});

const tl = StyleSheet.create({
  row: { flexDirection: "row-reverse", gap: 12 },
  rail: { alignItems: "center", width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginTop: 2 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", marginTop: 1 },
});

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, textAlign: "center", marginTop: 2 },
  box: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 16 },
  boxHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  boxTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  badge: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  note: { marginTop: 8, backgroundColor: Colors.bg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  noteLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: UC, textAlign: "right" },
  noteText: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.text, textAlign: "right", lineHeight: 22 },
  actions: { flexDirection: "row-reverse", gap: 8 },
  actBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: UC + "14", borderWidth: 1, borderColor: UC + "35" },
  actText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: UC },
  emptyBox: { alignItems: "center", gap: 10, paddingVertical: 50, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  primaryBtn: { marginTop: 8, backgroundColor: UC, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 12 },
  primaryBtnWide: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: UC, borderRadius: 14, paddingVertical: 14 },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  linkRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14 },
  linkText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
});
