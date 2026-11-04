// صفحة المسابقة: واجهة بعدّ تنازلي، الجوائز بالمراكز، الراعي، خطوات المشاركة والشروط،
// المشاركون، الأسئلة أو نموذج المشاركة، النتيجة ورقم المشاركة، الفائزون، والنشر على التواصل.
import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Share, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import {
  contestsApi, themeOf, publicContestUrl, prizeTiers, qCount, RANK_LABEL, useNow, elapsedRatio, type ContestDetail,
} from "@/lib/contests";
import { reminderKeys, toggleReminder } from "@/lib/contest-reminders";
import { pickAndUploadContestImage } from "@/lib/contest-image";
import { useViewCount, formatViews } from "@/lib/views";
import ContestPoster from "@/components/contests/ContestPoster";
import {
  AvatarStack, CategoryChip, Confetti, Countdown, Podium, Skeleton, SponsorChip, StatusPill, TimeBar,
} from "@/components/contests/ContestUI";
import { LoadError } from "@/components/ui/LoadState";
import UserAvatar from "@/components/UserAvatar";
import { shareViewAsImage } from "@/lib/share-image";
import { APP_INVITE, HASHTAGS } from "@/constants/app-invite";
import { notify, openExternal, socialShareUrl } from "@/lib/xplatform";

const arDate = (iso: string) => new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
const arDateTime = (iso: string) => new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export default function ContestScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const contestId = Number(id);
  const { token, isGuest, user } = useAuth();
  const now = useNow(1000);
  const views = useViewCount("contest", Number.isInteger(contestId) ? contestId : null, token);
  const [c, setC] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<number[]>([]);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [celebrate, setCelebrate] = useState<{ run: number; number: number | null; score: number; total: number | null } | null>(null);
  const [reminded, setReminded] = useState(false);
  const posterRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(contestId)) { setLoading(false); setError("رابط المسابقة غير صالح"); return; }
    setError("");
    try {
      const d = await contestsApi.get(contestId, token);
      setC(d);
      setAnswers((a) => (a.length === d.questions.length ? a : d.questions.map(() => -1)));
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, [contestId, token]);

  useFocusEffect(useCallback(() => {
    load();
    reminderKeys().then((k) => setReminded(k.has(`contest:${contestId}`)));
  }, [load, contestId]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/contests" as any));

  if (loading) {
    return (
      <View style={s.container}>
        <Skeleton style={{ height: 320, borderRadius: 0, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }} />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton style={{ height: 110, borderRadius: 20 }} />
          <Skeleton style={{ height: 160, borderRadius: 20 }} />
        </View>
      </View>
    );
  }
  if (!c) {
    return (
      <View style={[s.container, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={[s.backBtn, { marginHorizontal: 16, backgroundColor: Colors.cardBg, borderColor: Colors.border }]} onPress={back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <LoadError onRetry={() => { setLoading(true); load(); }} message={error || "المسابقة غير موجودة"} hint="قد تكون حُذفت، أو أن الاتصال انقطع." />
      </View>
    );
  }

  const t = themeOf(c);
  const tiers = prizeTiers(c);
  const answered = answers.filter((a) => a >= 0).length;
  const caption = (winner?: string) =>
    `${winner ? `🏆 مبروك ${winner} الفوز في «${c.title}»` : `🏆 ${c.title}${tiers[0] ? `\n🎁 الجائزة: ${tiers[0]}` : ""}\nشارك قبل ${new Date(c.ends_at).toLocaleDateString("ar-EG")}`}\n${publicContestUrl(c.id)}\n\n${HASHTAGS} #مسابقات\n${APP_INVITE}`;

  const submit = async () => {
    if (!token || isGuest) { notify("تسجيل مطلوب", "سجّل الدخول لتشارك في المسابقة."); router.push("/login" as any); return; }
    if (c.type === "quiz" && answers.some((a) => a < 0)) { notify("أكمل الإجابات", `أجبت عن ${answered} من ${answers.length}. أجب عن الباقي ثم أرسل.`); return; }
    if (c.type === "entry" && !content.trim() && !imageUrl.trim()) { notify("مشاركتك", "اكتب مشاركتك أو أرفق صورة."); return; }
    setSending(true);
    try {
      const r = await contestsApi.enter(c.id, token, c.type === "quiz" ? { answers } : { content: content.trim(), image_url: imageUrl.trim() || undefined });
      setCelebrate({ run: Date.now() % 100000, number: r.entry_number, score: r.score, total: r.total });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      load();
    } catch (e: any) {
      notify("تعذّرت المشاركة", e?.message);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadContestImage(`entries/${c.id}/${user?.id ?? "u"}`);
      if (url) setImageUrl(url);
    } catch (e: any) { notify("تعذّر رفع الصورة", e?.message || "حاول مرة أخرى أو الصق رابط الصورة."); }
    finally { setUploading(false); }
  };

  const sharePoster = async () => {
    contestsApi.share(c.id);
    const winner = c.state === "ended" ? c.winners[0]?.name : undefined;
    try {
      await shareViewAsImage(posterRef, { fileName: `contest-${c.id}.png`, caption: caption(winner), width: 1080, height: 1080, dialogTitle: "مشاركة المسابقة" });
    } catch { notify("تعذّرت المشاركة", "حاول مرة أخرى."); }
  };

  const shareTo = (target: "whatsapp" | "facebook" | "x" | "telegram") => {
    contestsApi.share(c.id);
    openExternal(socialShareUrl(target, publicContestUrl(c.id), caption(c.state === "ended" ? c.winners[0]?.name : undefined)));
  };

  const remind = async () => {
    const r = await toggleReminder(`contest:${c.id}`, "بدأت المسابقة", `${c.title}، ادخل الآن وشارك.`, c.starts_at);
    setReminded(r.on);
    if (r.on) notify("سنذكّرك", Platform.OS === "web" ? "حفظنا اختيارك. التذكيرات تصل من تطبيق الهاتف." : r.scheduled ? "يصلك إشعار يوم البدء." : "حفظنا اختيارك. اسمح بالإشعارات ليصلك التنبيه.");
  };

  const canEnter = c.state === "active" && !c.mine;
  const steps = c.type === "quiz"
    ? [
      `أجب عن ${c.questions.length === 2 ? "سؤالين" : qCount(c.questions.length)} باختيار إجابة واحدة لكل سؤال.`,
      `أرسل إجاباتك قبل ${arDateTime(c.ends_at)}. يُسمح بمشاركة واحدة.`,
      "تظهر نتيجتك فور الإرسال، والإجابات الصحيحة بعد انتهاء المسابقة.",
      `يفوز ${c.winners_count > 1 ? `أعلى ${c.winners_count} درجات` : "صاحب أعلى درجة"}، وعند التعادل تُجرى قرعة عادلة.`,
    ]
    : [
      c.entry_prompt || "اكتب مشاركتك أو أرفق صورة.",
      `أرسل مشاركتك قبل ${arDateTime(c.ends_at)}. يُسمح بمشاركة واحدة.`,
      `تختار لجنة المسابقة ${c.winners_count > 1 ? `${c.winners_count} فائزين` : "الفائز"} وتُعلن النتائج هنا ويصل الفائزين إشعار.`,
    ];
  const terms = (c.terms || "").split(/\n+/).map((x) => x.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean);
  const podium = c.winners.slice(0, 3).map((w, i) => ({ ...w, rank: w.rank ?? i + 1, sub: tiers.length > 1 ? tiers[(w.rank ?? i + 1) - 1] ?? null : null }));

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* ── الواجهة ── */}
        <View style={s.hero}>
          <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {c.cover_image ? (
            <>
              <Image source={{ uri: c.cover_image }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0.88)"]} style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <>
              <View style={[s.ring, { width: 300, height: 300, top: -120, left: -110, borderColor: t.accent }]} />
              <Ionicons name={t.icon as any} size={150} color={t.accent} style={{ position: "absolute", left: 10, bottom: 10, opacity: 0.1 }} />
            </>
          )}
          <View style={[s.heroTop, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={s.backBtn} onPress={back} accessibilityRole="button" accessibilityLabel="رجوع" hitSlop={6}>
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={s.backBtn} onPress={() => Share.share({ message: caption() }).catch(() => {})} accessibilityRole="button" accessibilityLabel="مشاركة المسابقة" hitSlop={6}>
              <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={s.heroBody}>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <StatusPill state={c.state} />
              <CategoryChip category={c.category} onDark />
              <View style={s.glassChip}>
                <Ionicons name={c.type === "quiz" ? "help-circle-outline" : "images-outline"} size={13} color="#FFFFFF" />
                <Text style={s.glassChipText}>{c.type === "quiz" ? qCount(c.questions.length) : "مشاركة نص أو صورة"}</Text>
              </View>
            </View>
            {c.sponsor_name ? <SponsorChip name={c.sponsor_name} logo={c.sponsor_logo} onDark /> : (
              <Text style={[s.kind, { color: t.accent }]}>{t.label}</Text>
            )}
            <Text style={s.heroTitle}>{c.title}</Text>
            {c.state !== "ended" ? (
              <View style={{ gap: 8 }}>
                <Text style={s.heroWhen}>{c.state === "active" ? "تنتهي خلال" : "تبدأ خلال"}</Text>
                <Countdown to={c.state === "active" ? c.ends_at : c.starts_at} now={now} />
                {c.state === "active" ? <TimeBar ratio={elapsedRatio(c, now)} onDark color={t.accent} /> : null}
              </View>
            ) : (
              <Text style={s.heroWhen}>انتهت في {arDate(c.ends_at)}</Text>
            )}
            <View style={s.statsRow}>
              <HeroStat icon="people-outline" n={String(c.entries_count)} label="مشارك" />
              <HeroStat icon="trophy-outline" n={String(c.winners_count)} label={c.winners_count > 1 ? "فائزين" : "فائز"} />
              <HeroStat icon="eye-outline" n={views == null ? "—" : formatViews(views)} label="مشاهدة" />
              <HeroStat icon="share-social-outline" n={String(c.shares)} label="نشر" />
            </View>
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          {/* ── احتفال بعد الإرسال ── */}
          {celebrate ? (
            <LinearGradient colors={["#006B4A", "#004D36"]} style={s.celebrate}>
              <Ionicons name="sparkles" size={30} color="#FCD34D" />
              <Text style={s.celebrateTitle}>تم تسجيل مشاركتك</Text>
              {celebrate.number ? <Text style={s.celebrateNum}>مشاركتك رقم {celebrate.number}</Text> : null}
              {celebrate.total != null ? <Text style={s.celebrateBody}>نتيجتك {celebrate.score} من {celebrate.total}. تظهر الإجابات الصحيحة بعد انتهاء المسابقة.</Text> : (
                <Text style={s.celebrateBody}>تُعلن النتائج هنا بعد انتهاء المسابقة، ويصلك إشعار إن فزت.</Text>
              )}
              <TouchableOpacity style={s.celebrateBtn} onPress={sharePoster} accessibilityRole="button">
                <Ionicons name="share-social" size={18} color="#1F1300" />
                <Text style={s.celebrateBtnText}>ادعُ أصدقاءك للمشاركة</Text>
              </TouchableOpacity>
            </LinearGradient>
          ) : null}

          {/* ── مشاركتي ── */}
          {c.mine && !celebrate && (
            <View style={[s.card, c.mine.is_winner ? { backgroundColor: Colors.accentSoft, borderColor: Colors.accent + "66" } : { backgroundColor: Colors.primarySoft, borderColor: Colors.primary + "40" }]}>
              <View style={s.row}>
                <Ionicons name={c.mine.is_winner ? "trophy" : "checkmark-circle"} size={22} color={c.mine.is_winner ? Colors.accentDeep : Colors.primaryDeep} />
                <Text style={[s.section, { flex: 1, color: c.mine.is_winner ? Colors.accentDeep : Colors.primaryDeep }]}>
                  {c.mine.is_winner ? `مبروك! فزت بالمركز ${c.mine.rank ?? 1}` : "شاركت في هذه المسابقة"}
                </Text>
              </View>
              {c.mine.entry_number ? <Text style={s.body}>مشاركتك رقم {c.mine.entry_number} من {c.entries_count}</Text> : null}
              {c.mine.is_winner && tiers.length ? <Text style={s.body}>جائزتك: {tiers.length > 1 ? tiers[(c.mine.rank ?? 1) - 1] ?? tiers[0] : tiers[0]}</Text> : null}
              {c.type === "quiz" ? <Text style={s.body}>نتيجتك: {c.mine.score} من {c.questions.length}</Text> : null}
              {c.mine.content ? <Text style={s.body}>{c.mine.content}</Text> : null}
              {c.mine.image_url ? <Image source={{ uri: c.mine.image_url }} style={s.entryImg} contentFit="cover" accessibilityLabel="صورة مشاركتك" /> : null}
              {c.state === "ended" && !c.mine.is_winner ? (
                <Text style={s.muted}>{c.winners.length ? "لم تفُز هذه المرة. تابع المسابقات القادمة." : "بانتظار إعلان الفائزين."}</Text>
              ) : null}
            </View>
          )}

          {/* ── الفائزون ── */}
          {c.winners.length > 0 && (
            <View style={s.card}>
              <View style={s.row}><Ionicons name="trophy" size={18} color={Colors.accentDeep} /><Text style={s.section}>الفائزون</Text></View>
              <Podium items={podium} onPress={(uid) => router.push({ pathname: "/profile" as any, params: { id: String(uid) } })} />
              {c.winners.slice(3).map((w, i) => (
                <TouchableOpacity key={w.user_id} style={s.winRow} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(w.user_id) } })} accessibilityRole="button">
                  <Text style={s.rank}>{w.rank ?? i + 4}</Text>
                  <UserAvatar name={w.name} avatarUrl={w.avatar_url} size={36} borderRadius={18} />
                  <Text style={[s.winName, { flex: 1 }]} numberOfLines={1}>{w.name}</Text>
                  {tiers[(w.rank ?? i + 4) - 1] && tiers.length > 1 ? <Text style={s.prizeSmall} numberOfLines={1}>{tiers[(w.rank ?? i + 4) - 1]}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── الجوائز ── */}
          {tiers.length > 0 && (
            <View style={s.card}>
              <View style={s.row}><Ionicons name="gift-outline" size={18} color={Colors.accentDeep} /><Text style={s.section}>الجوائز</Text></View>
              {tiers.map((p, i) => (
                <View key={i} style={[s.tier, i === 0 && { borderColor: Colors.accent + "88", backgroundColor: Colors.accentSoft }]}>
                  <View style={[s.tierMedal, { backgroundColor: ["#F2C94C", "#CBD5E1", "#E3B583"][i] ?? Colors.border }]}>
                    <Ionicons name={i === 0 ? "trophy" : "medal"} size={16} color="#1F1300" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tierRank}>{tiers.length === 1 && c.winners_count > 1 ? `لكل فائز (${c.winners_count} فائزين)` : RANK_LABEL[i] ?? `المركز ${i + 1}`}</Text>
                    <Text style={s.tierPrize}>{p}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── الراعي ── */}
          {c.sponsor_name ? (
            <View style={[s.card, s.row, { gap: 12 }]}>
              {c.sponsor_logo ? (
                <Image source={{ uri: c.sponsor_logo }} style={s.sponsorLogo} contentFit="contain" accessibilityLabel={`شعار ${c.sponsor_name}`} />
              ) : (
                <View style={[s.sponsorLogo, { alignItems: "center", justifyContent: "center", backgroundColor: Colors.accentSoft }]}><Ionicons name="ribbon" size={26} color={Colors.accentDeep} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.mutedSmall}>الراعي الرسمي</Text>
                <Text style={s.section}>{c.sponsor_name}</Text>
                <Text style={s.muted}>شكراً لدعم مسابقات مدينتنا.</Text>
              </View>
            </View>
          ) : null}

          {c.description ? (
            <View style={s.card}>
              <Text style={s.section}>عن المسابقة</Text>
              <Text style={s.body}>{c.description}</Text>
            </View>
          ) : null}

          {/* ── خطوات المشاركة والشروط ── */}
          <View style={s.card}>
            <Text style={s.section}>كيف تشارك</Text>
            {steps.map((x, i) => <Step key={i} n={i + 1} text={x} />)}
            {terms.length > 0 && (
              <>
                <Text style={[s.section, { marginTop: 4 }]}>الشروط</Text>
                {terms.map((x, i) => <Step key={`t${i}`} n={i + 1} text={x} muted />)}
              </>
            )}
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
              <Text style={s.mutedSmall}>من {arDate(c.starts_at)} إلى {arDate(c.ends_at)}</Text>
            </View>
          </View>

          {/* ── المشاركون ── */}
          <View style={[s.card, s.row, { justifyContent: "space-between" }]}>
            <AvatarStack people={c.participants ?? []} total={c.entries_count} size={32} />
            {c.state === "active" && !c.mine ? <Text style={s.mutedSmall}>انضم إليهم</Text> : null}
          </View>

          {/* ── قادمة: تذكير ── */}
          {c.state === "upcoming" && (
            <TouchableOpacity style={[s.primary, reminded && s.ghost]} onPress={remind} accessibilityRole="button" accessibilityState={{ selected: reminded }}>
              <Ionicons name={reminded ? "notifications-off-outline" : "notifications-outline"} size={18} color={reminded ? Colors.primaryDeep : "#FFFFFF"} />
              <Text style={[s.primaryText, reminded && { color: Colors.primaryDeep }]}>{reminded ? "إلغاء التذكير" : "ذكّرني عند البدء"}</Text>
            </TouchableOpacity>
          )}

          {/* ── الأسئلة: بعد الانتهاء تظهر الإجابات الصحيحة ── */}
          {c.type === "quiz" && (canEnter || c.state === "ended") && c.questions.length > 0 && (
            <View style={{ gap: 10 }}>
              {canEnter ? (
                <View style={{ gap: 6 }}>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <Text style={s.section}>الأسئلة</Text>
                    <Text style={s.mutedSmall}>أجبت عن {answered} من {c.questions.length}</Text>
                  </View>
                  <TimeBar ratio={c.questions.length ? answered / c.questions.length : 0} />
                </View>
              ) : <Text style={s.section}>الأسئلة والإجابات الصحيحة</Text>}
              {c.questions.map((q, qi) => (
                <View key={q.id} style={s.card}>
                  <View style={s.row}>
                    <View style={s.qNum}><Text style={s.qNumText}>{qi + 1}</Text></View>
                    <Text style={[s.qTitle, { flex: 1 }]}>{q.question}</Text>
                  </View>
                  {q.options.map((o, oi) => {
                    const picked = c.mine ? c.mine.answers?.[qi] === oi : answers[qi] === oi;
                    const correct = q.correct_index === oi;
                    const ended = c.state === "ended";
                    return (
                      <TouchableOpacity
                        key={oi}
                        disabled={!canEnter}
                        onPress={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                        style={[s.opt, picked && s.optOn, ended && correct && s.optCorrect, ended && picked && !correct && s.optWrong]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: picked, disabled: !canEnter }}
                      >
                        <Ionicons name={picked ? "radio-button-on" : "radio-button-off"} size={20} color={picked ? Colors.primaryDeep : Colors.textMuted} />
                        <Text style={[s.optText, picked && { color: Colors.primaryDeep }]}>{o}</Text>
                        {ended && correct ? <Ionicons name="checkmark-circle" size={20} color={Colors.primaryDeep} accessibilityLabel="الإجابة الصحيحة" /> : null}
                        {ended && picked && !correct ? <Ionicons name="close-circle" size={20} color={Colors.danger} accessibilityLabel="إجابتك" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {c.type === "entry" && canEnter && (
            <View style={s.card}>
              <Text style={s.section}>مشاركتك</Text>
              {c.entry_prompt ? <Text style={s.muted}>{c.entry_prompt}</Text> : null}
              <Text style={s.label}>النص</Text>
              <TextInput style={[s.input, { height: 120, textAlignVertical: "top", paddingTop: 10 }]} value={content} onChangeText={setContent} multiline placeholder="اكتب مشاركتك…" placeholderTextColor={Colors.textMuted} textAlign="right" maxLength={2000} accessibilityLabel="نص المشاركة" />
              <Text style={s.mutedSmall}>{content.length}/2000</Text>
              <Text style={s.label}>صورة (اختياري)</Text>
              {imageUrl ? (
                <View style={{ gap: 8 }}>
                  <Image source={{ uri: imageUrl }} style={s.entryImg} contentFit="cover" accessibilityLabel="معاينة الصورة" />
                  <TouchableOpacity style={s.ghost} onPress={() => setImageUrl("")} accessibilityRole="button"><Text style={[s.primaryText, { color: Colors.danger, fontSize: 14 }]}>إزالة الصورة</Text></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.ghost} onPress={pickImage} disabled={uploading} accessibilityRole="button">
                  {uploading ? <ActivityIndicator color={Colors.primaryDeep} /> : <Ionicons name="image-outline" size={18} color={Colors.primaryDeep} />}
                  <Text style={[s.primaryText, { color: Colors.primaryDeep, fontSize: 14 }]}>{uploading ? "جارٍ الرفع…" : "اختر صورة من جهازك"}</Text>
                </TouchableOpacity>
              )}
              <TextInput style={s.input} value={imageUrl} onChangeText={setImageUrl} placeholder="أو الصق رابط صورة يبدأ بـ https://" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType={Platform.OS === "ios" ? "url" : "default"} accessibilityLabel="رابط الصورة" />
            </View>
          )}

          {canEnter && (
            <TouchableOpacity style={[s.primary, s.primaryBig, sending && { opacity: 0.7 }]} onPress={submit} disabled={sending} accessibilityRole="button">
              {sending ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                  <Text style={s.primaryText}>{!token || isGuest ? "سجّل الدخول لتشارك" : c.type === "quiz" ? "إرسال الإجابات" : "إرسال المشاركة"}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── النشر على مواقع التواصل ── */}
          <View style={s.card}>
            <Text style={s.section}>انشر المسابقة وادعُ أصدقاءك</Text>
            <View style={{ alignItems: "center" }}>
              <ContestPoster ref={posterRef} contest={c} winnerName={c.state === "ended" ? c.winners[0]?.name : null} />
            </View>
            <TouchableOpacity style={s.primary} onPress={sharePoster} accessibilityRole="button">
              <Ionicons name="share-social" size={18} color="#FFFFFF" />
              <Text style={s.primaryText}>مشاركة الملصق</Text>
            </TouchableOpacity>
            <View style={s.socialRow}>
              {([
                ["whatsapp", "logo-whatsapp", "#128C4A", "واتساب"], ["facebook", "logo-facebook", "#1877F2", "فيسبوك"],
                ["x", "logo-twitter", "#111827", "إكس"], ["telegram", "paper-plane", "#1A7FB8", "تيليجرام"],
              ] as const).map(([k, icon, color, name]) => (
                <TouchableOpacity key={k} style={s.socialItem} onPress={() => shareTo(k)} accessibilityRole="button" accessibilityLabel={`مشاركة على ${name}`}>
                  <View style={[s.social, { backgroundColor: color }]}><Ionicons name={icon as any} size={22} color="#FFFFFF" /></View>
                  <Text style={s.socialText}>{name}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.socialItem} onPress={() => Share.share({ message: caption() }).catch(() => {})} accessibilityRole="button" accessibilityLabel="مشاركة بطريقة أخرى">
                <View style={[s.social, { backgroundColor: "#4B5563" }]}><Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" /></View>
                <Text style={s.socialText}>المزيد</Text>
              </TouchableOpacity>
            </View>
          </View>

          {c.canManage ? (
            <TouchableOpacity style={s.ghost} onPress={() => router.push({ pathname: "/contests-admin" as any, params: { edit: String(c.id) } })} accessibilityRole="button">
              <Ionicons name="create-outline" size={18} color={Colors.primaryDeep} />
              <Text style={[s.primaryText, { color: Colors.primaryDeep, fontSize: 14 }]}>تعديل المسابقة وإدارة المشاركات</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      <Confetti run={celebrate?.run ?? 0} />
    </View>
  );
}

function HeroStat({ icon, n, label }: { icon: keyof typeof Ionicons.glyphMap; n: string; label: string }) {
  return (
    <View style={s.heroStat} accessibilityLabel={`${n} ${label}`}>
      <Ionicons name={icon} size={16} color="#FFFFFF" />
      <Text style={s.heroStatNum}>{n}</Text>
      <Text style={s.heroStatLabel}>{label}</Text>
    </View>
  );
}

function Step({ n, text, muted }: { n: number; text: string; muted?: boolean }) {
  return (
    <View style={[s.row, { alignItems: "flex-start", gap: 10 }]}>
      <View style={[s.stepNum, muted && { backgroundColor: Colors.bg, borderColor: Colors.border }]}>
        <Text style={[s.stepNumText, muted && { color: Colors.textSecondary }]}>{n}</Text>
      </View>
      <Text style={[s.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 24, opacity: 0.1 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, gap: 10 },
  heroBody: { padding: 18, paddingTop: 12, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  glassChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 26, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.30)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  glassChipText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#FFFFFF" },
  kind: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, lineHeight: 40, color: "#FFFFFF", textAlign: "right" },
  heroWhen: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "rgba(255,255,255,0.92)", textAlign: "right" },
  statsRow: { flexDirection: "row-reverse", gap: 8, marginTop: 2 },
  heroStat: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.25)" },
  heroStatNum: { fontFamily: "Cairo_700Bold", fontSize: 16, lineHeight: 24, color: "#FFFFFF" },
  heroStatLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.88)" },
  celebrate: { borderRadius: 24, padding: 18, gap: 8, alignItems: "center" },
  celebrateTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#FFFFFF" },
  celebrateNum: { fontFamily: "Cairo_700Bold", fontSize: 26, lineHeight: 38, color: "#FCD34D" },
  celebrateBody: { fontFamily: "Cairo_500Medium", fontSize: 14, lineHeight: 24, color: "#FFFFFF", textAlign: "center" },
  celebrateBtn: { marginTop: 6, minHeight: 48, alignSelf: "stretch", borderRadius: 14, backgroundColor: "#FCD34D", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  celebrateBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#1F1300" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 26, color: Colors.textSecondary, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  mutedSmall: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  tier: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  tierMedal: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  tierRank: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  tierPrize: { fontFamily: "Cairo_700Bold", fontSize: 15, lineHeight: 24, color: Colors.text, textAlign: "right" },
  sponsorLogo: { width: 60, height: 60, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.border },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primarySoft, borderWidth: 1, borderColor: Colors.primary + "44", marginTop: 1 },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 13, lineHeight: 18, color: Colors.primaryDeep },
  qNum: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primarySoft },
  qNumText: { fontFamily: "Cairo_700Bold", fontSize: 14, lineHeight: 20, color: Colors.primaryDeep },
  qTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right", lineHeight: 26 },
  opt: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 50, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border },
  optOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optCorrect: { borderColor: Colors.primary, borderWidth: 2 },
  optWrong: { borderColor: Colors.danger, backgroundColor: Colors.dangerSoft },
  optText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
  entryImg: { width: "100%", height: 200, borderRadius: 14, backgroundColor: Colors.bg },
  primary: { minHeight: 50, borderRadius: 14, backgroundColor: "#006B4A", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  primaryBig: { minHeight: 56, borderRadius: 18 },
  ghost: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + "55", backgroundColor: Colors.primarySoft, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14 },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#FFFFFF" },
  socialRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 4 },
  socialItem: { alignItems: "center", gap: 4, minWidth: 52 },
  social: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  socialText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  winRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, backgroundColor: Colors.bg },
  rank: { width: 26, fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.accentDeep, textAlign: "center" },
  winName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  prizeSmall: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.accentDeep, maxWidth: 140 },
});
