import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Image, useWindowDimensions, Modal, Pressable,
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

// ── بطاقة العضوية الرسمية ───────────────────────────────────────────
// مقاس بطاقة الهوية (ID-1 ≈ 1.586:1) بألوان شعار الاتحاد (لهب أحمر/برتقالي وذهبي)، مع شعاري الاتحاد وحصاحيصاوي.
const UNION_LOGO = require("@/assets/images/student-union-logo.png");
const APP_LOGO = require("@/assets/images/logo.png");
const FLAME = ["#7F1D1D", "#B91C1C", "#EA580C"] as const;
const GOLD = "#F5C451";

// بطاقة طولية (عمودية) بنسبة بطاقة الهوية ID-1 مقلوبة (1 : 1.586) — تُحمل كبطاقة معلّقة وتُفتح بملء الشاشة
function StudentUnionCard({ card, avatar, width }: { card: SuCard; avatar?: string | null; width: number }) {
  const h = Math.round(width * 1.586);
  const k = width / 300;
  const initials = card.full_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(" ");
  const headH = h * 0.3;
  return (
    <View style={[cd.card, { width, height: h, borderRadius: 20 * k }]}>
      {/* خلفية بيضاء مع ترويسة بلون اللهب */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFBF5" }]} />
      <LinearGradient colors={FLAME} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: headH }} />
      <Image source={UNION_LOGO} style={{ position: "absolute", width: h * 0.62, height: h * 0.62, left: (width - h * 0.62) / 2, top: h * 0.33, opacity: 0.06 }} />
      <View style={{ position: "absolute", top: headH, left: 0, right: 0, height: 3 * k, backgroundColor: GOLD }} />

      {/* فتحة الحزام */}
      <View style={[cd.slot, { top: 10 * k, width: 46 * k, height: 8 * k, borderRadius: 4 * k, left: (width - 46 * k) / 2 }]} />

      {/* الترويسة */}
      <View style={{ height: headH, paddingTop: 24 * k, paddingHorizontal: 12 * k, alignItems: "center" }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 * k }}>
          <Image source={UNION_LOGO} style={{ width: 46 * k, height: 46 * k }} accessibilityLabel="شعار الاتحاد العام للطلاب السودانيين" />
          <View style={{ alignItems: "center" }}>
            <Text style={[cd.org, { fontSize: 12.5 * k }]} numberOfLines={1}>الاتحاد العام للطلاب السودانيين</Text>
            <Text style={[cd.orgSub, { fontSize: 10.5 * k }]} numberOfLines={1}>ولاية الجزيرة · محلية الحصاحيصا</Text>
          </View>
          <View style={[cd.appLogo, { width: 34 * k, height: 34 * k, borderRadius: 9 * k }]}>
            <Image source={APP_LOGO} style={{ width: 28 * k, height: 28 * k }} resizeMode="contain" accessibilityLabel="شعار حصاحيصاوي" />
          </View>
        </View>
        <Text style={[cd.orgEn, { fontSize: 7.5 * k, marginTop: 3 * k }]} numberOfLines={1}>GENERAL STUDENTS' UNION · GAZIRA STATE</Text>
      </View>

      {/* الصورة تتوسط حدّ الترويسة */}
      <View style={{ alignItems: "center", marginTop: -46 * k }}>
        <View style={[cd.photo, { width: 92 * k, height: 108 * k, borderRadius: 14 * k, borderWidth: 3 * k }]}>
          {avatar ? <Image source={{ uri: avatar }} style={{ width: "100%", height: "100%" }} /> : <Text style={[cd.initials, { fontSize: 28 * k }]}>{initials}</Text>}
        </View>
      </View>

      {/* الهوية */}
      <View style={{ alignItems: "center", paddingHorizontal: 14 * k, marginTop: 8 * k }}>
        <Text style={[cd.kind, { fontSize: 9.5 * k }]}>بطاقة عضوية رسمية · MEMBERSHIP CARD</Text>
        <Text style={[cd.name, { fontSize: 18 * k, lineHeight: 28 * k }]} numberOfLines={2}>{card.full_name}</Text>
        <Text style={[cd.line, { fontSize: 12 * k }]} numberOfLines={1}>{card.institution}</Text>
        <Text style={[cd.line, { fontSize: 11.5 * k }]} numberOfLines={1}>{card.major}{card.year ? ` · ${card.year}` : ""}</Text>
      </View>

      {/* رمز التحقق */}
      <View style={{ alignItems: "center", gap: 5 * k, marginTop: 10 * k }}>
        <View style={[cd.qrBox, { padding: 6 * k, borderRadius: 10 * k }]}>
          <QRCode value={card.verify_url} size={Math.round(86 * k)} color="#450A0A" backgroundColor="#FFFFFF" ecl="M" />
        </View>
      </View>

      {/* الأرقام */}
      <View style={[cd.foot, { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14 * k, paddingVertical: 10 * k }]}>
        <LinearGradient colors={FLAME} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[cd.k, { fontSize: 8 * k }]}>رقم العضوية · No.</Text>
          <Text style={[cd.v, { fontSize: 12 * k }]}>{card.member_no}</Text>
        </View>
        <View style={[cd.state, { backgroundColor: card.valid ? "#16A34A" : "#D97706", paddingHorizontal: 8 * k, paddingVertical: 2 * k, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" }]}>
          <Text style={[cd.stateText, { fontSize: 9 * k }]}>{card.valid ? "سارية · VALID" : "منتهية · EXPIRED"}</Text>
        </View>
        <View style={{ alignItems: "flex-start" }}>
          <Text style={[cd.k, { fontSize: 8 * k }]}>صالحة حتى · Valid until</Text>
          <Text style={[cd.vSmall, { fontSize: 11 * k }]}>{fmtDate(card.expires_at)}</Text>
        </View>
      </View>
    </View>
  );
}

/** عرض البطاقة بملء الشاشة (للإبراز عند البوابة أو للمسح) */
function CardFullscreen({ card, avatar, visible, onClose }: { card: SuCard; avatar?: string | null; visible: boolean; onClose: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const w = Math.min(W - 32, (H - insets.top - insets.bottom - 110) / 1.586, 520);
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[cd.full, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]} onPress={onClose} accessibilityLabel="إغلاق العرض بملء الشاشة">
        <StudentUnionCard card={card} avatar={avatar} width={Math.max(220, w)} />
        <View style={cd.fullHint}>
          <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
          <Text style={cd.fullHintT}>اضغط في أي مكان للإغلاق</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

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
  const { token, isGuest, user } = useAuth();
  const { width: winW } = useWindowDimensions();
  const cardW = Math.min(winW - 64, 330);
  const [fullOpen, setFullOpen] = useState(false);
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
      <LinearGradient colors={["#7F1D1D", "#B91C1C"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
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
                <Pressable onPress={() => setFullOpen(true)} accessibilityRole="button" accessibilityLabel="عرض البطاقة بملء الشاشة">
                  <StudentUnionCard card={card} avatar={(user as any)?.avatar_url ?? (user as any)?.avatarUrl ?? null} width={cardW} />
                </Pressable>
                <CardFullscreen card={card} avatar={(user as any)?.avatar_url ?? (user as any)?.avatarUrl ?? null} visible={fullOpen} onClose={() => setFullOpen(false)} />
                <View style={s.actions}>
                  <TouchableOpacity style={s.actBtn} onPress={() => setFullOpen(true)}>
                    <Ionicons name="expand-outline" size={18} color={UC} />
                    <Text style={s.actText}>تكبير</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={share}>
                    <Ionicons name="share-social-outline" size={18} color={UC} />
                    <Text style={s.actText}>مشاركة</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={copyNo}>
                    <Ionicons name="copy-outline" size={18} color={UC} />
                    <Text style={s.actText}>نسخ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actBtn} onPress={() => openExternal(card.verify_url)}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={UC} />
                    <Text style={s.actText}>التحقق</Text>
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
  slot: { position: "absolute", backgroundColor: "rgba(0,0,0,0.28)", zIndex: 2 },
  full: { flex: 1, backgroundColor: "#0B0505", alignItems: "center", justifyContent: "center", gap: 14 },
  fullHint: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  fullHintT: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.8)" },
  card: { overflow: "hidden", alignSelf: "center",
    shadowColor: "#7F1D1D", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  watermark: { position: "absolute", opacity: 0.1 },
  goldStripe: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: GOLD, opacity: 0.85 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  org: { fontFamily: "Cairo_700Bold", color: "#fff", textAlign: "center" },
  orgSub: { fontFamily: "Cairo_600SemiBold", color: GOLD, textAlign: "center" },
  orgEn: { fontFamily: "Cairo_600SemiBold", color: "rgba(255,255,255,0.8)", letterSpacing: 0.6, textAlign: "center" },
  appLogo: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  body: { flexDirection: "row-reverse", alignItems: "center" },
  photo: { borderColor: "#fff", backgroundColor: "#B91C1C", overflow: "hidden", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  initials: { fontFamily: "Cairo_700Bold", color: "#fff" },
  kind: { fontFamily: "Cairo_700Bold", color: "#B45309", textAlign: "center" },
  name: { fontFamily: "Cairo_700Bold", color: "#3B0A0A", textAlign: "center" },
  line: { fontFamily: "Cairo_600SemiBold", color: "#5B3A2E", textAlign: "center" },
  qrBox: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#F1D9B5" },
  state: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  stateText: { fontFamily: "Cairo_700Bold", color: "#fff" },
  foot: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-end" },
  k: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.75)" },
  v: { fontFamily: "Cairo_700Bold", color: "#fff", letterSpacing: 0.8 },
  vSmall: { fontFamily: "Cairo_600SemiBold", color: "#fff" },
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
