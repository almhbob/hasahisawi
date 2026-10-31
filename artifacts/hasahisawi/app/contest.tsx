import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Share, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { contestsApi, themeOf, timeLeft, publicContestUrl, type ContestDetail } from "@/lib/contests";
import ContestPoster from "@/components/contests/ContestPoster";
import UserAvatar from "@/components/UserAvatar";
import { shareViewAsImage } from "@/lib/share-image";
import { APP_INVITE, HASHTAGS } from "@/constants/app-invite";
import { notify, openExternal, socialShareUrl } from "@/lib/xplatform";

export default function ContestScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const contestId = Number(id);
  const { token, isGuest } = useAuth();
  const [c, setC] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<number[]>([]);
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sending, setSending] = useState(false);
  const posterRef = useRef<View>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(contestId)) { setLoading(false); return; }
    try {
      const d = await contestsApi.get(contestId, token);
      setC(d);
      setAnswers((a) => (a.length === d.questions.length ? a : d.questions.map(() => -1)));
    } catch (e: any) {
      notify("تعذّر التحميل", e?.message);
    } finally {
      setLoading(false);
    }
  }, [contestId, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={[s.container, { justifyContent: "center" }]}><ActivityIndicator color={Colors.primary} /></View>;
  if (!c) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><Text style={s.muted}>المسابقة غير موجودة</Text></View>;

  const t = themeOf(c);
  const caption = (winner?: string) =>
    `${winner ? `🏆 مبروك ${winner} الفوز في «${c.title}»` : `🏆 ${c.title}${c.prize ? `\n🎁 الجائزة: ${c.prize}` : ""}\nشارك قبل ${new Date(c.ends_at).toLocaleDateString("ar-EG")}`}\n${publicContestUrl(c.id)}\n\n${HASHTAGS} #مسابقات\n${APP_INVITE}`;

  const submit = async () => {
    if (!token || isGuest) { notify("تسجيل مطلوب", "سجّل الدخول لتشارك في المسابقة."); return; }
    if (c.type === "quiz" && answers.some((a) => a < 0)) { notify("أكمل الإجابات", "أجب عن جميع الأسئلة."); return; }
    if (c.type === "entry" && !content.trim() && !imageUrl.trim()) { notify("مشاركتك", "اكتب مشاركتك أو أضف رابط صورة."); return; }
    setSending(true);
    try {
      const r = await contestsApi.enter(c.id, token, c.type === "quiz" ? { answers } : { content: content.trim(), image_url: imageUrl.trim() || undefined });
      notify("تم تسجيل مشاركتك 🎉", r.total != null ? `نتيجتك: ${r.score} من ${r.total}. شارك المسابقة مع أصدقائك!` : "حظاً موفقاً! شارك المسابقة مع أصدقائك.");
      load();
    } catch (e: any) {
      notify("تعذّرت المشاركة", e?.message);
    } finally {
      setSending(false);
    }
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

  const canEnter = c.state === "active" && !c.mine;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 8 }]}>
          <View style={s.heroTop}>
            <TouchableOpacity style={s.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/contests" as any))} accessibilityLabel="رجوع">
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={[s.kind, { color: t.accent }]} numberOfLines={1}>
              {c.kind === "sponsored" && c.sponsor_name ? `برعاية ${c.sponsor_name}` : t.label}
            </Text>
          </View>
          <Ionicons name={t.icon as any} size={40} color={t.accent} style={{ alignSelf: "flex-end" }} />
          <Text style={s.heroTitle}>{c.title}</Text>
          {c.prize ? <View style={[s.prize, { backgroundColor: t.accent }]}><Text style={s.prizeText}>🎁 الجائزة: {c.prize}</Text></View> : null}
          <Text style={s.heroMeta}>
            {c.state === "upcoming" ? "تبدأ قريباً" : c.state === "ended" ? "انتهت المسابقة" : timeLeft(c.ends_at)} · {c.entries_count} مشارك · {c.winners_count} {c.winners_count > 1 ? "فائزين" : "فائز"}
          </Text>
        </LinearGradient>

        <View style={{ padding: 16, gap: 14 }}>
          {c.description ? <Text style={s.body}>{c.description}</Text> : null}

          {/* الفائزون */}
          {c.winners.length > 0 && (
            <View style={s.card}>
              <Text style={s.section}>🏆 الفائزون</Text>
              {c.winners.map((w) => (
                <TouchableOpacity key={w.user_id} style={s.winRow} onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(w.user_id) } })}>
                  <Text style={s.rank}>{w.rank ?? "—"}</Text>
                  <UserAvatar name={w.name} avatarUrl={w.avatar_url} size={36} borderRadius={12} />
                  <Text style={[s.winName, { flex: 1 }]}>{w.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* مشاركتي */}
          {c.mine && (
            <View style={[s.card, { backgroundColor: Colors.primarySoft, borderColor: Colors.primary + "40" }]}>
              <Text style={[s.section, { color: Colors.primary }]}>
                {c.mine.is_winner ? `🎉 فزت بالمركز ${c.mine.rank}!` : "✓ شاركت في هذه المسابقة"}
              </Text>
              {c.type === "quiz" ? <Text style={s.body}>نتيجتك: {c.mine.score} من {c.questions.length}</Text> : null}
              {c.mine.content ? <Text style={s.body}>{c.mine.content}</Text> : null}
            </View>
          )}

          {/* الأسئلة: بعد الانتهاء تظهر الإجابات الصحيحة */}
          {c.type === "quiz" && (canEnter || c.state === "ended") && c.questions.map((q, qi) => (
            <View key={q.id} style={s.card}>
              <Text style={s.qTitle}>{qi + 1}. {q.question}</Text>
              {q.options.map((o, oi) => {
                const picked = c.mine ? c.mine.answers?.[qi] === oi : answers[qi] === oi;
                const correct = q.correct_index === oi;
                return (
                  <TouchableOpacity
                    key={oi}
                    disabled={!canEnter}
                    onPress={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                    style={[s.opt, picked && s.optOn, c.state === "ended" && correct && s.optCorrect]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked }}
                  >
                    <Ionicons name={picked ? "radio-button-on" : "radio-button-off"} size={18} color={picked ? Colors.primary : Colors.textMuted} />
                    <Text style={[s.optText, picked && { color: Colors.primary }]}>{o}</Text>
                    {c.state === "ended" && correct ? <Ionicons name="checkmark-circle" size={18} color={Colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {c.type === "entry" && canEnter && (
            <View style={s.card}>
              <Text style={s.section}>مشاركتك</Text>
              {c.entry_prompt ? <Text style={s.muted}>{c.entry_prompt}</Text> : null}
              <TextInput style={[s.input, { height: 110, textAlignVertical: "top", paddingTop: 10 }]} value={content} onChangeText={setContent} multiline placeholder="اكتب مشاركتك…" placeholderTextColor={Colors.textMuted} textAlign="right" maxLength={2000} />
              <TextInput style={s.input} value={imageUrl} onChangeText={setImageUrl} placeholder="رابط صورة (اختياري، يبدأ بـ https://)" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" keyboardType={Platform.OS === "ios" ? "url" : "default"} />
            </View>
          )}

          {canEnter && (
            <TouchableOpacity style={[s.primary, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
              {sending ? <ActivityIndicator color={Colors.onColor} /> : <Text style={s.primaryText}>{c.type === "quiz" ? "إرسال الإجابات" : "إرسال المشاركة"}</Text>}
            </TouchableOpacity>
          )}

          {/* المشاركة على مواقع التواصل */}
          <View style={s.card}>
            <Text style={s.section}>انشر المسابقة وادعُ أصدقاءك</Text>
            <View style={{ alignItems: "center" }}>
              <ContestPoster ref={posterRef} contest={c} winnerName={c.state === "ended" ? c.winners[0]?.name : null} />
            </View>
            <TouchableOpacity style={s.primary} onPress={sharePoster}>
              <Ionicons name="share-social" size={18} color={Colors.onColor} />
              <Text style={s.primaryText}>مشاركة الملصق</Text>
            </TouchableOpacity>
            <View style={s.socialRow}>
              {([
                ["whatsapp", "logo-whatsapp", "#25D366"], ["facebook", "logo-facebook", "#1877F2"],
                ["x", "logo-twitter", "#111827"], ["telegram", "paper-plane", "#229ED9"],
              ] as const).map(([k, icon, color]) => (
                <TouchableOpacity key={k} style={[s.social, { backgroundColor: color }]} onPress={() => shareTo(k)} accessibilityLabel={`مشاركة على ${k}`}>
                  <Ionicons name={icon as any} size={22} color="#FFFFFF" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[s.social, { backgroundColor: Colors.textSecondary }]} onPress={() => Share.share({ message: caption() }).catch(() => {})} accessibilityLabel="مشاركة بطريقة أخرى">
                <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {c.terms ? (
            <View style={s.card}><Text style={s.section}>الشروط</Text><Text style={s.body}>{c.terms}</Text></View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 18, paddingBottom: 22, gap: 10, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  kind: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "left" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, lineHeight: 40, color: "#FFFFFF", textAlign: "right" },
  heroMeta: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  prize: { alignSelf: "flex-end", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, maxWidth: "100%" },
  prizeText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#1F1300", textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 26, color: Colors.textSecondary, textAlign: "right" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  qTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right", lineHeight: 26 },
  opt: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  optOn: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  optCorrect: { borderColor: Colors.primary, borderWidth: 2 },
  optText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.text, backgroundColor: Colors.bg },
  primary: { height: 50, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.onColor },
  socialRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 12 },
  social: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  winRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, backgroundColor: Colors.bg },
  rank: { width: 26, fontFamily: "Cairo_700Bold", fontSize: 18, color: "#B8892B", textAlign: "center" },
  winName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
});
