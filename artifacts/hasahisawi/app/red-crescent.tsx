// مساحة جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { StarPattern } from "@/components/ui/Ornament";
import { notify } from "@/lib/xplatform";
import {
  srcsApi, openMusifOrHelp, ROLE_LABEL, ACTIVITY_TYPES, BLOOD_TYPES, SRCS_RED, SRCS_RED_DEEP,
  type SrcsOverview, type SrcsRole,
} from "@/lib/red-crescent";
import { srcsStyles } from "@/components/srcs/styles";
import RedCrescentMark from "@/components/srcs/RedCrescentMark";

const fmtDate = (s: string, time = false) => new Date(s).toLocaleString("ar-EG", time ? { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" });

export default function RedCrescentScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [data, setData] = useState<SrcsOverview | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setData(await srcsApi.overview(isGuest ? null : token)); }
    catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setRefreshing(false); }
  }, [token, isGuest]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const m = data?.membership;
  const active = m?.status === "active";
  const rsvp = async (id: number, status: "going" | "not_going" | "maybe") => {
    if (!token) return;
    try { await srcsApi.rsvp(token, id, status); load(); } catch (e: any) { notify("تعذّر الحفظ", e?.message); }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>الهلال الأحمر السوداني</Text>
        {data?.isAdmin ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/red-crescent-admin" as any)} accessibilityLabel="لوحة إدارة الفرع">
            <Ionicons name="settings-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={SRCS_RED} />}>
        {/* البطاقة الرئيسية */}
        <LinearGradient colors={[SRCS_RED_DEEP, SRCS_RED]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.hero}>
          <StarPattern color="#FFFFFF" opacity={0.1} />
          <View style={s.heroTop}>
            <View style={s.heroIcon}><RedCrescentMark size={40} background={null} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>جمعية الهلال الأحمر السوداني</Text>
              <Text style={s.heroSub}>فرعية الحصاحيصا · إسعاف · تطوع · إغاثة</Text>
            </View>
          </View>
          {data ? (
            <View style={s.stats}>
              {[["أعضاء", data.stats.members], ["مسعفون", data.stats.paramedics], ["نشاط", data.stats.activities], ["مستفيد", data.stats.beneficiaries]].map(([l, n]) => (
                <View key={String(l)} style={s.stat}><Text style={s.statNum}>{Number(n).toLocaleString("ar-EG")}</Text><Text style={s.statLbl}>{l}</Text></View>
              ))}
            </View>
          ) : <ActivityIndicator color="#fff" style={{ margin: 16 }} />}
        </LinearGradient>

        {/* الطوارئ — تكامل مع «مسعف» */}
        <View style={s.emergency}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
            <View style={[s.emIcon]}><Ionicons name="alert-circle" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.emTitle}>حالة طارئة؟</Text>
              <Text style={s.emSub}>اطلب أقرب مسعف موثّق عبر تطبيق «مسعف»، أو اتصل بأرقام الطوارئ.</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <TouchableOpacity style={s.emBtn} onPress={() => openMusifOrHelp("sos")} accessibilityRole="button">
              <Ionicons name="pulse" size={18} color="#fff" /><Text style={s.emBtnTxt}>نداء استغاثة — مسعف</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.emGhost} onPress={() => router.push("/(tabs)/numbers" as any)} accessibilityRole="button">
              <Ionicons name="call" size={16} color={SRCS_RED} /><Text style={s.emGhostTxt}>أرقام الطوارئ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* العضوية */}
        {data ? (
          <View style={s.card}>
            {!token || isGuest ? (
              <>
                <Text style={s.cardTitle}>انضم إلى فريق الهلال الأحمر</Text>
                <Text style={s.hint}>سجّل الدخول لتقديم طلب الانضمام كمتطوع أو مسعف.</Text>
                <TouchableOpacity style={[s.primary, { flex: 0 }]} onPress={() => router.push("/login" as any)}><Text style={s.primaryTxt}>تسجيل الدخول</Text></TouchableOpacity>
              </>
            ) : !m || m.status === "rejected" ? (
              <>
                <Text style={s.cardTitle}>انضم إلى فريق الهلال الأحمر</Text>
                <Text style={s.hint}>{m?.status === "rejected" ? `لم يُقبل طلبك السابق${m.admin_note ? `: ${m.admin_note}` : ""}. يمكنك التقديم مجدداً.` : "كن متطوعاً أو مسعفاً في فرعية الحصاحيصا، واحصل على بطاقتك الرقمية ونقاط التطوع."}</Text>
                <TouchableOpacity style={[s.primary, { flex: 0 }]} onPress={() => setJoinOpen(true)}><Ionicons name="hand-left" size={18} color="#fff" /><Text style={s.primaryTxt}>طلب الانضمام</Text></TouchableOpacity>
              </>
            ) : m.status === "pending" ? (
              <View style={s.row}>
                <Ionicons name="time" size={22} color={Colors.accent} />
                <View style={{ flex: 1 }}><Text style={s.cardTitle}>طلبك قيد المراجعة</Text><Text style={s.hint}>ستصلك رسالة فور قبولك من إدارة الفرع.</Text></View>
              </View>
            ) : m.status === "suspended" ? (
              <View style={s.row}><Ionicons name="pause-circle" size={22} color={Colors.danger} /><Text style={[s.cardTitle, { flex: 1 }]}>عضويتك موقوفة مؤقتاً — راجع إدارة الفرع</Text></View>
            ) : (
              <>
                <View style={s.row}>
                  <View style={[s.badge, { backgroundColor: SRCS_RED + "18" }]}><Ionicons name="shield-checkmark" size={20} color={SRCS_RED} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>عضويتك: {ROLE_LABEL[m.role]}</Text>
                    <Text style={s.hint}>{m.unit ? `${m.unit} · ` : ""}{m.card_no ? `بطاقة ${m.card_no}` : ""}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <TouchableOpacity style={s.primary} onPress={() => router.push("/red-crescent-card" as any)}><Ionicons name="card" size={18} color="#fff" /><Text style={s.primaryTxt}>بطاقتي</Text></TouchableOpacity>
                  {(m.role === "paramedic" || m.role === "leader") ? (
                    <TouchableOpacity style={s.ghost} onPress={() => openMusifOrHelp("signup", { role: "responder", srcs_card: m.card_no || "" })}>
                      <Ionicons name="pulse" size={16} color={SRCS_RED} /><Text style={s.ghostTxt}>{m.musif_code ? "فتح مسعف" : "سجّل مستجيباً في مسعف"}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* الاجتماعات (للأعضاء) */}
        {active && data?.meetings.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>الاجتماعات القادمة</Text>
            {data.meetings.map((mt) => (
              <View key={mt.id} style={s.meeting}>
                <View style={s.row}>
                  <Ionicons name="calendar" size={18} color={SRCS_RED} />
                  <Text style={[s.itemTitle, { flex: 1 }]}>{mt.title}</Text>
                </View>
                <Text style={s.meta}>{fmtDate(mt.starts_at, true)}{mt.place ? ` · ${mt.place}` : ""}</Text>
                {mt.agenda ? <Text style={s.body}>{mt.agenda}</Text> : null}
                <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                  {([["going", "سأحضر"], ["maybe", "ربما"], ["not_going", "معتذر"]] as const).map(([k, l]) => (
                    <TouchableOpacity key={k} onPress={() => rsvp(mt.id, k)} style={[s.chip, mt.my_rsvp === k && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
                      <Text style={[s.chipTxt, mt.my_rsvp === k && { color: "#fff" }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* الإعلانات */}
        {data?.announcements.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>الإعلانات</Text>
            {data.announcements.map((a) => (
              <View key={a.id} style={s.ann}>
                <View style={s.row}>
                  {a.pinned ? <Ionicons name="pin" size={14} color={Colors.accent} /> : <Ionicons name="megaphone-outline" size={14} color={SRCS_RED} />}
                  <Text style={[s.itemTitle, { flex: 1 }]}>{a.title}</Text>
                  <Text style={s.meta}>{fmtDate(a.created_at)}</Text>
                </View>
                <Text style={s.body}>{a.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* الأنشطة والفعاليات */}
        <Text style={s.section}>الأنشطة والفعاليات</Text>
        {data && !data.activities.length ? <Text style={s.empty}>لم تُوثَّق أنشطة بعد.</Text> : null}
        {data?.activities.map((a) => {
          const t = ACTIVITY_TYPES[a.type] ?? ACTIVITY_TYPES.other;
          return (
            <View key={a.id} style={s.activity}>
              {a.images?.[0] ? <Image source={{ uri: a.images[0] }} style={s.actImg} resizeMode="cover" /> : null}
              <View style={{ padding: 12, gap: 6 }}>
                <View style={s.row}>
                  <View style={s.typePill}><Ionicons name={t.icon as any} size={12} color={SRCS_RED} /><Text style={s.typeTxt}>{t.label}</Text></View>
                  {!a.published ? <Text style={[s.meta, { color: Colors.accent }]}>غير منشور</Text> : null}
                  <Text style={[s.meta, { flex: 1, textAlign: "left" }]}>{fmtDate(a.happened_at)}</Text>
                </View>
                <Text style={s.itemTitle}>{a.title}</Text>
                {a.place ? <Text style={s.meta}><Ionicons name="location-outline" size={12} /> {a.place}</Text> : null}
                {a.description ? <Text style={s.body} numberOfLines={5}>{a.description}</Text> : null}
                <View style={s.row}>
                  {a.beneficiaries ? <Text style={s.metaStrong}>{a.beneficiaries.toLocaleString("ar-EG")} مستفيد</Text> : null}
                  {a.volunteers ? <Text style={s.metaStrong}>{a.volunteers} متطوع</Text> : null}
                  {a.images?.length > 1 ? <Text style={s.meta}>+{a.images.length - 1} صور</Text> : null}
                </View>
              </View>
            </View>
          );
        })}
        {error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>

      <JoinModal visible={joinOpen} onClose={() => setJoinOpen(false)} onDone={() => { setJoinOpen(false); load(); }} />
    </View>
  );
}

function JoinModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const { token, user } = useAuth();
  const [role, setRole] = useState<SrcsRole>("volunteer");
  const [unit, setUnit] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [blood, setBlood] = useState("");
  const [experience, setExperience] = useState("");
  const [certs, setCerts] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await srcsApi.join(token, { desired_role: role, unit, phone, blood_type: blood || null, experience, certifications: certs });
      notify("تم إرسال طلبك", "ستراجعه إدارة الفرع ويصلك إشعار بالنتيجة.");
      onDone();
    } catch (e: any) { notify("تعذّر الإرسال", e?.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalBg}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.cardTitle}>طلب الانضمام</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={s.label}>أرغب في الانضمام بصفة</Text>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              {(["volunteer", "paramedic"] as const).map((r) => (
                <TouchableOpacity key={r} onPress={() => setRole(r)} style={[s.chip, { flex: 1 }, role === r && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
                  <Text style={[s.chipTxt, role === r && { color: "#fff" }]}>{ROLE_LABEL[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>الهاتف</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} placeholderTextColor={Colors.textMuted} placeholder="09xxxxxxxx" />
            <Text style={s.label}>الفريق / الوحدة (اختياري)</Text>
            <TextInput value={unit} onChangeText={setUnit} style={s.input} placeholderTextColor={Colors.textMuted} placeholder="مثال: فريق الاستجابة السريعة" />
            <Text style={s.label}>فصيلة الدم</Text>
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
              {BLOOD_TYPES.map((b) => (
                <TouchableOpacity key={b} onPress={() => setBlood(blood === b ? "" : b)} style={[s.chip, blood === b && { backgroundColor: SRCS_RED, borderColor: SRCS_RED }]}>
                  <Text style={[s.chipTxt, blood === b && { color: "#fff" }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>الخبرة في الإسعاف أو التطوع</Text>
            <TextInput value={experience} onChangeText={setExperience} multiline style={[s.input, { height: 80, textAlignVertical: "top" }]} placeholderTextColor={Colors.textMuted} placeholder="اذكر خبرتك ومشاركاتك السابقة" />
            <Text style={s.label}>الشهادات والدورات</Text>
            <TextInput value={certs} onChangeText={setCerts} multiline style={[s.input, { height: 70, textAlignVertical: "top" }]} placeholderTextColor={Colors.textMuted} placeholder="مثال: إسعافات أولية — الهلال الأحمر 2024" />
            <TouchableOpacity style={[s.primary, { marginTop: 6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>إرسال الطلب</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


const s = StyleSheet.create({
  ...srcsStyles,
  hero: { borderRadius: 22, padding: 16, gap: 14, overflow: "hidden" },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  stats: { flexDirection: "row-reverse", justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 16, paddingVertical: 10 },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statLbl: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.85)" },
  emergency: { padding: 14, borderRadius: 18, backgroundColor: SRCS_RED + "12", borderWidth: 1, borderColor: SRCS_RED + "40", gap: 10 },
  emIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: SRCS_RED, alignItems: "center", justifyContent: "center" },
  emTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  emSub: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: Colors.textSecondary, textAlign: "right" },
  emBtn: { flex: 1.4, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, backgroundColor: SRCS_RED },
  emBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  emGhost: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: SRCS_RED + "66", backgroundColor: Colors.cardBg },
  emGhostTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: SRCS_RED },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  meeting: { padding: 12, borderRadius: 14, backgroundColor: Colors.bg, gap: 6 },
  ann: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border, gap: 4 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right", marginTop: 4 },
  activity: { borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  actImg: { width: "100%", height: 170 },
  typePill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: SRCS_RED + "14" },
  typeTxt: { fontFamily: "Cairo_700Bold", fontSize: 11, color: SRCS_RED },
});
