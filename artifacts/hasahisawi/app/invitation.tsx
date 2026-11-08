// ✉️ شاشة الدعوة للانضمام إلى قسم (‎/invitation?t=…) — عامة بلا تسجيل دخول
// المدعو يرى بطاقة الدعوة ويقبلها: إن لم يكن مسجّلاً نحفظ الرمز ونرسله للدخول، ثم تُستكمل تلقائياً.
// والمستلم يستطيع أيضاً دعوة شخص آخر أو جهة إلى القسم نفسه باسمه (حتى ٥ دعوات من كل دعوة).
// (المسار ‎/join محجوز لصفحة ثابتة قائمة على Cloudflare Pages: public/join.html)
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import SectionInviteCard, { shade } from "@/components/SectionInviteCard";
import { copyText, notify, openExternal, systemShare } from "@/lib/xplatform";
import { PLAY_URL } from "@/lib/invites";
import {
  sectionInvitesApi, rememberSectionInvite, cleanInviteToken, whatsappDirect, STATUS_META, fmtInviteDate,
  type PublicInvite, type SectionInvite, type InviteKind,
} from "@/lib/section-invites";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";
const FORWARD_LIMIT = 5;

export default function InvitationScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const tok = cleanInviteToken(t);
  const { user, token, isGuest, logout } = useAuth();
  const signedIn = !!user && !!token && !isGuest;
  const [inv, setInv] = useState<PublicInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState<SectionInvite[]>([]);

  const load = useCallback(() => {
    if (!tok) { setInv({ valid: false, reason: "رابط الدعوة غير مكتمل", status: "missing" }); setLoading(false); return; }
    sectionInvitesApi.publicGet(tok, signedIn ? token : null)
      .then(setInv)
      .catch((e) => setInv({ valid: false, reason: e?.message || "تعذّر تحميل الدعوة", status: "missing" }))
      .finally(() => setLoading(false));
    if (signedIn) sectionInvitesApi.mine(token!, tok).then((r) => setSent(r.invites)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok, signedIn, token]);
  useEffect(() => { load(); }, [load]);

  const accept = async () => {
    if (!inv?.valid && !inv?.accepted_by_me) return;
    setErr("");
    if (!signedIn) {
      await rememberSectionInvite(tok);
      notify("خطوة أخيرة", "سجّل دخولك أو أنشئ حساباً، وستنتقل مباشرةً إلى نموذج الانضمام.");
      if (isGuest) { await logout().catch(() => {}); }
      router.replace("/login");
      return;
    }
    setBusy(true);
    try {
      const r = await sectionInvitesApi.accept(token!, tok);
      notify(r.already ? "أهلاً من جديد" : "مرحباً بك 💚", `${r.already ? "قبلت هذه الدعوة سابقاً" : "قُبلت الدعوة"} — أكمل الانضمام إلى ${r.section.title}`);
      router.push({ pathname: r.route, params: r.params } as any);
      setInv((p) => (p ? { ...p, accepted_by_me: true } : p));
    } catch (e: any) {
      setErr(e?.message || "تعذّر قبول الدعوة");
      if (e?.status === 410) setInv((p) => (p ? { ...p, valid: false, reason: e.message } : p));
    } finally { setBusy(false); }
  };

  const home = () => router.replace((signedIn ? "/(tabs)" : "/login") as any);
  const sec = inv?.section;
  const color = sec?.color ?? GREEN;
  const canForward = !!inv?.can_forward && (inv.valid || !!inv.accepted_by_me);

  return (
    <View style={[s.root]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 36 }} keyboardShouldPersistTaps="handled">
        {/* الترويسة */}
        <LinearGradient colors={[shade(color, -0.05), shade(color, -0.32)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { paddingTop: insets.top + 10 }]}>
          <View style={s.heroOrb} />
          <View style={s.header}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : home())} style={s.iconBtn} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
            <Text style={s.headerT}>الدعوات</Text>
            <View style={{ width: 42 }} />
          </View>
          {!loading && sec ? (
            <Animated.View entering={ZoomIn.springify().damping(14)} style={s.envelopeWrap}>
              <View style={s.envelope}><Ionicons name="mail-open" size={30} color={GOLD} /></View>
              <Text style={s.heroT}>{inv?.valid || inv?.accepted_by_me ? "لديك دعوة 💌" : "دعوة"}</Text>
              <Text style={s.heroS}>{inv?.relayed ? `من ${inv.inviter}` : `من ${inv?.inviter ?? "إدارة حصاحيصاوي"}`}</Text>
            </Animated.View>
          ) : <View style={{ height: 60 }} />}
        </LinearGradient>

        <View style={s.content}>
          {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 60 }} /> : sec ? (
            <>
              <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={{ marginTop: -54 }}>
                <SectionInviteCard
                  section={sec}
                  inviteeName={inv!.invitee_name || ""}
                  inviteeKind={inv!.invitee_kind || "person"}
                  message={inv!.message}
                  expiresAt={inv!.expires_at}
                  inviter={inv!.inviter}
                  relayed={inv!.relayed}
                  qrValue={Platform.OS === "web" && inv!.valid ? inv!.app_url : undefined}
                  messageLines={12}
                />
              </Animated.View>

              {/* ما ينتظر المدعو */}
              {sec.benefits?.length ? (
                <Animated.View entering={FadeInDown.delay(160).springify().damping(16)} style={s.panel}>
                  <Text style={s.panelT}>ما ينتظرك في {sec.title}</Text>
                  <View style={s.benefits}>
                    {sec.benefits.map((b, i) => (
                      <View key={i} style={[s.benefit, { borderColor: color + "30", backgroundColor: color + "0D" }]}>
                        <Ionicons name="sparkles" size={14} color={color} />
                        <Text style={s.benefitT}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </Animated.View>
              ) : null}

              {inv!.valid || inv!.accepted_by_me ? (
                <Animated.View entering={FadeInDown.delay(220).springify().damping(16)} style={{ gap: 12 }}>
                  {/* خطوات الانضمام */}
                  <View style={s.timeline}>
                    {[
                      ["mail-open-outline", inv!.accepted_by_me ? "قبلت الدعوة" : "اقبل الدعوة", !!inv!.accepted_by_me],
                      ["person-circle-outline", signedIn ? (user?.name ?? "مسجّل") : "سجّل دخولك", signedIn],
                      ["document-text-outline", "أكمل نموذج الانضمام", false],
                    ].map(([ic, l, done], i) => (
                      <React.Fragment key={i}>
                        {i > 0 ? <View style={[s.tLine, (done as boolean) && { backgroundColor: color }]} /> : null}
                        <View style={s.tStep}>
                          <View style={[s.tDot, { borderColor: color }, (done as boolean) && { backgroundColor: color }]}>
                            <Ionicons name={(done ? "checkmark" : ic) as any} size={16} color={done ? "#fff" : color} />
                          </View>
                          <Text style={s.tT} numberOfLines={2}>{l as string}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                  {err ? <Text style={s.err}>{err}</Text> : null}
                  <Pressable onPress={accept} disabled={busy} accessibilityRole="button" style={({ pressed }) => [{ opacity: busy ? 0.6 : pressed ? 0.88 : 1 }]}>
                    <LinearGradient colors={[shade(color, 0.04), shade(color, -0.22)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.cta}>
                      {busy ? <ActivityIndicator color="#fff" /> : <>
                        <Ionicons name={inv!.accepted_by_me ? "arrow-back-circle" : "checkmark-done"} size={21} color="#fff" />
                        <Text style={s.ctaT}>{inv!.accepted_by_me ? `متابعة الانضمام إلى ${sec.title}` : "قبول الدعوة والانضمام"}</Text>
                      </>}
                    </LinearGradient>
                  </Pressable>
                  {Platform.OS === "web" ? (
                    <Pressable onPress={() => openExternal(PLAY_URL)} style={s.ghost}>
                      <Ionicons name="logo-google-playstore" size={18} color={Colors.textPrimary} /><Text style={s.ghostT}>حمّل التطبيق من Google Play</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : (
                <InvalidBox reason={inv!.reason} onHome={home} signedIn={signedIn} />
              )}

              {/* ادعُ شخصاً آخر أو جهة */}
              {canForward ? (
                <Animated.View entering={FadeInDown.delay(280).springify().damping(16)}>
                  <ForwardPanel
                    sectionTitle={sec.title}
                    color={color}
                    signedIn={signedIn}
                    used={sent.length}
                    onLogin={async () => { await rememberSectionInvite(tok); router.push("/login"); }}
                    onSend={async (body) => {
                      const r = await sectionInvitesApi.forward(token!, tok, body);
                      setSent((p) => [r.invite, ...p]);
                      return r.invite;
                    }}
                  />
                </Animated.View>
              ) : null}

              {sent.length ? (
                <View style={s.panel}>
                  <Text style={s.panelT}>دعوات أرسلتها ({sent.length})</Text>
                  {sent.map((d) => <SentRow key={d.id} inv={d} />)}
                </View>
              ) : null}
            </>
          ) : (
            <InvalidBox reason={inv?.reason ?? null} onHome={home} signedIn={signedIn} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** لوحة «ادعُ شخصاً آخر أو جهة» */
function ForwardPanel({ sectionTitle, color, signedIn, used, onLogin, onSend }: {
  sectionTitle: string; color: string; signedIn: boolean; used: number;
  onLogin: () => void; onSend: (b: { invitee_name: string; invitee_kind: InviteKind; invitee_phone?: string; note?: string }) => Promise<SectionInvite>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<InviteKind>("person");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<SectionInvite | null>(null);
  const left = Math.max(0, FORWARD_LIMIT - used);

  const submit = async () => {
    setErr("");
    if (name.trim().length < 2) { setErr(kind === "org" ? "اكتب اسم الجهة" : "اكتب اسم الشخص"); return; }
    setBusy(true);
    try {
      const inv = await onSend({ invitee_name: name.trim(), invitee_kind: kind, invitee_phone: phone.trim() || undefined, note: note.trim() || undefined });
      setCreated(inv); setName(""); setPhone(""); setNote("");
    } catch (e: any) { setErr(e?.message || "تعذّر إنشاء الدعوة"); }
    finally { setBusy(false); }
  };

  const share = async (via: "wa" | "copy" | "sys") => {
    if (!created) return;
    if (via === "wa") openExternal(created.invitee_phone ? whatsappDirect(created.invitee_phone, created.share_text) : `https://wa.me/?text=${encodeURIComponent(created.share_text)}`);
    else if (via === "copy") { const r = await copyText(created.share_text); if (r === "copied") notify("نُسخت الدعوة", "الصقها في أي محادثة"); }
    else if (!(await systemShare(created.share_text, created.share_url))) { const r = await copyText(created.share_text); if (r === "copied") notify("نُسخت الدعوة", "الصقها في أي محادثة"); }
  };

  return (
    <View style={s.fwd}>
      <LinearGradient colors={["#FFF8E1", "#FFFDF6"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={s.fwdHead}>
        <View style={s.fwdIcon}><Ionicons name="paper-plane" size={20} color="#7A5900" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.fwdT}>ادعُ شخصاً آخر أو جهة</Text>
          <Text style={s.fwdS}>تعرف من يستفيد من «{sectionTitle}»؟ أرسل له دعوة شخصية باسمك.</Text>
        </View>
      </View>

      {!signedIn ? (
        <Pressable onPress={onLogin} style={[s.fwdBtn, { backgroundColor: DEEP }]}>
          <Ionicons name="log-in-outline" size={18} color="#fff" /><Text style={s.fwdBtnT}>سجّل الدخول لدعوة غيرك</Text>
        </Pressable>
      ) : created ? (
        <View style={{ gap: 10 }}>
          <View style={s.okBox}>
            <Ionicons name="checkmark-circle" size={22} color={GREEN} />
            <Text style={s.okT}>جاهزة! أُنشئت دعوة «{created.invitee_name}» — أرسلها الآن</Text>
          </View>
          <View style={s.shareRow}>
            <Pressable onPress={() => share("wa")} style={[s.shareBtn, { backgroundColor: "#1FAF5A" }]}><Ionicons name="logo-whatsapp" size={18} color="#fff" /><Text style={s.shareT}>واتساب</Text></Pressable>
            <Pressable onPress={() => share("sys")} style={[s.shareBtn, { backgroundColor: DEEP }]}><Ionicons name="share-social" size={18} color="#fff" /><Text style={s.shareT}>مشاركة</Text></Pressable>
            <Pressable onPress={() => share("copy")} style={[s.shareBtn, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8D9A8" }]}><Ionicons name="copy-outline" size={18} color={DEEP} /><Text style={[s.shareT, { color: DEEP }]}>نسخ</Text></Pressable>
          </View>
          {left > 0 ? (
            <Pressable onPress={() => { setCreated(null); setOpen(true); }} style={s.linkBtn}><Ionicons name="add-circle-outline" size={17} color="#7A5900" /><Text style={s.linkT}>دعوة شخص أو جهة أخرى ({left} متبقية)</Text></Pressable>
          ) : null}
        </View>
      ) : !open ? (
        <Pressable onPress={() => setOpen(true)} disabled={left === 0} style={[s.fwdBtn, { backgroundColor: left ? GOLD : "#D9CFAF" }]}>
          <Ionicons name="person-add" size={18} color="#3D2C00" />
          <Text style={[s.fwdBtnT, { color: "#3D2C00" }]}>{left ? `إنشاء دعوة جديدة · ${left} متبقية` : "استخدمت كل دعواتك من هذه الدعوة"}</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={s.seg}>
            {([["person", "شخص", "person"], ["org", "جهة / مؤسسة", "business"]] as const).map(([k, l, ic]) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[s.segBtn, kind === k && { backgroundColor: "#fff", borderColor: GOLD }]} accessibilityRole="radio" accessibilityState={{ selected: kind === k }}>
                <Ionicons name={ic} size={16} color={kind === k ? "#7A5900" : Colors.textMuted} />
                <Text style={[s.segT, kind === k && { color: "#7A5900" }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <Field icon={kind === "org" ? "business-outline" : "person-outline"} value={name} onChange={setName} placeholder={kind === "org" ? "اسم الجهة (مثال: صيدلية النيل)" : "اسم الشخص"} />
          <Field icon="call-outline" value={phone} onChange={setPhone} placeholder="رقم واتساب (اختياري)" keyboard="phone-pad" />
          <Field icon="chatbubble-ellipses-outline" value={note} onChange={setNote} placeholder="كلمة شخصية منك (اختياري)" multiline />
          {err ? <Text style={s.err}>{err}</Text> : null}
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <Pressable onPress={submit} disabled={busy} style={[s.fwdBtn, { flex: 1, backgroundColor: DEEP, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="paper-plane" size={17} color="#fff" /><Text style={s.fwdBtnT}>إنشاء الدعوة</Text></>}
            </Pressable>
            <Pressable onPress={() => { setOpen(false); setErr(""); }} style={[s.fwdBtn, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8D9A8", paddingHorizontal: 18 }]}>
              <Text style={[s.fwdBtnT, { color: Colors.textSecondary }]}>إلغاء</Text>
            </Pressable>
          </View>
          <Text style={s.fine}>تصل الدعوة باسمك، صالحة ٣٠ يوماً ولشخص/جهة واحدة. تُشعَر عند قبولها.</Text>
        </View>
      )}
    </View>
  );
}

function Field({ icon, value, onChange, placeholder, keyboard, multiline }: { icon: any; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: any; multiline?: boolean }) {
  return (
    <View style={[s.field, multiline && { alignItems: "flex-start" }]}>
      <Ionicons name={icon} size={18} color="#9A8650" style={multiline ? { marginTop: 12 } : undefined} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={keyboard}
        multiline={multiline} maxLength={multiline ? 500 : 160} style={[s.input, multiline && { minHeight: 70, textAlignVertical: "top" }]} />
    </View>
  );
}

function SentRow({ inv }: { inv: SectionInvite }) {
  const st = STATUS_META[inv.status];
  return (
    <View style={s.sent}>
      <View style={s.sentIcon}><Ionicons name={inv.invitee_kind === "org" ? "business" : "person"} size={16} color={DEEP} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.sentN} numberOfLines={1}>{inv.invitee_name}</Text>
        <Text style={s.sentS}>{fmtInviteDate(inv.created_at)} · فُتحت {inv.opens} · {inv.uses ? "قُبلت ✓" : "لم تُقبل بعد"}</Text>
      </View>
      <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillT, { color: st.color }]}>{inv.uses ? "مقبولة" : st.label}</Text></View>
    </View>
  );
}

function InvalidBox({ reason, onHome, signedIn }: { reason: string | null; onHome: () => void; signedIn: boolean }) {
  return (
    <View style={s.bad}>
      <View style={s.badIcon}><Ionicons name="mail-unread-outline" size={30} color="#B42318" /></View>
      <Text style={s.badT}>الدعوة غير متاحة</Text>
      <Text style={s.badS}>{reason || "الدعوة غير موجودة أو الرابط غير صحيح"}</Text>
      <Text style={s.badS}>يمكنك طلب دعوة جديدة ممن أرسلها إليك أو من إدارة حصاحيصاوي.</Text>
      <Pressable onPress={onHome} style={[s.cta, { backgroundColor: GREEN, alignSelf: "stretch" }]}>
        <Ionicons name={signedIn ? "home-outline" : "log-in-outline"} size={18} color="#fff" />
        <Text style={s.ctaT}>{signedIn ? "الصفحة الرئيسية" : "الدخول إلى حصاحيصاوي"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 16, paddingBottom: 70, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: "hidden" },
  heroOrb: { position: "absolute", top: -120, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(255,255,255,0.1)" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 560, alignSelf: "center" },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  headerT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff" },
  envelopeWrap: { alignItems: "center", marginTop: 10, gap: 2 },
  envelope: { width: 62, height: 62, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  heroT: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  heroS: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: "rgba(255,255,255,0.88)" },
  content: { paddingHorizontal: 16, gap: 14, width: "100%", maxWidth: 560, alignSelf: "center" },
  panel: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  panelT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  benefits: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  benefit: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  benefitT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary },
  timeline: { flexDirection: "row-reverse", alignItems: "flex-start", backgroundColor: Colors.cardBg, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.divider },
  tStep: { width: 92, alignItems: "center", gap: 6 },
  tDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  tLine: { flex: 1, height: 2, backgroundColor: Colors.divider, marginTop: 18 },
  tT: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary, textAlign: "center" },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
  cta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 20 },
  ctaT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  ghost: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 18, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary },
  fwd: { borderRadius: 24, padding: 16, gap: 12, overflow: "hidden", borderWidth: 1, borderColor: "#F0DFA6" },
  fwdHead: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  fwdIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  fwdT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#3D2C00", textAlign: "right" },
  fwdS: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "#6B5A2A", textAlign: "right", lineHeight: 20 },
  fwdBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 16 },
  fwdBtnT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
  seg: { flexDirection: "row-reverse", gap: 8, padding: 4, borderRadius: 16, backgroundColor: "#F6EBC8" },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#EADFB9", paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 11 },
  fine: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: "#8A7740", textAlign: "center" },
  okBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#E7F6EF", borderRadius: 14, padding: 10 },
  okT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#0B5E3F", textAlign: "right" },
  shareRow: { flexDirection: "row-reverse", gap: 8 },
  shareBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 14 },
  shareT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  linkBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  linkT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#7A5900" },
  sent: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6 },
  sentIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: GREEN + "14", alignItems: "center", justifyContent: "center" },
  sentN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  sentS: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  bad: { alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: Colors.divider, marginTop: 10 },
  badIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: "#FDE8E6", alignItems: "center", justifyContent: "center" },
  badT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  badS: { fontFamily: "Cairo_500Medium", fontSize: 13.5, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});
