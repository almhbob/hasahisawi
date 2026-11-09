// عضوية ديوان الكُتّاب: التعريف بالفئات والمزايا، حالة طلبي، بطاقتي، مؤشر النشاط (30 يوماً)، الأوسمة والجوائز، والتجديد.
import React, { useCallback, useEffect, useState } from "react";
import ShareBar from "@/components/lit/ShareBar";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Share, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { membersApi, REF_KEY, type MembershipMe, type MemberCategory, type Badge, type EditRequest, type PrintMeta, type PrintOrder } from "@/lib/lit-members";
import { EditDataSheet, CardViewer, PrintOrderSheet } from "@/components/lit/MemberTools";
import { WINE, GOLD, INK } from "@/lib/lit";
import MemberCard from "@/components/lit/MemberCard";
import IntlMemberCard from "@/components/lit/IntlMemberCard";
import { flagOf, countryOf } from "@/lib/countries";
import { SectionTitle, ithraaStyles as u } from "@/components/ithraa/ui";


export default function MembershipScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token, isGuest } = useAuth();
  const params = useLocalSearchParams<{ ref?: string }>();
  const signedIn = !!token && !isGuest;
  const [me, setMe] = useState<MembershipMe | null>(null);
  const [meta, setMeta] = useState<{ categories: MemberCategory[]; badges: Badge[]; rules: { inactive_days: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [face, setFace] = useState<"local" | "intl" | null>(null);
  const [viewer, setViewer] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [edit, setEdit] = useState<EditRequest | null>(null);
  const [printMeta, setPrintMeta] = useState<PrintMeta | null>(null);
  const [orders, setOrders] = useState<PrintOrder[]>([]);

  useEffect(() => { if (params.ref) AsyncStorage.setItem(REF_KEY, String(params.ref)).catch(() => {}); }, [params.ref]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, x] = await Promise.all([membersApi.meta().catch(() => null), signedIn ? membersApi.me(token!).catch(() => null) : Promise.resolve(null)]);
      setMeta(m); setMe(x);
      if (x?.member && token) {
        const [e, pm, po] = await Promise.all([
          membersApi.myEdit(token).catch(() => null), membersApi.printMeta().catch(() => null), membersApi.printMine(token).catch(() => null),
        ]);
        setEdit(e?.request ?? null); setPrintMeta(pm); setOrders(po?.orders ?? []);
      }
    } finally { setLoading(false); }
  }, [signedIn, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/writers" as any));
  const m = me?.member;
  const cardW = Math.min(width - 32, 380);
  const apply = () => (signedIn ? router.push("/writers-apply" as any) : notify("سجّل الدخول", "سجّل الدخول لتقديم استمارة العضوية."));
  const renew = async () => { try { const r = await membersApi.renew(token!); notify("تم", r.message); load(); } catch (e: any) { notify("تعذّر", e?.message); } };
  const curFace: "local" | "intl" = face ?? (m?.international ? "intl" : "local");
  const canIntl = !!m && (m.international || !!m.name_en);
  const hasCard = !!m && ["active", "suspended", "expired"].includes(m.status);
  const canPrint = !!m && m.status === "active" && !!printMeta?.enabled;
  const renderCard = (w: number) => (curFace === "intl" && canIntl ? <IntlMemberCard m={m!} width={w} /> : <MemberCard m={m!} badges={me!.badges} width={w} />);
  const cancelOrder = async (id: number) => { try { await membersApi.printCancel(token!, id); load(); } catch (e: any) { notify("تعذّر", e?.message); } };
  const daysToExpiry = m?.valid_until ? Math.ceil((new Date(m.valid_until).getTime() - Date.now()) / 86400000) : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={["#1E0F0C", WINE]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={[u.rowR, { justifyContent: "space-between" }]}>
            <Pressable onPress={back} style={st.iconBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <View style={[u.rowR, { gap: 8 }]}>
              {me?.can_admin && <Pressable onPress={() => router.push("/writers-members-admin" as any)} style={st.pill}><Ionicons name="shield-checkmark" size={14} color={INK} /><Text style={st.pillT}>إدارة العضويات</Text></Pressable>}
              <Pressable onPress={() => router.push("/writers-invite" as any)} style={st.pill}><Ionicons name="paper-plane" size={14} color={INK} /><Text style={st.pillT}>ادعُ للانضمام</Text></Pressable>
            </View>
          </View>
          <Text style={st.kicker}>ديوان الكُتّاب</Text>
          <Text style={st.title}>العضوية</Text>
          <Text style={st.sub}>بطاقة احترافية بحسب فئتك، تتجدد سنوياً، وتبقى فعّالة ما دام قلمك ينشر.</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, marginTop: m ? -6 : 0 }}>
          {loading && <ActivityIndicator color={WINE} style={{ marginTop: 30 }} />}

          {!loading && m && (
            <>
              {/* الوجه الدولي افتراضي للمنتسبين خارج السودان، ومتاح لكل عضو أضاف اسمه بالإنجليزية */}
              {(() => {
                const f = face ?? (m.international ? "intl" : "local");
                const canIntl = m.international || !!m.name_en;
                return (
                  <>
                    {canIntl && (
                      <View style={[st.faceRow]}>
                        {(["local", "intl"] as const).map((x) => (
                          <Pressable key={x} accessibilityRole="button" onPress={() => setFace(x)} style={[st.faceBtn, f === x && { backgroundColor: m.color, borderColor: m.color }]}>
                            <Text style={[st.faceT, f === x && { color: "#fff" }]}>{x === "local" ? "البطاقة المحلية" : `${flagOf(m.country)} البطاقة الدولية`}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    <Pressable onPress={() => hasCard && setViewer(true)} style={{ marginTop: canIntl ? 10 : 18 }} accessibilityRole="imagebutton" accessibilityLabel="تكبير البطاقة">
                      {f === "intl" && canIntl ? <IntlMemberCard m={m} width={cardW} /> : <MemberCard m={m} badges={me!.badges} width={cardW} />}
                    </Pressable>
                    {hasCard ? (
                      <Pressable onPress={() => setViewer(true)} style={st.zoomTag} accessibilityRole="button">
                        <Ionicons name="expand" size={14} color={m.color} /><Text style={[st.zoomT, { color: m.color }]}>تكبير البطاقة وحفظها</Text>
                      </Pressable>
                    ) : null}
                    {m.international && <Text style={st.faceNote}>منتسب دولي · {countryOf(m.country).ar} — بطاقتك ثنائية اللغة وقابلة للتحقق برمز QR من أي دولة.</Text>}
                    {!canIntl && <Text style={st.faceNote}>أضف اسمك بالإنجليزية من «تعديل الاستمارة» لتحصل على الوجه الدولي للبطاقة.</Text>}
                  </>
                );
              })()}

              {m.status === "pending" && <Notice c="#B7791F" i="time" t="استمارتك قيد المراجعة" d="ستراجع الإدارة أعمالك الثلاثة وبياناتك، ويصلك إشعار بالقرار. يُصدر رقم العضوية بعد الاعتماد." />}
              {m.status === "rejected" && <Notice c="#C0392B" i="close-circle" t="لم تُعتمد الاستمارة" d={m.admin_note || "راجع الملاحظات وأعد التقديم."} action="تعديل وإعادة التقديم" onAction={apply} />}
              {m.status === "suspended" && m.suspended_reason === "inactive" && <Notice c="#C2580A" i="pause-circle" t="العضوية معلّقة لتوقف النشر" d={`توقفت عن النشر ${meta?.rules.inactive_days ?? 30} يوماً متصلة. انشر نصاً جديداً — تعود عضويتك فعّالة تلقائياً فور اعتماده.`} action="اكتب نصاً الآن" onAction={() => router.push("/writers-compose" as any)} />}
              {m.status === "suspended" && m.suspended_reason === "admin" && <Notice c="#C0392B" i="alert-circle" t="عُلّقت العضوية من الإدارة" d={m.admin_note || ""} />}
              {m.status === "expired" && <Notice c="#7A8794" i="hourglass" t="انتهت صلاحية العضوية" d={m.renewal_requested_at ? "طلب التجديد قيد المراجعة لدى الإدارة." : "اطلب التجديد لعام جديد."} action={m.renewal_requested_at ? undefined : "طلب التجديد"} onAction={renew} />}

              {m.status === "active" && me!.days_left != null && (
                <View style={[u.card, { marginTop: 14 }]}>
                  <View style={[u.rowR, { justifyContent: "space-between" }]}>
                    <Text style={st.h}>مؤشر النشاط</Text>
                    <Text style={[st.big, { color: me!.days_left <= 7 ? "#C2580A" : "#0E8A5F" }]}>{me!.days_left} يوماً</Text>
                  </View>
                  <View style={st.meter}><View style={[st.meterFill, { width: `${(me!.days_left / 30) * 100}%`, backgroundColor: me!.days_left <= 7 ? "#C2580A" : "#0E8A5F" }]} /></View>
                  <Text style={u.hint}>تبقى عضويتك فعّالة ما دمت تنشر نصاً كل 30 يوماً على الأقل. كل نص يُعتمد يعيد العدّاد إلى 30.</Text>
                </View>
              )}
              {m.status === "active" && daysToExpiry != null && daysToExpiry <= 45 && (
                <Notice c="#2B6CB0" i="refresh-circle" t={`تنتهي العضوية خلال ${daysToExpiry} يوماً`} d={m.renewal_requested_at ? "طلب التجديد قيد المراجعة." : "اطلب التجديد الآن لتستمر بطاقتك دون انقطاع."} action={m.renewal_requested_at ? undefined : "طلب التجديد"} onAction={renew} />
              )}

              {hasCard && (
                <View style={[u.card, { marginTop: 14, gap: 8 }]}>
                  <View style={[u.rowR, { justifyContent: "space-between" }]}>
                    <View style={[u.rowR, { gap: 6 }]}><Ionicons name="person-circle" size={18} color={WINE} /><Text style={st.h}>بياناتي على البطاقة</Text></View>
                    {edit?.status !== "pending" && <Pressable onPress={() => setEditOpen(true)} style={st.linkBtn} accessibilityRole="button"><Ionicons name="create-outline" size={14} color={WINE} /><Text style={st.linkT}>طلب تعديل</Text></Pressable>}
                  </View>
                  {edit?.status === "pending" && <Text style={[u.hint, { color: "#B7791F" }]}>⏳ طلب التعديل قيد مراجعة الإدارة — أُرسل {new Date(edit.created_at).toLocaleDateString("ar-EG")}</Text>}
                  {edit?.status === "rejected" && <Text style={[u.hint, { color: "#C0392B" }]}>لم يُعتمد آخر طلب تعديل: {edit.admin_note}</Text>}
                  {edit?.status === "applied" && <Text style={[u.hint, { color: "#0E8A5F" }]}>✓ اعتُمد آخر تعديل في {new Date(edit.created_at).toLocaleDateString("ar-EG")}</Text>}
                  {!edit && <Text style={u.hint}>غيّر اسمك أو اسمك الأدبي أو هاتفك أو نبذتك — تراجعها الإدارة ثم تظهر على بطاقتك.</Text>}
                </View>
              )}

              {canPrint && (
                <Pressable onPress={() => setPrintOpen(true)} style={st.printCard} accessibilityRole="button">
                  <View style={st.printIcon}><Ionicons name="print" size={22} color="#2E2200" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.printT}>اطلب بطاقتك مطبوعة</Text>
                    <Text style={st.printS}>نسخة ورقية فاخرة تُسلَّم لك · تبدأ من {printMeta!.price_standard.toLocaleString("ar-EG")} {printMeta!.currency}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={18} color="#2E2200" />
                </Pressable>
              )}
              {orders.length > 0 && (
                <View style={[u.card, { marginTop: 10, gap: 8 }]}>
                  <Text style={st.h}>طلبات الطباعة</Text>
                  {orders.map((o) => (
                    <View key={o.id} style={st.orderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.orderT}>{o.qty.toLocaleString("ar-EG")} × {o.size_label}</Text>
                        <Text style={u.hint}>{o.delivery === "delivery" ? "توصيل" : "استلام شخصي"} · {o.total.toLocaleString("ar-EG")} {o.currency}{o.admin_note ? ` · ${o.admin_note}` : ""}</Text>
                      </View>
                      <View style={{ alignItems: "flex-start", gap: 4 }}>
                        <Text style={[st.orderSt, { color: o.status === "cancelled" ? "#7A8794" : o.status === "ready" || o.status === "delivered" ? "#0E8A5F" : "#B7791F" }]}>{o.status_label}</Text>
                        {o.status === "pending" && <Pressable onPress={() => cancelOrder(o.id)}><Text style={[st.linkT, { color: "#C0392B" }]}>إلغاء</Text></Pressable>}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={[u.rowR, { gap: 8, marginTop: 14 }]}>
                <Stat n={me!.stats.texts} l="نص منشور" /><Stat n={me!.stats.likes} l="إعجاب" /><Stat n={me!.badges.length + me!.awards.length} l="وساماً" />
              </View>
              <ShareBar url={`https://almhbob.github.io/hasahisawi/writers?author=${m.user_id}`} text={`${m.pen_name || m.full_name} — ${m.category_title} في ديوان الكُتّاب على حصاحيصاوي. اقرأ نصوصي:`} title="شارك ملفك ونصوصك على مواقع التواصل" />
              {!!m.card_url && <ShareBar url={m.card_url} text={`بطاقة عضويتي في ديوان الكُتّاب — ${m.category_title} · ${m.member_no}`} title="شارك بطاقة العضوية (رابط تحقق)" />}
              {!!m.card_url && (
                <Pressable onPress={() => Share.share({ message: `بطاقة عضويتي في ديوان الكُتّاب — ${m.category_title}\n${m.member_no}\nتحقق: ${m.card_url}` }).catch(() => {})} style={[u.primaryBtn, { backgroundColor: m.color, marginTop: 12 }]}>
                  <Ionicons name="share-social" size={18} color="#fff" /><Text style={u.primaryText}>مشاركة البطاقة</Text>
                </Pressable>
              )}

              {me!.awards.length > 0 && (
                <>
                  <SectionTitle title="الجوائز والتكريمات" />
                  {me!.awards.map((a) => (
                    <View key={a.id} style={[st.award, { borderColor: a.color + "55" }]}>
                      <View style={[st.awardIcon, { backgroundColor: a.color }]}><Ionicons name={a.icon as any} size={20} color="#fff" /></View>
                      <View style={{ flex: 1 }}><Text style={st.awardT}>{a.title}</Text>{!!a.description && <Text style={u.hint}>{a.description}</Text>}</View>
                    </View>
                  ))}
                </>
              )}
              <BadgesGrid all={meta?.badges ?? []} earned={me!.badges.map((b) => b.key)} />
            </>
          )}

          {!loading && !m && (
            <>
              <SectionTitle title="فئات العضوية" />
              <View style={u.wrap}>
                {(meta?.categories ?? []).map((c) => (
                  <View key={c.key} style={[st.cat, { backgroundColor: c.color }]}>
                    <View style={[st.catBand, { backgroundColor: c.accent }]} />
                    <Ionicons name={c.icon as any} size={22} color={c.accent} />
                    <Text style={st.catT}>{c.label}</Text>
                    <Text style={st.catS}>{c.key === "journalist" ? "عضوية خاصة للإعلاميين" : `${c.members ?? 0} عضواً`}</Text>
                  </View>
                ))}
              </View>
              <SectionTitle title="كيف تنضم؟" />
              <View style={[u.card, { gap: 12 }]}>
                {[
                  ["document-text", "املأ الاستمارة", "بياناتك، فئتك، ونبذة عن تجربتك الأدبية أو الإعلامية."],
                  ["albums", "أرفق ثلاثة أعمال", "من نصوصك الموثّقة في الديوان أو أعمال منشورة، مع تعهّد بأنها لك."],
                  ["shield-checkmark", "اعتماد الإدارة", "تُراجع الأعمال ويُصدر رقم العضوية وبطاقتك لعام كامل."],
                  ["flame", "ابقَ فاعلاً", `انشر نصاً كل ${meta?.rules.inactive_days ?? 30} يوماً على الأقل، وإلا عُلّقت العضوية تلقائياً حتى تعود للنشر.`],
                  ["refresh-circle", "التجديد السنوي", "اطلب التجديد قبل الانتهاء لتستمر بطاقتك وأوسمتك."],
                ].map(([i, t, d], k) => (
                  <View key={k} style={[u.rowR, { gap: 10, alignItems: "flex-start" }]}>
                    <View style={st.stepI}><Ionicons name={i as any} size={17} color={WINE} /></View>
                    <View style={{ flex: 1 }}><Text style={st.stepT}>{t}</Text><Text style={u.hint}>{d}</Text></View>
                  </View>
                ))}
              </View>
              <SectionTitle title="مزايا العضوية" />
              <View style={[u.card, { gap: 6 }]}>
                {["بطاقة عضوية رقمية بتصميم فئتك ورمز تحقق علني", "أوسمة تلقائية بحسب عطائك وجوائز تمنحها الإدارة", "أولوية الترشيح لمختارات الديوان والأمسيات", "عضوية صحفية خاصة تُدرج في دليل الإعلاميين", "توثيق كل نصوصك وحماية حقك في أسبقيتها"].map((x, i) => (
                  <View key={i} style={[u.rowR, { gap: 8 }]}><Ionicons name="checkmark-circle" size={17} color="#0E8A5F" /><Text style={st.benefit}>{x}</Text></View>
                ))}
              </View>
              <Pressable onPress={apply} style={[u.primaryBtn, { backgroundColor: WINE, marginTop: 18 }]}><Ionicons name="id-card" size={18} color="#fff" /><Text style={u.primaryText}>املأ استمارة العضوية</Text></Pressable>
              <BadgesGrid all={meta?.badges ?? []} earned={[]} />
            </>
          )}
        </View>
      </ScrollView>
      {m && hasCard && (
        <>
          <CardViewer visible={viewer} onClose={() => setViewer(false)} render={renderCard} name={m.member_no || "member"}
            onPrint={canPrint ? () => { setViewer(false); setPrintOpen(true); } : undefined} />
          <EditDataSheet visible={editOpen} onClose={() => setEditOpen(false)} member={m} mode="request" token={token!} onDone={load} />
          {printMeta && <PrintOrderSheet visible={printOpen} onClose={() => setPrintOpen(false)} token={token!} member={m} meta={printMeta} face={curFace} onDone={load} />}
        </>
      )}
    </View>
  );
}

function Notice({ c, i, t, d, action, onAction }: { c: string; i: string; t: string; d: string; action?: string; onAction?: () => void }) {
  return (
    <View style={[st.notice, { borderColor: c + "55", backgroundColor: c + "0F" }]}>
      <View style={[u.rowR, { gap: 8 }]}><Ionicons name={i as any} size={20} color={c} /><Text style={[st.h, { color: c }]}>{t}</Text></View>
      {!!d && <Text style={[u.hint, { color: Colors.textSecondary }]}>{d}</Text>}
      {!!action && <Pressable onPress={onAction} style={[st.nBtn, { backgroundColor: c }]}><Text style={st.nBtnT}>{action}</Text></Pressable>}
    </View>
  );
}
function Stat({ n, l }: { n: number; l: string }) {
  return <View style={st.stat}><Text style={st.statN}>{n}</Text><Text style={u.hint}>{l}</Text></View>;
}
function BadgesGrid({ all, earned }: { all: Badge[]; earned: string[] }) {
  if (!all.length) return null;
  return (
    <>
      <SectionTitle title={earned.length ? `أوسمتي (${earned.length} من ${all.length})` : "أوسمة الديوان"} />
      <View style={u.wrap}>
        {all.map((b) => {
          const on = earned.includes(b.key);
          return (
            <View key={b.key} style={[st.badge, !on && earned.length > 0 && { opacity: 0.4 }]}>
              <View style={[st.badgeI, { backgroundColor: on || !earned.length ? b.color : Colors.divider }]}><Ionicons name={b.icon as any} size={20} color="#fff" /></View>
              <Text style={st.badgeT} numberOfLines={1}>{b.label}</Text>
              <Text style={st.badgeD} numberOfLines={2}>{b.desc}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

const st = StyleSheet.create({
  zoomTag: { flexDirection: "row-reverse", alignItems: "center", alignSelf: "center", gap: 5, marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  zoomT: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  linkBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: WINE + "12" },
  linkT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: WINE },
  printCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: GOLD + "26", borderWidth: 1, borderColor: GOLD + "70" },
  printIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  printT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: INK, textAlign: "right" },
  printS: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#5C4600", textAlign: "right" },
  orderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.divider },
  orderT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  orderSt: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  faceRow: { flexDirection: "row-reverse", gap: 8, marginTop: 18, justifyContent: "center" },
  faceBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  faceT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  faceNote: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "center", marginTop: 10, lineHeight: 20 },
  hero: { paddingHorizontal: 16, paddingBottom: 26, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GOLD, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: INK },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: GOLD, textAlign: "right", marginTop: 12 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 28, color: "#fff", textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right", lineHeight: 22 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  big: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  meter: { height: 8, borderRadius: 4, backgroundColor: Colors.divider, overflow: "hidden", marginVertical: 8, transform: [{ scaleX: -1 }] },
  meterFill: { height: 8, borderRadius: 4 },
  notice: { marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  nBtn: { alignSelf: "flex-end", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, marginTop: 2 },
  nBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  stat: { flex: 1, alignItems: "center", backgroundColor: Colors.cardBg, borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.divider },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: WINE },
  award: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: Colors.cardBg, marginBottom: 8 },
  awardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  awardT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  cat: { width: "31%", flexGrow: 1, minWidth: 100, borderRadius: 16, padding: 12, gap: 4, alignItems: "flex-end", overflow: "hidden" },
  catBand: { position: "absolute", top: 0, right: 0, bottom: 0, width: 4 },
  catT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff", textAlign: "right" },
  catS: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)", textAlign: "right" },
  stepI: { width: 32, height: 32, borderRadius: 10, backgroundColor: WINE + "12", alignItems: "center", justifyContent: "center" },
  stepT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  benefit: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  badge: { width: "31%", flexGrow: 1, minWidth: 96, alignItems: "center", gap: 3, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: Colors.divider },
  badgeI: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  badgeT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary, textAlign: "center" },
  badgeD: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center", lineHeight: 15 },
});
