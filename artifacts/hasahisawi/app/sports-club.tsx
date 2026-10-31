import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking,
  Platform, Share, Modal, Pressable, TextInput, KeyboardAvoidingView, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import ClubFormModal from "@/components/sports/ClubFormModal";
import { ClubLogo, FormDots } from "@/components/sports/ClubsHub";
import { clubsApi, SPORT_META, type ClubDetail, type JoinRequest } from "@/lib/sports-clubs-api";

type Tab = "about" | "squad" | "matches" | "news";

function notify(title: string, msg?: string) {
  if (Platform.OS === "web") { (globalThis as any).alert?.(msg ? `${title}\n${msg}` : title); return; }
  Alert.alert(title, msg);
}

function waNumber(p?: string | null) {
  if (!p) return null;
  const d = p.replace(/[^\d]/g, "");
  if (d.startsWith("249")) return d;
  if (d.startsWith("0")) return "249" + d.slice(1);
  return d.length >= 9 ? "249" + d : null;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }); } catch { return ""; }
}

export default function SportsClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [data, setData] = useState<ClubDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [edit, setEdit] = useState(false);
  const [join, setJoin] = useState(false);
  const [reqs, setReqs] = useState<JoinRequest[] | null>(null);
  const [jf, setJf] = useState({ name: "", phone: "", age: "", position: "", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await clubsApi.get(String(id), token)); }
    catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  if (error) return (
    <View style={[st.center, { paddingTop: insets.top }]}>
      <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
      <Text style={st.muted}>{error}</Text>
      <TouchableOpacity onPress={() => router.back()} style={st.ghost}><Text style={st.ghostTxt}>رجوع</Text></TouchableOpacity>
    </View>
  );
  if (!data) return <View style={st.center}><ActivityIndicator color={Colors.primary} /></View>;

  const { club, players, matches, posts, stats } = data;
  const m = SPORT_META[club.sport] || SPORT_META.other;
  const accent = club.primary_color || m.color;
  const wa = waNumber(club.whatsapp || club.phone);
  const pts = stats.won * 3 + stats.drawn;

  const follow = async () => {
    if (!token) return router.push("/login" as any);
    const prev = data;
    setData({ ...data, club: { ...club, is_following: !club.is_following, followers: club.followers + (club.is_following ? -1 : 1) } });
    try { const r = await clubsApi.follow(token, club.id); setData((d) => d && ({ ...d, club: { ...d.club, is_following: r.following, followers: r.followers } })); }
    catch (e: any) { setData(prev); notify("تعذّرت المتابعة", e?.message); }
  };

  const share = () => {
    const msg = `${club.name} — ${m.label}${club.district ? ` · ${club.district}` : ""}\nتابع النادي على تطبيق حصاحيصاوي:\nhttps://play.google.com/store/apps/details?id=com.almhbob.hasahisawi`;
    Share.share({ message: msg }).catch(() => {});
  };

  const sendJoin = async () => {
    if (!token) return router.push("/login" as any);
    setBusy(true);
    try { const r = await clubsApi.join(token, club.id, { ...jf, name: jf.name || user?.name || "" }); setJoin(false); notify("تم", r.message); }
    catch (e: any) { notify("تعذّر الإرسال", e?.message); }
    finally { setBusy(false); }
  };

  const openRequests = async () => {
    try { const r = await clubsApi.requests(token, club.id); setReqs(r.requests); }
    catch (e: any) { notify("تعذّر التحميل", e?.message); }
  };
  const decide = async (rid: number, status: "accepted" | "rejected") => {
    try { await clubsApi.decide(token, club.id, rid, status); setReqs((r) => r?.map((x) => x.id === rid ? { ...x, status } : x) ?? null); load(); }
    catch (e: any) { notify("تعذّر التحديث", e?.message); }
  };
  const moderate = async (body: any, okMsg: string) => {
    try { await clubsApi.update(token, club.id, body); notify(okMsg); load(); }
    catch (e: any) { notify("تعذّر التنفيذ", e?.message); }
  };
  const remove = () => {
    const go = async () => { try { await clubsApi.remove(token, club.id); router.back(); } catch (e: any) { notify("تعذّر الحذف", e?.message); } };
    if (Platform.OS === "web") { if ((globalThis as any).confirm?.("حذف النادي نهائياً؟")) go(); return; }
    Alert.alert("حذف النادي", "سيُحذف النادي ومتابعوه وطلبات الانضمام نهائياً.", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: go }]);
  };

  const InfoRow = ({ icon, label, value, onPress }: { icon: any; label: string; value?: string | null; onPress?: () => void }) => !value ? null : (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={st.infoRow}>
      <View style={[st.infoIcon, { backgroundColor: accent + "14" }]}><Ionicons name={icon} size={16} color={accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={st.infoLabel}>{label}</Text>
        <Text style={[st.infoVal, onPress && { color: accent }]}>{value}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Cover */}
        <View style={[st.cover, { backgroundColor: accent, paddingTop: insets.top + 8 }]}>
          {club.cover_url ? <Image source={{ uri: club.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.28)" }]} />
          <View style={st.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={st.roundBtn} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <TouchableOpacity onPress={share} style={st.roundBtn} accessibilityLabel="مشاركة"><Ionicons name="share-social-outline" size={19} color="#fff" /></TouchableOpacity>
              {data.can_manage ? <TouchableOpacity onPress={() => setEdit(true)} style={st.roundBtn} accessibilityLabel="تعديل"><Ionicons name="create-outline" size={19} color="#fff" /></TouchableOpacity> : null}
            </View>
          </View>
        </View>

        {/* Identity */}
        <View style={st.identity}>
          <View style={st.logoRing}><ClubLogo club={club} size={84} /></View>
          <View style={st.nameRow}>
            <Text style={st.name}>{club.name}</Text>
            {club.verified ? <Ionicons name="checkmark-circle" size={20} color="#2186C2" /> : null}
          </View>
          <Text style={st.sub}>{m.label}{club.league ? ` · ${club.league}` : ""}{club.founded ? ` · تأسس ${club.founded}` : ""}</Text>
          {club.status !== "approved" ? (
            <View style={[st.statusPill, { backgroundColor: club.status === "pending" ? "#FFF4D6" : "#FDE8E8" }]}>
              <Text style={[st.statusTxt, { color: club.status === "pending" ? "#8A6400" : "#B3261E" }]}>
                {club.status === "pending" ? "قيد مراجعة الإدارة — غير ظاهر للعامة بعد" : "لم تتم الموافقة على النادي"}
              </Text>
            </View>
          ) : null}

          {/* Stats strip */}
          <View style={st.stats}>
            <View style={st.stat}><Text style={st.statNum}>{club.followers}</Text><Text style={st.statLbl}>متابع</Text></View>
            <View style={st.stat}><Text style={st.statNum}>{players.length}</Text><Text style={st.statLbl}>لاعب</Text></View>
            <View style={st.stat}><Text style={st.statNum}>{stats.played}</Text><Text style={st.statLbl}>مباراة</Text></View>
            <View style={st.stat}><Text style={st.statNum}>{pts}</Text><Text style={st.statLbl}>نقطة</Text></View>
          </View>

          {/* Actions */}
          {club.status === "approved" ? (
            <View style={st.actions}>
              <TouchableOpacity onPress={follow} style={[st.primaryBtn, { backgroundColor: club.is_following ? Colors.primarySoft : accent }]}>
                <Ionicons name={club.is_following ? "checkmark" : "add"} size={18} color={club.is_following ? Colors.primary : "#fff"} />
                <Text style={[st.primaryTxt, club.is_following && { color: Colors.primary }]}>{club.is_following ? "تتابع النادي" : "تابع النادي"}</Text>
              </TouchableOpacity>
              {club.accepts_members && !data.can_manage ? (
                <TouchableOpacity onPress={() => token ? setJoin(true) : router.push("/login" as any)} style={[st.secondaryBtn, { borderColor: accent }]}>
                  <Ionicons name="person-add-outline" size={17} color={accent} />
                  <Text style={[st.secondaryTxt, { color: accent }]}>انضم</Text>
                </TouchableOpacity>
              ) : null}
              {wa ? (
                <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(`السلام عليكم، تواصلت معكم عبر حصاحيصاوي بخصوص ${club.name}`)}`)} style={st.iconBtn} accessibilityLabel="واتساب">
                  <Ionicons name="logo-whatsapp" size={20} color="#1FA855" />
                </TouchableOpacity>
              ) : null}
              {club.phone ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${club.phone}`)} style={st.iconBtn} accessibilityLabel="اتصال">
                  <Ionicons name="call" size={19} color={accent} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Manager panel */}
          {data.can_manage ? (
            <View style={st.manage}>
              <Text style={st.manageTitle}>إدارة النادي</Text>
              <View style={st.manageRow}>
                <TouchableOpacity onPress={openRequests} style={st.manageBtn}>
                  <Ionicons name="people-outline" size={16} color={Colors.primary} />
                  <Text style={st.manageTxt}>طلبات الانضمام{data.pending_requests ? ` (${data.pending_requests})` : ""}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEdit(true)} style={st.manageBtn}>
                  <Ionicons name="create-outline" size={16} color={Colors.primary} />
                  <Text style={st.manageTxt}>تعديل البيانات</Text>
                </TouchableOpacity>
              </View>
              {data.can_moderate ? (
                <View style={st.manageRow}>
                  {club.status !== "approved" ? (
                    <TouchableOpacity onPress={() => moderate({ status: "approved" }, "تم نشر النادي")} style={[st.manageBtn, { backgroundColor: Colors.primarySoft }]}>
                      <Ionicons name="checkmark-done" size={16} color="#0B7A4E" /><Text style={[st.manageTxt, { color: "#0B7A4E" }]}>موافقة ونشر</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => moderate({ verified: !club.verified }, club.verified ? "أُزيل التوثيق" : "تم توثيق النادي")} style={st.manageBtn}>
                      <Ionicons name="shield-checkmark-outline" size={16} color="#2186C2" /><Text style={[st.manageTxt, { color: "#2186C2" }]}>{club.verified ? "إزالة التوثيق" : "توثيق النادي"}</Text>
                    </TouchableOpacity>
                  )}
                  {club.status === "pending" ? (
                    <TouchableOpacity onPress={() => moderate({ status: "rejected" }, "تم رفض النادي")} style={st.manageBtn}>
                      <Ionicons name="close-circle-outline" size={16} color="#B3261E" /><Text style={[st.manageTxt, { color: "#B3261E" }]}>رفض</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <TouchableOpacity onPress={remove} style={{ alignSelf: "flex-end", marginTop: 6 }}><Text style={st.danger}>حذف النادي</Text></TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={st.tabs}>
          {([["about", "عن النادي"], ["squad", `اللاعبون (${players.length})`], ["matches", "المباريات"], ["news", "الأخبار"]] as [Tab, string][]).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={[st.tab, tab === k && { borderBottomColor: accent }]}>
              <Text style={[st.tabTxt, tab === k && { color: accent }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          {tab === "about" ? (
            <>
              {club.description ? <Text style={st.desc}>{club.description}</Text> : null}
              {stats.played > 0 ? (
                <View style={st.card}>
                  <Text style={st.cardTitle}>الأداء</Text>
                  <View style={st.perf}>
                    {[["فوز", stats.won, "#0E9C64"], ["تعادل", stats.drawn, "#9AA5A0"], ["خسارة", stats.lost, "#D64545"], ["له", stats.goals_for, accent], ["عليه", stats.goals_against, Colors.textSecondary]].map(([l, v, c]) => (
                      <View key={String(l)} style={{ alignItems: "center", flex: 1 }}>
                        <Text style={[st.perfNum, { color: c as string }]}>{v as number}</Text>
                        <Text style={st.statLbl}>{l as string}</Text>
                      </View>
                    ))}
                  </View>
                  {stats.form.length ? <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 10 }}><Text style={st.statLbl}>آخر {stats.form.length} مباريات</Text><FormDots form={stats.form} /></View> : null}
                </View>
              ) : null}
              <View style={st.card}>
                <InfoRow icon="location-outline" label="الموقع" value={[club.district, club.address].filter(Boolean).join(" — ")} />
                <InfoRow icon="football-outline" label="الملعب" value={club.stadium} />
                <InfoRow icon="time-outline" label="مواعيد التدريب" value={club.training_times} />
                <InfoRow icon="person-outline" label="رئيس النادي" value={club.president} />
                <InfoRow icon="clipboard-outline" label="المدرب" value={club.coach} />
                <InfoRow icon="shirt-outline" label="ألوان القميص" value={club.colors} />
                <InfoRow icon="card-outline" label="رسوم العضوية" value={club.accepts_members ? club.membership_fee : null} />
                <InfoRow icon="call-outline" label="الهاتف" value={club.phone} onPress={club.phone ? () => Linking.openURL(`tel:${club.phone}`) : undefined} />
                <InfoRow icon="logo-facebook" label="فيسبوك" value={club.facebook ? "صفحة النادي" : null} onPress={club.facebook ? () => Linking.openURL(club.facebook!) : undefined} />
              </View>
              {club.achievements ? (
                <View style={st.card}>
                  <Text style={st.cardTitle}>الإنجازات</Text>
                  {club.achievements.split(/\n+/).filter(Boolean).map((a, i) => (
                    <View key={i} style={st.achRow}><Ionicons name="trophy" size={15} color="#F0B400" /><Text style={st.achTxt}>{a.trim()}</Text></View>
                  ))}
                </View>
              ) : null}
            </>
          ) : tab === "squad" ? (
            players.length === 0 ? <Text style={st.emptyTxt}>لم تُضف لاعبون لهذا النادي بعد. اللاعبون الذين يُسجَّل ناديهم باسم «{club.name}» يظهرون هنا تلقائياً.</Text> : (
              players.map((p) => (
                <View key={p.id} style={st.playerRow}>
                  {p.photo_url ? <Image source={{ uri: p.photo_url }} style={st.playerImg} /> : <View style={[st.playerImg, { backgroundColor: accent + "18", alignItems: "center", justifyContent: "center" }]}><Ionicons name="person" size={20} color={accent} /></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={st.playerName}>{p.name}</Text>
                    <Text style={st.statLbl}>{p.position || "—"}{p.age ? ` · ${p.age} سنة` : ""}</Text>
                  </View>
                  <View style={{ alignItems: "center" }}><Text style={st.playerStat}>{p.goals ?? 0}</Text><Text style={st.statLbl}>هدف</Text></View>
                  <View style={{ alignItems: "center", marginLeft: 6 }}><Text style={st.playerStat}>{p.matches_played ?? 0}</Text><Text style={st.statLbl}>مباراة</Text></View>
                </View>
              ))
            )
          ) : tab === "matches" ? (
            matches.length === 0 ? <Text style={st.emptyTxt}>لا توجد مباريات مسجّلة لهذا النادي بعد.</Text> : (
              matches.map((x) => {
                const done = x.status === "finished" && x.home_score != null;
                return (
                  <View key={x.id} style={st.matchCard}>
                    <Text style={st.matchMeta}>{fmtDate(x.match_date)} · {x.venue}{x.status === "live" ? " · مباشر الآن" : ""}</Text>
                    <View style={st.matchRow}>
                      <Text style={st.matchTeam} numberOfLines={1}>{x.home_team}</Text>
                      <View style={[st.score, x.status === "live" && { backgroundColor: "#D64545" }]}>
                        <Text style={st.scoreTxt}>{done || x.status === "live" ? `${x.home_score ?? 0} - ${x.away_score ?? 0}` : "VS"}</Text>
                      </View>
                      <Text style={[st.matchTeam, { textAlign: "left" }]} numberOfLines={1}>{x.away_team}</Text>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            posts.length === 0 ? <Text style={st.emptyTxt}>لا توجد أخبار عن النادي بعد.</Text> : posts.map((p) => (
              <View key={p.id} style={st.card}>
                {p.image_url ? <Image source={{ uri: p.image_url }} style={st.postImg} /> : null}
                <Text style={st.cardTitle}>{p.title}</Text>
                <Text style={st.desc} numberOfLines={6}>{p.content}</Text>
                <Text style={st.statLbl}>{fmtDate(p.created_at)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <ClubFormModal visible={edit} initial={club} token={token} userId={user?.id} onClose={() => setEdit(false)} onSaved={() => load()} />

      {/* Join modal */}
      <Modal visible={join} transparent animationType="slide" onRequestClose={() => setJoin(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={st.backdrop} onPress={() => setJoin(false)}>
            <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={st.sheetTitle}>طلب الانضمام إلى {club.name}</Text>
              {([["name", "الاسم", user?.name || ""], ["phone", "رقم الهاتف", "09xxxxxxxx"], ["age", "العمر", ""], ["position", "المركز / النشاط", "مهاجم، حارس، عضو…"], ["note", "رسالة للنادي", "خبرتك السابقة…"]] as const).map(([k, l, ph]) => (
                <View key={k}>
                  <Text style={st.label}>{l}</Text>
                  <TextInput style={[st.input, k === "note" && { minHeight: 70, textAlignVertical: "top" }]} value={(jf as any)[k]} onChangeText={(t) => setJf((p) => ({ ...p, [k]: t }))}
                    placeholder={ph} placeholderTextColor={Colors.textMuted} textAlign="right" multiline={k === "note"}
                    keyboardType={k === "phone" ? "phone-pad" : k === "age" ? "number-pad" : "default"} />
                </View>
              ))}
              <TouchableOpacity disabled={busy} onPress={sendJoin} style={[st.primaryBtn, { backgroundColor: accent, marginTop: 18, flex: 0 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
                <Text style={st.primaryTxt}>إرسال الطلب</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Requests modal */}
      <Modal visible={reqs !== null} transparent animationType="slide" onRequestClose={() => setReqs(null)}>
        <Pressable style={st.backdrop} onPress={() => setReqs(null)}>
          <Pressable style={[st.sheet, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()}>
            <Text style={st.sheetTitle}>طلبات الانضمام</Text>
            <ScrollView>
              {reqs?.length === 0 ? <Text style={st.emptyTxt}>لا توجد طلبات بعد.</Text> : reqs?.map((r) => (
                <View key={r.id} style={st.reqCard}>
                  <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={st.playerName}>{r.name}</Text>
                    <Text style={[st.statLbl, { color: r.status === "pending" ? "#8A6400" : r.status === "accepted" ? "#0B7A4E" : "#B3261E" }]}>
                      {r.status === "pending" ? "جديد" : r.status === "accepted" ? "مقبول" : "مرفوض"}
                    </Text>
                  </View>
                  <Text style={st.statLbl}>{[r.position, r.age ? `${r.age} سنة` : null, r.phone].filter(Boolean).join(" · ")}</Text>
                  {r.note ? <Text style={st.desc}>{r.note}</Text> : null}
                  <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 8 }}>
                    {r.phone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${r.phone}`)} style={st.manageBtn}><Ionicons name="call-outline" size={15} color={Colors.primary} /><Text style={st.manageTxt}>اتصال</Text></TouchableOpacity> : null}
                    {r.status === "pending" ? (
                      <>
                        <TouchableOpacity onPress={() => decide(r.id, "accepted")} style={[st.manageBtn, { backgroundColor: Colors.primarySoft }]}><Text style={[st.manageTxt, { color: "#0B7A4E" }]}>قبول</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => decide(r.id, "rejected")} style={st.manageBtn}><Text style={[st.manageTxt, { color: "#B3261E" }]}>رفض</Text></TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.bg },
  muted: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  ghost: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider },
  ghostTxt: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary },
  cover: { height: 190, paddingHorizontal: 14 },
  topBar: { flexDirection: "row-reverse", justifyContent: "space-between" },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  identity: { alignItems: "center", paddingHorizontal: 16, marginTop: -48 },
  logoRing: { padding: 4, borderRadius: 30, backgroundColor: Colors.cardBg },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 8 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 21, color: Colors.textPrimary, textAlign: "center" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  statusPill: { marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  statusTxt: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  stats: { flexDirection: "row-reverse", alignSelf: "stretch", backgroundColor: Colors.cardBg, borderRadius: 16, paddingVertical: 12, marginTop: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  stat: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  statLbl: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  actions: { flexDirection: "row-reverse", alignSelf: "stretch", gap: 8, marginTop: 12 },
  primaryBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 12 },
  primaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  secondaryBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1.5 },
  secondaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  iconBtn: { width: 46, borderRadius: 14, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  manage: { alignSelf: "stretch", backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.primary + "30" },
  manageTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", marginBottom: 8 },
  manageRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap", marginBottom: 6 },
  manageBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.bg },
  manageTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  danger: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#B3261E" },
  tabs: { flexDirection: "row-reverse", marginTop: 18, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.07)" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 23, color: Colors.textSecondary, textAlign: "right", marginBottom: 10 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", marginBottom: 8 },
  perf: { flexDirection: "row-reverse" },
  perfNum: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  infoVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  achRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  achTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  emptyTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 28, lineHeight: 22 },
  playerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  playerImg: { width: 44, height: 44, borderRadius: 22 },
  playerName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  playerStat: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  matchCard: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  matchMeta: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "center", marginBottom: 6 },
  matchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  matchTeam: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  score: { minWidth: 62, paddingVertical: 4, borderRadius: 10, backgroundColor: Colors.textPrimary, alignItems: "center" },
  scoreTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  postImg: { width: "100%", height: 160, borderRadius: 12, marginBottom: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right", marginBottom: 6 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)" },
  reqCard: { backgroundColor: Colors.bg, borderRadius: 14, padding: 12, marginBottom: 8 },
});
