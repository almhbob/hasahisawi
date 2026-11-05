// انتخابات اتحاد الطلاب: الترشح، الاقتراع السري، التحقق بالإيصال، النتائج، وسجل الشفافية
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Modal, Pressable, useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, copyText } from "@/lib/xplatform";
import { ImageUploadField } from "@/components/union/ImageUploadField";
import {
  unionPlusApi, fmtDay, fmtDayTime, LOG_LABEL,
  type Election, type ElectionPhase, type Candidate, type ResultPosition,
} from "@/lib/union-plus";

const UC = "#1F5C8A";
const UC2 = "#9DBBD6";
const GREEN = "#16A34A";
const GOLD = "#D97706";

const PHASE_COLOR: Record<ElectionPhase, string> = {
  draft: "#64748B", upcoming: "#64748B", nominations: "#2563EB", campaign: "#7C3AED", voting: GREEN, counting: GOLD, results: UC,
};
const STEPS: { key: ElectionPhase[]; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: ["nominations"], label: "الترشح", icon: "person-add-outline" },
  { key: ["campaign"], label: "الحملات", icon: "megaphone-outline" },
  { key: ["voting"], label: "التصويت", icon: "checkbox-outline" },
  { key: ["counting", "results"], label: "النتائج", icon: "podium-outline" },
];
const ORDER: ElectionPhase[] = ["draft", "upcoming", "nominations", "campaign", "voting", "counting", "results"];

export default function StudentUnionElections() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const [list, setList] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(params.id ? Number(params.id) : null);

  const load = useCallback(async () => {
    try { const d = await unionPlusApi.elections(token); setList(d.elections); setErr(null); }
    catch (e: any) { setErr(e?.message || "تعذّر تحميل الانتخابات"); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const open = list.find((e) => e.id === openId) || null;
  const cardW = Math.min(width - 32, 680);
  const back = () => {
    if (open) { setOpenId(null); return; }
    router.canGoBack() ? router.back() : router.replace("/(tabs)/student" as any);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={Colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{open ? open.title : "انتخابات الاتحاد"}</Text>
          <Text style={s.sub}>اتحاد طلاب محلية الحصاحيصا</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14, alignItems: "center" }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}>
        {loading ? <ActivityIndicator color={UC} style={{ marginTop: 50 }} /> : err ? <Text style={s.err}>{err}</Text>
          : open ? <ElectionDetail e={open} width={cardW} token={token} onChanged={load} />
          : !list.length ? (
            <View style={[s.card, { width: cardW, alignItems: "center", paddingVertical: 36, gap: 8 }]}>
              <Ionicons name="file-tray-outline" size={42} color={UC2} />
              <Text style={s.h2}>لا انتخابات معلنة حالياً</Text>
              <Text style={s.muted}>يصلك إشعار عند إعلان الاتحاد عن انتخابات جديدة.</Text>
            </View>
          ) : (
            <>
              <IntegrityCard width={cardW} compact />
              {list.map((e) => (
                <TouchableOpacity key={e.id} activeOpacity={0.9} onPress={() => setOpenId(e.id)} style={[s.card, { width: cardW, gap: 10 }]}>
                  <View style={s.rowBetween}>
                    <PhaseBadge e={e} />
                    <Text style={s.mutedSm}>التصويت {fmtDay(e.voting_start)}</Text>
                  </View>
                  <Text style={s.h2}>{e.title}</Text>
                  <Turnout e={e} />
                  <View style={s.rowBetween}>
                    <Text style={s.mutedSm}>{e.positions.length.toLocaleString("ar-EG")} منصب · {e.positions.reduce((n, p) => n + p.candidates.length, 0).toLocaleString("ar-EG")} مرشح</Text>
                    {e.me?.voted ? <Text style={[s.mutedSm, { color: GREEN, fontFamily: "Cairo_700Bold" }]}>صوّتّ ✓</Text> : <Ionicons name="chevron-back" size={18} color={UC} />}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
      </ScrollView>
    </View>
  );
}

// ═════════════ تفاصيل الانتخاب ═════════════
function ElectionDetail({ e, width, token, onChanged }: { e: Election; width: number; token: string | null; onChanged: () => void }) {
  const [openProg, setOpenProg] = useState<number | null>(null);
  return (
    <>
      <LinearGradient colors={["#0B1F33", UC]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { width }]}>
        <PhaseBadge e={e} light />
        <Text style={s.heroT}>{e.title}</Text>
        {e.description ? <Text style={s.heroD}>{e.description}</Text> : null}
        <Timeline e={e} />
        <View style={s.dates}>
          <DateRow label="الترشح" a={e.nominations_start} b={e.nominations_end} />
          <DateRow label="التصويت" a={e.voting_start} b={e.voting_end} />
        </View>
      </LinearGradient>

      <View style={[s.card, { width }]}><Turnout e={e} big /></View>

      {/* الإجراء الخاص بالمرحلة */}
      {e.phase === "nominations" ? <NominationBox e={e} width={width} token={token} onChanged={onChanged} /> : null}
      {e.phase === "voting" ? <BallotBox e={e} width={width} token={token} onChanged={onChanged} /> : null}
      {(e.phase === "voting" || e.phase === "counting" || e.phase === "results") ? <VerifyBox e={e} width={width} /> : null}
      {e.phase === "counting" ? (
        <View style={[s.card, s.rowR, { width, gap: 10 }]}>
          <Ionicons name="hourglass-outline" size={22} color={GOLD} />
          <Text style={[s.body, { flex: 1 }]}>انتهى التصويت. تُفرز الأصوات آلياً من الصناديق المغلقة، وتظهر النتائج هنا فور إعلانها رسمياً.</Text>
        </View>
      ) : null}
      {e.results ? <ResultsBox e={e} width={width} /> : null}

      {/* المرشحون */}
      {!e.results ? e.positions.map((p) => (
        <View key={p.id} style={[s.card, { width, gap: 10 }]}>
          <View style={s.rowBetween}>
            <Text style={s.h3}>{p.title}</Text>
            <Text style={s.mutedSm}>{p.seats === 1 ? "مقعد واحد" : `${p.seats.toLocaleString("ar-EG")} مقاعد`}</Text>
          </View>
          {!p.candidates.length ? <Text style={s.muted}>{e.phase === "nominations" || e.phase === "upcoming" ? "لم يُعتمد مرشحون بعد." : "لا مرشحين لهذا المنصب."}</Text>
            : p.candidates.map((c) => (
              <View key={c.id} style={s.cand}>
                <View style={s.rowR}>
                  <Avatar c={c} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.candN}>{c.full_name}</Text>
                    <Text style={s.mutedSm} numberOfLines={1}>{[c.institution, c.major].filter(Boolean).join(" · ")}</Text>
                  </View>
                  {c.program ? (
                    <TouchableOpacity onPress={() => setOpenProg(openProg === c.id ? null : c.id)} style={s.progBtn}>
                      <Text style={s.progBtnT}>البرنامج</Text>
                      <Ionicons name={openProg === c.id ? "chevron-up" : "chevron-down"} size={14} color={UC} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {openProg === c.id && c.program ? <Text style={[s.body, s.prog]}>{c.program}</Text> : null}
              </View>
            ))}
        </View>
      )) : null}

      <IntegrityCard width={width} />
      <LogCard e={e} width={width} />
    </>
  );
}

// ═════════════ الترشح ═════════════
function NominationBox({ e, width, token, onChanged }: { e: Election; width: number; token: string | null; onChanged: () => void }) {
  const [pos, setPos] = useState<number | null>(e.positions[0]?.id ?? null);
  const [program, setProgram] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = e.me?.candidacy;

  if (mine) {
    const p = e.positions.find((x) => x.id === mine.position_id);
    const meta = mine.status === "approved" ? { c: GREEN, t: "معتمد — أنت مرشح رسمي" } : mine.status === "rejected" ? { c: "#DC2626", t: "لم يُعتمد" } : { c: GOLD, t: "قيد مراجعة رئاسة الاتحاد" };
    return (
      <View style={[s.card, { width, gap: 6, borderColor: meta.c + "66" }]}>
        <Text style={s.h3}>ترشحي</Text>
        <Text style={s.body}>المنصب: {p?.title ?? "—"}</Text>
        <Text style={[s.body, { color: meta.c, fontFamily: "Cairo_700Bold" }]}>{meta.t}</Text>
        {mine.reject_reason ? <Text style={s.muted}>السبب: {mine.reject_reason}</Text> : null}
      </View>
    );
  }
  if (!e.me?.member) {
    return (
      <View style={[s.card, s.rowR, { width, gap: 10 }]}>
        <Ionicons name="information-circle-outline" size={20} color={UC} />
        <Text style={[s.body, { flex: 1 }]}>الترشح لأعضاء الاتحاد المقبولين. {token ? "قدّم طلب عضوية من «انضم للاتحاد»." : "سجّل الدخول أولاً."}</Text>
      </View>
    );
  }
  const submit = async () => {
    if (!token || !pos) return;
    if (program.trim().length < 30) { notify("البرنامج الانتخابي", "اكتب برنامجك في 30 حرفاً على الأقل."); return; }
    if (!(await confirmAction("تأكيد الترشح", `الترشح لمنصب «${e.positions.find((x) => x.id === pos)?.title}». لا يمكنك الترشح لمنصب آخر في هذا الانتخاب.`, "أرسل الترشح"))) return;
    setBusy(true);
    try { const r = await unionPlusApi.nominate(token, e.id, { position_id: pos, program: program.trim(), photo_url: photo || null }); notify("وصل ترشحك", r.message); onChanged(); }
    catch (x: any) { notify("تعذّر الترشح", x?.message || ""); }
    finally { setBusy(false); }
  };
  return (
    <View style={[s.card, { width, gap: 10, borderColor: "#2563EB55" }]}>
      <View style={s.rowR}><Ionicons name="person-add" size={18} color="#2563EB" /><Text style={s.h3}>باب الترشح مفتوح حتى {fmtDayTime(e.nominations_end)}</Text></View>
      <Text style={s.label}>المنصب</Text>
      <View style={s.wrap}>
        {e.positions.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => setPos(p.id)} style={[s.chip, pos === p.id && s.chipOn]}>
            <Text style={[s.chipT, pos === p.id && { color: "#fff" }]}>{p.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>برنامجك الانتخابي</Text>
      <TextInput value={program} onChangeText={setProgram} multiline maxLength={3000} placeholder="ما الذي ستقدّمه للطلاب؟ اكتب أهدافك وخطواتك بوضوح." placeholderTextColor={Colors.textMuted}
        style={[s.input, { minHeight: 120, textAlignVertical: "top" }]} textAlign="right" />
      <Text style={[s.mutedSm, { textAlign: "left" }]}>{program.trim().length.toLocaleString("ar-EG")} / 30 حرفاً على الأقل</Text>
      <ImageUploadField label="صورتك (اختياري)" value={photo} onChange={setPhoto} folder="union/candidates" aspect={1} />
      <TouchableOpacity onPress={submit} disabled={busy} style={[s.primary, { backgroundColor: "#2563EB" }, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryT}>أرسل الترشح للمراجعة</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ═════════════ ورقة الاقتراع ═════════════
function BallotBox({ e, width, token, onChanged }: { e: Election; width: number; token: string | null; onChanged: () => void }) {
  const [sel, setSel] = useState<Record<number, number[]>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  if (receipt) return <ReceiptCard receipt={receipt} width={width} />;
  if (e.me?.voted) {
    return (
      <View style={[s.card, s.rowR, { width, gap: 10, borderColor: GREEN + "66" }]}>
        <Ionicons name="checkmark-circle" size={26} color={GREEN} />
        <View style={{ flex: 1 }}>
          <Text style={[s.h3, { color: GREEN }]}>صوّتّ ✓</Text>
          <Text style={s.muted}>لكل عضو صوت واحد. تحقّق من احتساب صوتك بالإيصال أدناه.</Text>
        </View>
      </View>
    );
  }
  if (!e.me?.eligible) {
    return (
      <View style={[s.card, s.rowR, { width, gap: 10 }]}>
        <Ionicons name="lock-closed-outline" size={20} color={GOLD} />
        <Text style={[s.body, { flex: 1 }]}>{token ? e.me?.reason || "لست ضمن سجل الناخبين." : "سجّل الدخول بحساب عضويتك للتصويت."}</Text>
      </View>
    );
  }

  const toggle = (posId: number, seats: number, cid: number) => {
    setSel((cur) => {
      const now = cur[posId] || [];
      if (now.includes(cid)) return { ...cur, [posId]: now.filter((x) => x !== cid) };
      if (seats === 1) return { ...cur, [posId]: [cid] };
      if (now.length >= seats) { notify("الحد الأقصى", `يمكنك اختيار ${seats.toLocaleString("ar-EG")} في هذا المنصب.`); return cur; }
      return { ...cur, [posId]: [...now, cid] };
    });
  };
  const cast = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const choices: Record<string, number[]> = {};
      for (const p of e.positions) choices[String(p.id)] = sel[p.id] || [];
      const r = await unionPlusApi.vote(token, e.id, choices);
      setReceipt(r.receipt); setReview(false); onChanged();
    } catch (x: any) { notify("تعذّر التصويت", x?.message || ""); }
    finally { setBusy(false); }
  };

  return (
    <View style={[s.card, { width, gap: 12, borderColor: GREEN + "66" }]}>
      <View style={s.rowR}><Ionicons name="checkbox" size={18} color={GREEN} /><Text style={s.h3}>ورقة الاقتراع — حتى {fmtDayTime(e.voting_end)}</Text></View>
      <Text style={s.muted}>اختر في كل منصب حتى عدد مقاعده. المنصب الذي تتركه فارغاً يُحتسب ورقة بيضاء.</Text>
      {e.positions.map((p) => (
        <View key={p.id} style={{ gap: 8 }}>
          <View style={s.rowBetween}>
            <Text style={s.h3}>{p.title}</Text>
            <Text style={s.mutedSm}>{(sel[p.id]?.length || 0).toLocaleString("ar-EG")} / {p.seats.toLocaleString("ar-EG")}</Text>
          </View>
          {p.candidates.map((c) => {
            const on = (sel[p.id] || []).includes(c.id);
            return (
              <TouchableOpacity key={c.id} onPress={() => toggle(p.id, p.seats, c.id)} style={[s.ballotRow, on && { borderColor: GREEN, backgroundColor: Colors.bg }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={[s.box, on && { backgroundColor: GREEN, borderColor: GREEN }]}>{on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</View>
                <Avatar c={c} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={s.candN}>{c.full_name}</Text>
                  {c.institution ? <Text style={s.mutedSm} numberOfLines={1}>{c.institution}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <TouchableOpacity onPress={() => setReview(true)} style={[s.primary, { backgroundColor: GREEN }]}>
        <Text style={s.primaryT}>مراجعة اختياراتي</Text>
      </TouchableOpacity>

      <Modal visible={review} transparent animationType="fade" onRequestClose={() => setReview(false)}>
        <Pressable style={s.overlay} onPress={() => !busy && setReview(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.h2}>راجع صوتك قبل الإرسال</Text>
            <Text style={s.muted}>لا يمكن تعديل الصوت بعد إرساله.</Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {e.positions.map((p) => {
                const names = (sel[p.id] || []).map((id) => p.candidates.find((c) => c.id === id)?.full_name).filter(Boolean);
                return (
                  <View key={p.id} style={s.reviewRow}>
                    <Text style={s.label}>{p.title}</Text>
                    <Text style={[s.body, !names.length && { color: Colors.textMuted }]}>{names.length ? names.join("، ") : "ورقة بيضاء"}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={[s.rowR, { gap: 10 }]}>
              <TouchableOpacity onPress={cast} disabled={busy} style={[s.primary, { flex: 1, backgroundColor: GREEN }, busy && { opacity: 0.6 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryT}>أرسل صوتي</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setReview(false)} disabled={busy} style={[s.ghost, { flex: 1 }]}><Text style={s.ghostT}>تعديل</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ReceiptCard({ receipt, width }: { receipt: string; width: number }) {
  return (
    <View style={[s.card, { width, gap: 10, alignItems: "center", borderColor: GREEN, borderWidth: 1.5 }]}>
      <Ionicons name="shield-checkmark" size={40} color={GREEN} />
      <Text style={[s.h2, { color: GREEN }]}>سُجّل صوتك</Text>
      <Text style={s.muted}>إيصالك السري:</Text>
      <Text selectable style={s.receipt}>{receipt}</Text>
      <TouchableOpacity onPress={async () => { const r = await copyText(receipt); if (r === "copied") notify("نُسخ الإيصال"); }} style={[s.ghost, s.rowR, { gap: 6, paddingHorizontal: 18 }]}>
        <Ionicons name="copy-outline" size={16} color={UC} /><Text style={s.ghostT}>نسخ الإيصال</Text>
      </TouchableOpacity>
      <View style={[s.rowR, { gap: 8, backgroundColor: Colors.bg, padding: 12, borderRadius: 12 }]}>
        <Ionicons name="warning-outline" size={18} color={GOLD} />
        <Text style={[s.body, { flex: 1 }]}>احفظ الإيصال الآن، فلن يظهر مرة أخرى. به تتحقق أن صوتك محتسب، ولا يكشف لأحد من اخترت.</Text>
      </View>
    </View>
  );
}

// ═════════════ التحقق بالإيصال ═════════════
function VerifyBox({ e, width }: { e: Election; width: number }) {
  const [code, setCode] = useState("");
  const [res, setRes] = useState<null | { counted: boolean; fingerprint: string }>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { setRes(await unionPlusApi.verify(e.id, code)); }
    catch (x: any) { notify("تنبيه", x?.message || ""); setRes(null); }
    finally { setBusy(false); }
  };
  return (
    <View style={[s.card, { width, gap: 8 }]}>
      <View style={s.rowR}><Ionicons name="search-outline" size={18} color={UC} /><Text style={s.h3}>تحقّق من احتساب صوتك</Text></View>
      <View style={[s.rowR, { gap: 8 }]}>
        <TextInput value={code} onChangeText={(t) => { setCode(t); setRes(null); }} placeholder="A1B2-C3D4-E5F6" placeholderTextColor={Colors.textMuted} autoCapitalize="characters"
          style={[s.input, { flex: 1, letterSpacing: 1.5, textAlign: "center" }]} />
        <TouchableOpacity onPress={check} disabled={busy || code.replace(/[^0-9a-f]/gi, "").length < 12} style={[s.primary, { paddingHorizontal: 18, backgroundColor: UC }, (busy || code.replace(/[^0-9a-f]/gi, "").length < 12) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryT}>تحقّق</Text>}
        </TouchableOpacity>
      </View>
      {res ? (
        <View style={[s.rowR, { gap: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.bg }]}>
          <Ionicons name={res.counted ? "checkmark-circle" : "close-circle"} size={20} color={res.counted ? GREEN : "#DC2626"} />
          <Text style={[s.body, { flex: 1, color: res.counted ? GREEN : "#DC2626", fontFamily: "Cairo_700Bold" }]}>
            {res.counted ? `صوتك محتسب ✓ — البصمة ${res.fingerprint}` : "لا يوجد صوت بهذا الإيصال. راجع الرموز."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ═════════════ النتائج ═════════════
function ResultsBox({ e, width }: { e: Election; width: number }) {
  const r = e.results!;
  const [prints, setPrints] = useState<string[] | null>(null);
  const loadPrints = async () => {
    try { const d = await unionPlusApi.receipts(e.id); setPrints(d.fingerprints); } catch (x: any) { notify("تنبيه", x?.message || ""); }
  };
  return (
    <>
      <View style={[s.card, { width, gap: 10, borderColor: UC + "66" }]}>
        <View style={s.rowR}><Ionicons name="podium" size={20} color={UC} /><Text style={s.h2}>النتائج الرسمية</Text></View>
        {r.published_at ? <Text style={s.mutedSm}>أُعلنت {fmtDayTime(r.published_at)}</Text> : null}
        {r.positions.map((p) => <ResultPos key={p.position_id} p={p} />)}
      </View>
      <View style={[s.card, { width, gap: 8 }]}>
        <View style={s.rowR}><Ionicons name="shield-checkmark-outline" size={18} color={r.consistent ? GREEN : "#DC2626"} /><Text style={s.h3}>التدقيق</Text></View>
        <AuditRow l="عدد المقترعين" v={r.voters} />
        <AuditRow l="عدد الإيصالات المصدرة" v={r.receipts} />
        <Text style={[s.body, { color: r.consistent ? GREEN : "#DC2626", fontFamily: "Cairo_700Bold" }]}>
          {r.consistent ? "✓ المقترعون = الإيصالات: لا صوت مضاف ولا مفقود" : "✗ عدد الإيصالات لا يطابق المقترعين"}
        </Text>
        <TouchableOpacity onPress={() => (prints ? setPrints(null) : loadPrints())} style={[s.ghost, s.rowR, { gap: 6, alignSelf: "flex-end", paddingHorizontal: 14 }]}>
          <Ionicons name="finger-print-outline" size={16} color={UC} /><Text style={s.ghostT}>{prints ? "إخفاء البصمات" : "عرض بصمات الإيصالات"}</Text>
        </TouchableOpacity>
        {prints ? (
          <View style={s.prints}>
            {prints.map((f) => <Text key={f} selectable style={s.print}>{f}</Text>)}
          </View>
        ) : null}
      </View>
    </>
  );
}

function ResultPos({ p }: { p: ResultPosition }) {
  const max = Math.max(1, ...p.candidates.map((c) => c.votes));
  return (
    <View style={s.resPos}>
      <View style={s.rowBetween}>
        <Text style={s.h3}>{p.title}</Text>
        <Text style={s.mutedSm}>{p.seats === 1 ? "مقعد واحد" : `${p.seats.toLocaleString("ar-EG")} مقاعد`}</Text>
      </View>
      {p.tie ? (
        <View style={[s.rowR, { gap: 6, backgroundColor: "#FEF3C7", padding: 8, borderRadius: 10 }]}>
          <Ionicons name="alert-circle" size={16} color={GOLD} />
          <Text style={[s.mutedSm, { color: "#92400E", flex: 1 }]}>تعادل على آخر مقعد: يُحسم وفق لائحة الاتحاد، ولا يُعلن فائز به آلياً.</Text>
        </View>
      ) : null}
      {p.candidates.map((c) => (
        <View key={c.candidate_id} style={{ gap: 4 }}>
          <View style={s.rowBetween}>
            <View style={[s.rowR, { gap: 6, flex: 1 }]}>
              <Text style={[s.candN, c.winner && { color: GREEN }]} numberOfLines={1}>{c.full_name}</Text>
              {c.winner ? <View style={s.win}><Ionicons name="trophy" size={11} color="#fff" /><Text style={s.winT}>فائز</Text></View> : null}
            </View>
            <View style={[s.rowR, { gap: 6 }]}>
              <Text style={s.votes}>{`${c.votes.toLocaleString("ar-EG")} صوت`}</Text>
              <Text style={[s.votes, { color: UC }]}>{`${c.percent.toLocaleString("ar-EG")}٪`}</Text>
            </View>
          </View>
          <View style={s.bar}><View style={[s.barFill, { width: `${(c.votes / max) * 100}%`, backgroundColor: c.winner ? GREEN : UC2 }]} /></View>
        </View>
      ))}
      <Text style={s.mutedSm}>أصوات صحيحة {p.valid_votes.toLocaleString("ar-EG")} · أوراق بيضاء {p.blank_votes.toLocaleString("ar-EG")}</Text>
    </View>
  );
}

// ═════════════ مكونات مساعدة ═════════════
function PhaseBadge({ e, light }: { e: Election; light?: boolean }) {
  const c = PHASE_COLOR[e.phase];
  return (
    <View style={[s.badge, { backgroundColor: light ? "rgba(255,255,255,0.16)" : Colors.bg, borderColor: light ? "rgba(255,255,255,0.3)" : c + "66" }]}>
      <View style={[s.dot, { backgroundColor: light ? "#fff" : c }]} />
      <Text style={[s.badgeT, { color: light ? "#fff" : c }]}>{e.phase_label}</Text>
    </View>
  );
}

function Timeline({ e }: { e: Election }) {
  const cur = ORDER.indexOf(e.phase);
  return (
    <View style={s.tl}>
      {STEPS.map((st, i) => {
        const idx = Math.min(...st.key.map((k) => ORDER.indexOf(k)));
        const active = st.key.includes(e.phase);
        const done = cur > Math.max(...st.key.map((k) => ORDER.indexOf(k)));
        return (
          <React.Fragment key={st.label}>
            <View style={{ alignItems: "center", gap: 4, width: 62 }}>
              <View style={[s.tlDot, (active || done) && { backgroundColor: "#fff" }, active && { borderWidth: 3, borderColor: "#86EFAC" }]}>
                <Ionicons name={done ? "checkmark" : st.icon} size={15} color={active || done ? UC : "rgba(255,255,255,0.7)"} />
              </View>
              <Text style={[s.tlT, (active || done) && { color: "#fff", fontFamily: "Cairo_700Bold" }]}>{st.label}</Text>
            </View>
            {i < STEPS.length - 1 ? <View style={[s.tlLine, cur > idx && { backgroundColor: "#fff" }]} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function DateRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <View style={[s.rowR, { gap: 6 }]}>
      <Text style={s.dateL}>{label}</Text>
      <Text style={s.dateV}>{fmtDayTime(a)} ← {fmtDayTime(b)}</Text>
    </View>
  );
}

function Turnout({ e, big }: { e: Election; big?: boolean }) {
  const { voters, eligible, percent } = e.turnout;
  return (
    <View style={{ gap: 6 }}>
      <View style={s.rowBetween}>
        <Text style={big ? s.h3 : s.mutedSm}>نسبة المشاركة</Text>
        <View style={[s.rowR, { gap: 6 }]}>
          <Text style={[big ? s.h3 : s.mutedSm, { color: UC }]}>{`${percent.toLocaleString("ar-EG")}٪`}</Text>
          <Text style={s.mutedSm}>{`(${voters.toLocaleString("ar-EG")} من ${eligible.toLocaleString("ar-EG")} ناخباً)`}</Text>
        </View>
      </View>
      <View style={[s.bar, big && { height: 12 }]}><View style={[s.barFill, { width: `${Math.min(100, percent)}%`, backgroundColor: UC }]} /></View>
      {big ? <Text style={s.mutedSm}>سجل الناخبين: أعضاء قُبلوا قبل بدء التصويت وبطاقاتهم سارية.</Text> : null}
    </View>
  );
}

function Avatar({ c, size }: { c: Pick<Candidate, "full_name" | "photo_url">; size: number }) {
  return c.photo_url ? (
    <Image source={{ uri: c.photo_url }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: UC, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: size * 0.4, color: "#fff" }}>{c.full_name.trim()[0]}</Text>
    </View>
  );
}

function AuditRow({ l, v }: { l: string; v: number }) {
  return <View style={s.rowBetween}><Text style={s.body}>{l}</Text><Text style={[s.body, { fontFamily: "Cairo_700Bold" }]}>{v.toLocaleString("ar-EG")}</Text></View>;
}

const PROMISES: { i: keyof typeof Ionicons.glyphMap; t: string; d: string }[] = [
  { i: "eye-off-outline", t: "اقتراع سري", d: "يُحفظ صوتك بلا اسمك ولا وقت تصويتك. سجل المقترعين يثبت أنك صوّتّ فقط." },
  { i: "person-outline", t: "صوت واحد لكل عضو", d: "النظام يرفض أي محاولة تصويت ثانية من الحساب نفسه." },
  { i: "list-outline", t: "سجل ناخبين ثابت", d: "يصوّت من قُبلت عضويته قبل بدء التصويت وبطاقته سارية، فلا إضافات في اللحظة الأخيرة." },
  { i: "lock-closed-outline", t: "لا نتائج قبل الإغلاق", d: "لا يرى أحد أي عدّ أثناء التصويت، ولا الإدارة. الفرز آلي من الأصوات المخزّنة." },
  { i: "receipt-outline", t: "إيصال تحقق", d: "تأخذ رمزاً سرياً تتأكد به أن صوتك محتسب، ولا يكشف من اخترت." },
  { i: "document-text-outline", t: "سجل علني", d: "كل إجراء إداري على الانتخاب يظهر للجميع بتاريخه، والمواعيد والمرشحون يُجمّدون عند بدء التصويت." },
];

function IntegrityCard({ width, compact }: { width: number; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <View style={[s.card, { width, gap: 10 }]}>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} style={s.rowBetween}>
        <View style={[s.rowR, { gap: 8 }]}><Ionicons name="shield-checkmark" size={20} color={GREEN} /><Text style={s.h3}>كيف نضمن النزاهة</Text></View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </TouchableOpacity>
      {open ? PROMISES.map((p) => (
        <View key={p.t} style={[s.rowR, { gap: 10, alignItems: "flex-start" }]}>
          <View style={s.pIcon}><Ionicons name={p.i} size={16} color={UC} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.pT}>{p.t}</Text>
            <Text style={s.mutedSm}>{p.d}</Text>
          </View>
        </View>
      )) : null}
    </View>
  );
}

function LogCard({ e, width }: { e: Election; width: number }) {
  const items = useMemo(() => [...e.log].reverse(), [e.log]);
  if (!items.length) return null;
  return (
    <View style={[s.card, { width, gap: 4 }]}>
      <View style={[s.rowR, { gap: 8, marginBottom: 6 }]}><Ionicons name="time-outline" size={18} color={UC} /><Text style={s.h3}>سجل الشفافية</Text></View>
      {items.map((l, i) => (
        <View key={i} style={[s.rowR, { gap: 10, alignItems: "stretch" }]}>
          <View style={{ alignItems: "center", width: 14 }}>
            <View style={[s.logDot, l.action === "results" && { backgroundColor: GREEN }, l.action === "candidate_rejected" && { backgroundColor: "#DC2626" }]} />
            {i < items.length - 1 ? <View style={s.logLine} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 12 }}>
            <Text style={s.logT}>{LOG_LABEL[l.action] ?? l.action}</Text>
            {l.details && l.details !== LOG_LABEL[l.action] ? <Text style={s.mutedSm}>{l.details}</Text> : null}
            <Text style={s.logDate}>{fmtDayTime(l.created_at)}{l.actor ? ` · ${l.actor}` : ""}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#DC2626", textAlign: "center", marginTop: 30 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14 },
  hero: { borderRadius: 22, padding: 16, gap: 10 },
  heroT: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 32, color: "#fff", textAlign: "right" },
  heroD: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  dates: { backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 12, padding: 10, gap: 4 },
  dateL: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: UC2, width: 52, textAlign: "right" },
  dateV: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "#fff", textAlign: "right" },
  h2: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right" },
  h3: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13.5, lineHeight: 22, color: Colors.text, textAlign: "right" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 21, color: Colors.textMuted, textAlign: "right" },
  mutedSm: { fontFamily: "Cairo_400Regular", fontSize: 12, lineHeight: 19, color: Colors.textMuted, textAlign: "right" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  rowR: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  badge: { alignSelf: "flex-end", flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeT: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  tl: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "center", marginTop: 4 },
  tlDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  tlT: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: "rgba(255,255,255,0.75)" },
  tlLine: { flex: 1, height: 2, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 15 },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.bg, overflow: "hidden", flexDirection: "row-reverse" },
  barFill: { height: "100%", borderRadius: 4 },
  cand: { gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  candN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  progBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: UC + "55" },
  progBtnT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: UC },
  prog: { backgroundColor: Colors.bg, borderRadius: 12, padding: 10 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.bg },
  chipOn: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text },
  primary: { height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  ghost: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  ghostT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: UC },
  ballotRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.borderSubtle },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
  sheet: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 18, gap: 8, width: "100%", maxWidth: 480, alignSelf: "center" },
  reviewRow: { backgroundColor: Colors.bg, borderRadius: 12, padding: 10, gap: 2 },
  receipt: { fontFamily: "Cairo_700Bold", fontSize: 26, letterSpacing: 3, color: Colors.text, backgroundColor: Colors.bg, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  resPos: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderSubtle },
  votes: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  win: { flexDirection: "row-reverse", alignItems: "center", gap: 3, backgroundColor: GREEN, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  winT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  prints: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, backgroundColor: Colors.bg, padding: 10, borderRadius: 12 },
  print: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textSecondary, letterSpacing: 0.5 },
  pIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  pT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  logDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: UC, marginTop: 6 },
  logLine: { flex: 1, width: 2, backgroundColor: Colors.borderSubtle, marginTop: 2 },
  logT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  logDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
});
