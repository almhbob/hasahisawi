// ✉️ دعوات الأقسام — لوحة مدير التطبيق لإنشاء روابط دعوة رسمية لكل قسم وإرسالها ومتابعتها
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, RefreshControl, Linking, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { StarPattern } from "@/components/ui/Ornament";
import ShareBar from "@/components/lit/ShareBar";
import SectionInviteCard from "@/components/SectionInviteCard";
import { copyText, notify, openExternal, socialShareUrl, systemShare, confirmAction } from "@/lib/xplatform";
import {
  sectionInvitesApi, STATUS_META, fmtInviteDate, whatsappDirect,
  type SectionCatalogItem, type SectionCounts, type SectionInvite, type InviteKind,
} from "@/lib/section-invites";

const EXPIRY = [{ d: 7, l: "٧ أيام" }, { d: 30, l: "٣٠ يوماً" }, { d: 90, l: "٩٠ يوماً" }, { d: 0, l: "بلا انتهاء" }];
const USES: { v: number | null; l: string }[] = [{ v: 1, l: "مرة واحدة" }, { v: 5, l: "٥ مرات" }, { v: 20, l: "٢٠ مرة" }, { v: null, l: "غير محدود" }];
type Step = "compose" | "preview" | "history";

const shareBody = (inv: SectionInvite) => inv.share_text.replace(inv.share_url, "").replace(/\n+$/, "").trim();

export default function AdminInvitesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sections, setSections] = useState<SectionCatalogItem[]>([]);
  const [totals, setTotals] = useState<SectionCounts>({ sent: 0, opens: 0, accepts: 0, active: 0 });
  const [recent, setRecent] = useState<SectionInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");

  // ── لوحة القسم ──
  const [sheet, setSheet] = useState<SectionCatalogItem | null>(null);
  const [step, setStep] = useState<Step>("compose");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<InviteKind>("person");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [uses, setUses] = useState<number | null>(1);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<SectionInvite | null>(null);
  const [history, setHistory] = useState<SectionInvite[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const sheetScroll = useRef<ScrollView>(null);
  // كل تبويب يبدأ من الأعلى (وإلا تظهر بطاقة المعاينة مقصوصة بعد التمرير في النموذج)
  useEffect(() => { sheetScroll.current?.scrollTo({ y: 0, animated: false }); }, [step, created?.id]);

  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return; }
    setError("");
    try {
      const [c, l] = await Promise.all([sectionInvitesApi.sections(token), sectionInvitesApi.list(token)]);
      setSections(c.sections); setTotals(c.totals); setRecent(l.invites.slice(0, 8));
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, isAdmin]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadHistory = useCallback(async (key: string) => {
    if (!token) return;
    setHistLoading(true);
    try { setHistory((await sectionInvitesApi.list(token, key)).invites); } catch { setHistory([]); }
    finally { setHistLoading(false); }
  }, [token]);

  const openSheet = (sec: SectionCatalogItem, initial: Step = "compose") => {
    setSheet(sec); setStep(initial); setCreated(null);
    setName(""); setPhone(""); setKind("person"); setMessage(sec.template_person); setDays(30); setUses(1);
    loadHistory(sec.key);
  };
  const closeSheet = () => { setSheet(null); setCreated(null); };

  const switchKind = (k: InviteKind) => {
    if (!sheet || k === kind) return;
    // إن لم يعدّل المدير النص المقترح، نبدّله بقالب نوع المدعو الجديد
    if (message.trim() === (kind === "org" ? sheet.template_org : sheet.template_person).trim()) setMessage(k === "org" ? sheet.template_org : sheet.template_person);
    setUses(k === "org" ? null : 1);
    setKind(k);
  };

  const create = async () => {
    if (!token || !sheet) return;
    if (name.trim().length < 2) { notify("اسم المدعو مطلوب", "اكتب اسم الشخص أو الجهة المدعوّة"); return; }
    setSaving(true);
    try {
      const r = await sectionInvitesApi.create(token, {
        section_key: sheet.key, invitee_name: name.trim(), invitee_kind: kind,
        invitee_phone: phone.trim() || undefined, message: message.trim(), expires_days: days, max_uses: uses,
      });
      setCreated(r.invite); setStep("preview");
      load(); loadHistory(sheet.key);
    } catch (e: any) { notify("تعذّر إنشاء الدعوة", e?.message || "حاول مجدداً"); }
    finally { setSaving(false); }
  };

  const showInvite = (inv: SectionInvite) => {
    const sec = sections.find((x) => x.key === inv.section_key);
    if (!sec) return;
    if (!sheet || sheet.key !== sec.key) { setSheet(sec); loadHistory(sec.key); }
    setCreated(inv); setStep("preview");
  };

  const sendWhatsApp = (inv: SectionInvite) => {
    const url = inv.invitee_phone ? whatsappDirect(inv.invitee_phone, inv.share_text) : socialShareUrl("whatsapp", inv.share_url, shareBody(inv));
    openExternal(url);
  };
  const copyLink = async (inv: SectionInvite) => { if ((await copyText(inv.share_url)) === "copied") notify("نُسخ رابط الدعوة", "الصقه في أي محادثة"); };
  const copyFull = async (inv: SectionInvite) => { if ((await copyText(inv.share_text)) === "copied") notify("نُسخ نص الدعوة", "نص الدعوة كاملاً مع الرابط"); };
  const share = async (inv: SectionInvite) => { if (!(await systemShare(shareBody(inv), inv.share_url))) await Linking.openURL(socialShareUrl("whatsapp", inv.share_url, shareBody(inv))).catch(() => {}); };

  const patch = async (inv: SectionInvite, op: "revoke" | "restore" | "extend") => {
    if (!token) return;
    if (op === "revoke" && !(await confirmAction("إلغاء الدعوة", `سيتوقف رابط دعوة «${inv.invitee_name}» عن العمل فوراً.`, "إلغاء الدعوة", true))) return;
    try {
      const r = op === "revoke" ? await sectionInvitesApi.revoke(token, inv.id)
        : op === "restore" ? await sectionInvitesApi.restore(token, inv.id)
        : await sectionInvitesApi.extend(token, inv.id, 30, inv.max_uses != null && inv.uses >= inv.max_uses ? 1 : 0);
      setHistory((h) => h.map((x) => (x.id === inv.id ? r.invite : x)));
      setRecent((h) => h.map((x) => (x.id === inv.id ? r.invite : x)));
      if (created?.id === inv.id) setCreated(r.invite);
      notify(op === "revoke" ? "أُلغيت الدعوة" : op === "restore" ? "أُعيد تفعيل الدعوة" : "مُدّدت الدعوة ٣٠ يوماً");
      load();
    } catch (e: any) { notify("تعذّر التنفيذ", e?.message || ""); }
  };

  // التصنيفات بترتيب ظهورها في الكتالوج
  const groups = useMemo(() => {
    const seen = new Map<string, { key: string; title: string; n: number }>();
    for (const x of sections) {
      const k = x.group || "other";
      const g = seen.get(k) || { key: k, title: x.group_title || "أخرى", n: 0 };
      g.n++; seen.set(k, g);
    }
    return [...seen.values()];
  }, [sections]);
  const filtered = useMemo(() => {
    const t = q.trim();
    return sections.filter((x) =>
      (group === "all" || (x.group || "other") === group) &&
      (!t || x.title.includes(t) || x.tagline.includes(t) || (x.benefits || []).some((b) => b.includes(t))));
  }, [sections, q, group]);
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const tileW = `${100 / cols}%` as const;
  const rate = totals.sent ? Math.round((totals.accepts / Math.max(1, totals.sent)) * 100) : 0;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any));

  if (!isAdmin) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Header onBack={back} />
        <View style={s.locked}>
          <View style={s.lockIcon}><Ionicons name="lock-closed" size={34} color={Colors.primary} /></View>
          <Text style={s.lockT}>هذه الصفحة لمدير التطبيق فقط</Text>
          <Text style={s.lockS}>إرسال دعوات الانضمام الرسمية للأقسام صلاحية حصرية لإدارة حصاحيصاوي.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={back} onRefresh={() => { setRefreshing(true); load(); }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {/* البطل: الإجماليات */}
        <LinearGradient colors={["#063B2A", "#0B6B49", "#0E8A5F"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.hero}>
          <StarPattern opacity={0.12} />
          <View style={s.heroTop}>
            <View style={s.heroIcon}><Ionicons name="mail-open" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroT}>دعوات الانضمام الرسمية</Text>
              <Text style={s.heroS}>اختر قسماً وأرسل دعوة باسم شخص أو جهة — تصل كبطاقة أنيقة برابط مباشر لنموذج الانضمام</Text>
            </View>
          </View>
          <View style={s.stats}>
            <Stat n={totals.sent} l="أُرسلت" icon="paper-plane-outline" />
            <Stat n={totals.opens} l="فُتحت" icon="eye-outline" />
            <Stat n={totals.accepts} l="قُبلت" icon="checkmark-done-outline" />
            <Stat n={`${rate}%`} l="نسبة القبول" icon="trending-up-outline" />
          </View>
        </LinearGradient>

        {error ? <Text style={s.err}>{error}</Text> : null}

        <View style={s.search}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن قسم…" placeholderTextColor={Colors.textMuted} style={s.searchIn} textAlign="right" />
        </View>

        {groups.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, paddingVertical: 2 }}>
            {[{ key: "all", title: "الكل", n: sections.length }, ...groups].map((g) => {
              const on = group === g.key;
              return (
                <Pressable key={g.key} onPress={() => setGroup(g.key)} style={[s.gChip, on && s.gChipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.gChipT, on && s.gChipTOn]}>{g.title}</Text>
                  <Text style={[s.gChipN, on && s.gChipTOn]}>{g.n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Text style={s.h2}>الأقسام ({filtered.length})</Text>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} /> : (
          <View style={s.grid}>
            {filtered.map((sec) => (
              <View key={sec.key} style={{ width: tileW, padding: 5 }}>
                <Pressable onPress={() => openSheet(sec)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} accessibilityRole="button" accessibilityLabel={`دعوة إلى ${sec.title}`}>
                  <View style={[s.tileBar, { backgroundColor: sec.color }]} />
                  <View style={s.tileHead}>
                    <View style={[s.tileIcon, { backgroundColor: sec.color + "1F" }]}><Ionicons name={sec.icon as any} size={22} color={sec.color} /></View>
                    {sec.counts.active > 0 ? <View style={[s.dot, { backgroundColor: sec.color }]}><Text style={s.dotT}>{sec.counts.active}</Text></View> : null}
                  </View>
                  <Text style={s.tileT} numberOfLines={2}>{sec.title}</Text>
                  <Text style={s.tileS} numberOfLines={1}>{sec.tagline}</Text>
                  <View style={s.tileFoot}>
                    <Text style={s.tileC}><Ionicons name="paper-plane-outline" size={11} /> {sec.counts.sent}</Text>
                    <Text style={s.tileC}><Ionicons name="eye-outline" size={11} /> {sec.counts.opens}</Text>
                    <Text style={[s.tileC, { color: "#0B7A52" }]}><Ionicons name="checkmark-done" size={11} /> {sec.counts.accepts}</Text>
                  </View>
                  <View style={[s.tileBtn, { backgroundColor: sec.color }]}><Ionicons name="add" size={14} color="#fff" /><Text style={s.tileBtnT}>دعوة جديدة</Text></View>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {recent.length ? (
          <>
            <Text style={s.h2}>أحدث الدعوات</Text>
            <View style={{ gap: 8 }}>
              {recent.map((inv) => <InviteRow key={inv.id} inv={inv} showSection onShare={() => showInvite(inv)} onPatch={(op) => patch(inv, op)} />)}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ── لوحة القسم: إنشاء / معاينة / سجل ── */}
      <Modal visible={!!sheet} animationType="slide" transparent onRequestClose={closeSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="إغلاق" />
          {sheet ? (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
              <View style={s.grab} />
              <View style={s.sheetHead}>
                <View style={[s.tileIcon, { backgroundColor: sheet.color + "1F" }]}><Ionicons name={sheet.icon as any} size={22} color={sheet.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetT}>{sheet.title}</Text>
                  <Text style={s.sheetS}>{sheet.tagline}</Text>
                </View>
                <Pressable onPress={closeSheet} style={s.close} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color={Colors.textPrimary} /></Pressable>
              </View>
              <View style={s.seg}>
                {([["compose", "دعوة جديدة", "create-outline"], ["preview", "البطاقة", "card-outline"], ["history", `السجل (${history.length})`, "time-outline"]] as const).map(([k, l, ic]) => {
                  const on = step === k; const dis = k === "preview" && !created;
                  return (
                    <Pressable key={k} disabled={dis} onPress={() => setStep(k)} style={[s.segBtn, on && { backgroundColor: sheet.color }, dis && { opacity: 0.4 }]}>
                      <Ionicons name={ic} size={14} color={on ? "#fff" : Colors.textSecondary} />
                      <Text style={[s.segT, on && { color: "#fff" }]}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <ScrollView ref={sheetScroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
                {step === "compose" && (
                  <>
                    <Field label="اسم المدعو أو الجهة">
                      <TextInput value={name} onChangeText={setName} placeholder={kind === "org" ? "مثال: شركة النيل للمقاولات" : "مثال: الأستاذ أحمد محمد"} placeholderTextColor={Colors.textMuted} style={s.input} textAlign="right" maxLength={160} />
                    </Field>
                    <Field label="نوع المدعو">
                      <View style={s.row}>
                        {([["person", "شخص", "person-outline"], ["org", "مؤسسة / جهة", "business-outline"]] as const).map(([k, l, ic]) => (
                          <Pressable key={k} onPress={() => switchKind(k)} style={[s.toggle, kind === k && { borderColor: sheet.color, backgroundColor: sheet.color + "14" }]}>
                            <Ionicons name={ic} size={16} color={kind === k ? sheet.color : Colors.textSecondary} />
                            <Text style={[s.toggleT, kind === k && { color: sheet.color }]}>{l}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="رقم واتساب (اختياري — للإرسال المباشر)">
                      <TextInput value={phone} onChangeText={setPhone} placeholder="0912345678 أو ‎+249…" placeholderTextColor={Colors.textMuted} style={s.input} textAlign="right" keyboardType="phone-pad" maxLength={20} />
                    </Field>
                    <Field label="الرسالة الشخصية">
                      <TextInput value={message} onChangeText={setMessage} multiline style={[s.input, { minHeight: 120, textAlignVertical: "top", lineHeight: 24 }]} textAlign="right" maxLength={1200} />
                      <Pressable onPress={() => setMessage(kind === "org" ? sheet.template_org : sheet.template_person)} style={s.reset}><Ionicons name="refresh" size={13} color={Colors.textSecondary} /><Text style={s.resetT}>استعادة النص المقترح</Text></Pressable>
                    </Field>
                    <Field label="مدة الصلاحية">
                      <View style={s.chips}>{EXPIRY.map((e) => <Chip key={e.d} on={days === e.d} color={sheet.color} label={e.l} onPress={() => setDays(e.d)} />)}</View>
                    </Field>
                    <Field label="عدد مرات الاستخدام">
                      <View style={s.chips}>{USES.map((u) => <Chip key={String(u.v)} on={uses === u.v} color={sheet.color} label={u.l} onPress={() => setUses(u.v)} />)}</View>
                    </Field>
                    <Text style={s.hint}>معاينة مباشرة</Text>
                    <SectionInviteCard section={sheet} inviteeName={name.trim() || (kind === "org" ? "اسم الجهة" : "اسم المدعو")} inviteeKind={kind} message={message} expiresAt={days ? new Date(Date.now() + days * 864e5).toISOString() : null} messageLines={3} />
                    <Pressable onPress={create} disabled={saving} style={[s.primary, { backgroundColor: sheet.color }, saving && { opacity: 0.6 }]}>
                      {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="sparkles" size={18} color="#fff" /><Text style={s.primaryT}>إنشاء الدعوة</Text></>}
                    </Pressable>
                  </>
                )}

                {step === "preview" && created && (
                  <>
                    <View style={[s.okBox, { borderColor: sheet.color + "55" }]}>
                      <Ionicons name="checkmark-circle" size={20} color={STATUS_META[created.status].color} />
                      <Text style={s.okT}>دعوة «{created.invitee_name}» — <Text style={{ color: STATUS_META[created.status].color }}>{STATUS_META[created.status].label}</Text></Text>
                    </View>
                    <SectionInviteCard section={created.section ?? sheet} inviteeName={created.invitee_name} inviteeKind={created.invitee_kind} message={created.message} expiresAt={created.expires_at} qrValue={created.app_url} messageLines={5} />
                    <Pressable onPress={() => sendWhatsApp(created)} style={[s.primary, { backgroundColor: "#128C7E" }]}>
                      <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                      <Text style={s.primaryT}>{created.invitee_phone ? `أرسل عبر واتساب إلى ${created.invitee_phone}` : "أرسل عبر واتساب"}</Text>
                    </Pressable>
                    <View style={s.row}>
                      <Action icon="link" label="نسخ الرابط" onPress={() => copyLink(created)} />
                      <Action icon="document-text-outline" label="نسخ النص كاملاً" onPress={() => copyFull(created)} />
                      <Action icon="share-social-outline" label="مشاركة" onPress={() => share(created)} />
                    </View>
                    <ShareBar url={created.share_url} text={shareBody(created)} title="أرسل الدعوة على مواقع التواصل" />
                    <View style={s.linkBox}>
                      <Text style={s.linkLbl}>رابط الدعوة</Text>
                      <Text style={s.link} selectable numberOfLines={2}>{created.share_url}</Text>
                    </View>
                    <Pressable onPress={() => { setCreated(null); setName(""); setPhone(""); setStep("compose"); }} style={s.ghost}>
                      <Ionicons name="add-circle-outline" size={18} color={sheet.color} /><Text style={[s.ghostT, { color: sheet.color }]}>دعوة أخرى لهذا القسم</Text>
                    </Pressable>
                  </>
                )}

                {step === "history" && (
                  histLoading ? <ActivityIndicator color={sheet.color} style={{ marginTop: 20 }} /> :
                  history.length ? history.map((inv) => <InviteRow key={inv.id} inv={inv} onShare={() => showInvite(inv)} onPatch={(op) => patch(inv, op)} />) : (
                    <View style={s.empty}><Ionicons name="mail-outline" size={30} color={Colors.textMuted} /><Text style={s.emptyT}>لم تُرسل دعوات لهذا القسم بعد</Text></View>
                  )
                )}
              </ScrollView>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Header({ onBack, onRefresh }: { onBack: () => void; onRefresh?: () => void }) {
  return (
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} /></Pressable>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={s.title}>دعوات الأقسام</Text>
        <View style={s.badge}><Ionicons name="shield" size={10} color="#E05567" /><Text style={s.badgeT}>مدير التطبيق فقط</Text></View>
      </View>
      {onRefresh ? <Pressable onPress={onRefresh} style={s.iconBtn} accessibilityLabel="تحديث"><Ionicons name="refresh" size={20} color={Colors.textPrimary} /></Pressable> : <View style={{ width: 44 }} />}
    </View>
  );
}

function Stat({ n, l, icon }: { n: number | string; l: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={15} color="rgba(255,255,255,0.85)" />
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{l}</Text>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Text style={s.label}>{label}</Text>{children}</View>;
}

function Chip({ on, label, color, onPress }: { on: boolean; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && { backgroundColor: color, borderColor: color }]}>
      <Text style={[s.chipT, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.action}>
      <Ionicons name={icon} size={18} color={Colors.primary} />
      <Text style={s.actionT}>{label}</Text>
    </Pressable>
  );
}

function InviteRow({ inv, showSection, onShare, onPatch }: { inv: SectionInvite; showSection?: boolean; onShare: () => void; onPatch: (op: "revoke" | "restore" | "extend") => void }) {
  const st = STATUS_META[inv.status];
  const color = inv.section?.color ?? Colors.primary;
  return (
    <View style={s.inv}>
      <View style={s.invTop}>
        <View style={[s.invIcon, { backgroundColor: color + "1A" }]}><Ionicons name={inv.invitee_kind === "org" ? "business" : "person"} size={16} color={color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.invName} numberOfLines={1}>{inv.invitee_name}</Text>
          <Text style={s.invSub} numberOfLines={1}>
            {showSection && inv.section ? `${inv.section.title} · ` : ""}{fmtInviteDate(inv.created_at)}{inv.expires_at ? ` · حتى ${fmtInviteDate(inv.expires_at)}` : " · بلا انتهاء"}
          </Text>
        </View>
        <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillT, { color: st.color }]}>{st.label}</Text></View>
      </View>
      <View style={s.invStats}>
        <Text style={s.invStat}><Ionicons name="eye-outline" size={12} /> فُتحت {inv.opens}</Text>
        <Text style={s.invStat}><Ionicons name="checkmark-done-outline" size={12} /> قُبلت {inv.uses}{inv.max_uses != null ? ` من ${inv.max_uses}` : ""}</Text>
        {inv.invitee_phone ? <Text style={s.invStat}><Ionicons name="call-outline" size={12} /> {inv.invitee_phone}</Text> : null}
      </View>
      <View style={s.invActs}>
        <Pressable onPress={onShare} style={s.miniBtn}><Ionicons name="share-outline" size={14} color={Colors.primary} /><Text style={s.miniT}>إعادة الإرسال</Text></Pressable>
        {inv.status !== "revoked" ? (
          <Pressable onPress={() => onPatch("extend")} style={s.miniBtn}><Ionicons name="time-outline" size={14} color="#946B00" /><Text style={[s.miniT, { color: "#946B00" }]}>تمديد ٣٠ يوماً</Text></Pressable>
        ) : null}
        {inv.status === "revoked" ? (
          <Pressable onPress={() => onPatch("restore")} style={s.miniBtn}><Ionicons name="refresh" size={14} color="#0B7A52" /><Text style={[s.miniT, { color: "#0B7A52" }]}>إعادة التفعيل</Text></Pressable>
        ) : (
          <Pressable onPress={() => onPatch("revoke")} style={s.miniBtn}><Ionicons name="close-circle-outline" size={14} color="#B42318" /><Text style={[s.miniT, { color: "#B42318" }]}>إلغاء</Text></Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: -2 },
  badgeT: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#E05567" },
  hero: { borderRadius: 24, padding: 18, overflow: "hidden", gap: 14 },
  heroTop: { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  heroT: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "right" },
  heroS: { fontFamily: "Cairo_500Medium", fontSize: 12.5, lineHeight: 21, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  stats: { flexDirection: "row-reverse", gap: 8 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", marginTop: 2 },
  statL: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: -2 },
  err: { fontFamily: "Cairo_600SemiBold", color: Colors.danger, textAlign: "center" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.divider },
  searchIn: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, paddingVertical: 10 },
  h2: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  gChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 999, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  gChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  gChipT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary },
  gChipN: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted },
  gChipTOn: { color: "#fff" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", marginHorizontal: -5 },
  tile: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, paddingTop: 14, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden", minHeight: 186 },
  tileBar: { position: "absolute", top: 0, right: 0, left: 0, height: 4 },
  tileHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dot: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  dotT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  tileT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginTop: 8, lineHeight: 22 },
  tileS: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  tileFoot: { flexDirection: "row-reverse", gap: 10, marginTop: 6 },
  tileC: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textSecondary },
  tileBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 11, paddingVertical: 6, marginTop: "auto" },
  tileBtnT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,20,16,0.5)" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "94%", width: "100%", maxWidth: 640, alignSelf: "center" },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 8 },
  sheetHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  sheetS: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  seg: { flexDirection: "row-reverse", gap: 6, margin: 16, marginBottom: 10, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: 11 },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  input: { backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary },
  row: { flexDirection: "row-reverse", gap: 8 },
  toggle: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  toggleT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textSecondary },
  reset: { flexDirection: "row-reverse", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  resetT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  chipT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  hint: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  primary: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 16 },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  okBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, borderWidth: 1, backgroundColor: Colors.cardBg },
  okT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  action: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  actionT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary },
  linkBox: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  linkLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  link: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textPrimary, textAlign: "left" },
  ghost: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 30 },
  emptyT: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textMuted },
  inv: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.divider, gap: 8 },
  invTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  invIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  invName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  invSub: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  invStats: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  invStat: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  invActs: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 8 },
  miniBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: Colors.bg },
  miniT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary },
  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  lockIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center" },
  lockT: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  lockS: { fontFamily: "Cairo_500Medium", fontSize: 13.5, lineHeight: 22, color: Colors.textMuted, textAlign: "center" },
});
