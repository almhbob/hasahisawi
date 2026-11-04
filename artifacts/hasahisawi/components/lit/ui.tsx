// عناصر «ديوان الكُتّاب»: بطاقة النص، عارض الشعر والنثر، شارة التوثيق، صندوق التعهّد.
import React from "react";
import { View, Text, Pressable, StyleSheet, TextInput, type StyleProp, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import { WINE, GOLD, INK, TEXT_STATUS, splitVerse, type LitText } from "@/lib/lit";
import { parseInline, isSeparator, SIZE_DELTA, SPACING_MUL, type LitLayout } from "@/lib/lit-markup";

const GROUP_COLOR: Record<string, string> = { story: "#7A2E3A", poetry: "#1B4D6B", prose: "#2D6A4F" };
export const groupColor = (g: string) => GROUP_COLOR[g] ?? WINE;

/** مقاطع منسّقة داخل سطر: غامق/مائل/تظليل/مشطوب */
export function Rich({ line, style }: { line: string; style?: StyleProp<TextStyle> }) {
  const segs = parseInline(line);
  return (
    <Text style={style}>
      {segs.map((g, i) => (g.b || g.i || g.h || g.s) ? (
        <Text key={i} style={[g.b && s.bold, g.i && s.italic, g.h && s.mark, g.s && s.strike]}>{g.t}</Text>
      ) : g.t)}
    </Text>
  );
}

function Separator({ size }: { size: number }) {
  return (
    <View style={[s.sep, { marginVertical: size * 0.5 }]} accessibilityRole="none" accessibilityLabel="فاصل">
      <View style={s.sepLine} /><Text style={s.sepStar}>✦ ✦ ✦</Text><View style={s.sepLine} />
    </View>
  );
}

/** يعرض النص بحسب نوعه: العمودي صدر/عجز، والشعر في أسطر متوسطة، والنثر فقرات — مع التنسيق وتفضيلات العرض */
export function LitBody({ text, size = 17, preview = false }: {
  text: Pick<LitText, "form" | "group"> & { body?: string; excerpt?: string; layout?: LitLayout | null };
  size?: number; preview?: boolean;
}) {
  const raw = (preview ? text.excerpt : text.body) || "";
  const lay = preview ? null : text.layout;
  const fs = size + (lay?.size ? SIZE_DELTA[lay.size] : 0);
  const lh = fs * (lay?.spacing ? SPACING_MUL[lay.spacing] : 1.95);
  if (text.group === "poetry") {
    const align: TextStyle["textAlign"] = lay?.align === "right" ? "right" : "center";
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, preview ? 4 : undefined);
    return (
      <View style={{ gap: text.form === "haiku" ? 6 : 2 }}>
        {lines.map((l, i) => {
          if (isSeparator(l)) return preview ? null : <Separator key={i} size={fs} />;
          const v = text.form === "classical" ? splitVerse(l) : null;
          if (v) {
            return (
              <View key={i} style={s.verse}>
                <Rich line={v[0]} style={[s.hemi, { fontSize: fs - 2, lineHeight: lh * 0.92 }]} />
                <Rich line={v[1]} style={[s.hemi, { fontSize: fs - 2, lineHeight: lh * 0.92 }]} />
              </View>
            );
          }
          return <Rich key={i} line={l} style={[s.poemLine, { fontSize: text.form === "haiku" ? fs + 2 : fs, lineHeight: lh, textAlign: align }]} />;
        })}
      </View>
    );
  }
  const align: TextStyle["textAlign"] = lay?.align ?? "right";
  const paras = raw.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean).slice(0, preview ? 2 : undefined);
  return (
    <View style={{ gap: fs * 0.8 }}>
      {paras.map((p, i) => isSeparator(p)
        ? (preview ? null : <Separator key={i} size={fs} />)
        : <Text key={i} style={[s.prose, { fontSize: fs, lineHeight: lh, textAlign: align }]} numberOfLines={preview ? 3 : undefined}>
            {preview ? p : <Rich line={p} />}
          </Text>)}
    </View>
  );
}

export function DocBadge({ no, onPress, light }: { no: string | null; onPress?: () => void; light?: boolean }) {
  if (!no) return null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[s.doc, light && { backgroundColor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.3)" }]} accessibilityLabel={`رقم التوثيق ${no}`}>
      <Ionicons name="shield-checkmark" size={13} color={light ? "#fff" : WINE} />
      <Text style={[s.docT, light && { color: "#fff" }]}>{no}</Text>
    </Pressable>
  );
}

export function TextStatus({ status }: { status: string }) {
  const m = TEXT_STATUS[status] || TEXT_STATUS.pending;
  return (
    <View style={[s.status, { backgroundColor: m.color + "18" }]}>
      <Ionicons name={m.icon as any} size={12} color={m.color} />
      <Text style={[s.statusT, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

export function TextCard({ t, onPress, footer, showStatus }: { t: LitText; onPress: () => void; footer?: React.ReactNode; showStatus?: boolean }) {
  const c = groupColor(t.group);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={t.title}>
      <View style={[s.cardTop, { borderTopColor: c }]}>
        <View style={s.rowR}>
          <Text style={[s.form, { color: c, backgroundColor: c + "12" }]}>{t.form_label}</Text>
          {t.featured && <Text style={[s.form, { color: GOLD, backgroundColor: GOLD + "18" }]}>★ مختار</Text>}
          {showStatus && t.status !== "approved" && <TextStatus status={t.status} />}
        </View>
        <Text style={s.title} numberOfLines={2}>{t.title}</Text>
        <View style={{ marginTop: 6 }}><LitBody text={t} preview size={14.5} /></View>
      </View>
      <View style={[s.rowR, { justifyContent: "space-between", marginTop: 10 }]}>
        <View style={[s.rowR, { gap: 8 }]}>
          <UserAvatar name={t.author_name} avatarUrl={t.author_avatar} size={26} />
          <Text style={s.author} numberOfLines={1}>{t.author_name}</Text>
        </View>
        <View style={[s.rowR, { gap: 10 }]}>
          <View style={[s.rowR, { gap: 3 }]}><Ionicons name={t.liked ? "heart" : "heart-outline"} size={13} color={t.liked ? "#C0392B" : Colors.textMuted} /><Text style={s.meta}>{t.likes}</Text></View>
          <View style={[s.rowR, { gap: 3 }]}><Ionicons name="eye-outline" size={13} color={Colors.textMuted} /><Text style={s.meta}>{t.views}</Text></View>
        </View>
      </View>
      {footer}
    </Pressable>
  );
}

const PLEDGES = [
  { key: "original", text: "أتعهّد بأن هذا النص من بنات أفكاري وتأليفي الخاص." },
  { key: "not_copied", text: "وأنه ليس منقولاً ولا مقتبساً من غيري دون إشارة، ولا منسوباً لغير صاحبه." },
  { key: "no_ai", text: "ولم أستخدم أدوات الذكاء الاصطناعي في كتابته أو صياغته." },
] as const;

export function PledgeBox({ value, onChange, contest }: {
  value: { original: boolean; not_copied: boolean; no_ai: boolean; unpublished?: boolean; signature: string };
  onChange: (v: any) => void; contest?: boolean;
}) {
  const items = contest ? [...PLEDGES, { key: "unpublished", text: "ولم يُنشر النص من قبل ولم يشارك في مسابقة سابقة." } as const] : PLEDGES;
  return (
    <View style={s.pledge}>
      <View style={[s.rowR, { gap: 8 }]}>
        <Ionicons name="document-lock" size={20} color={WINE} />
        <Text style={s.pledgeTitle}>تعهّد الأصالة</Text>
      </View>
      <Text style={s.pledgeSub}>بعد التعهّد يُمنح نصك رقم توثيق خاصاً وبصمة رقمية تثبت أسبقيته بتاريخ اليوم.</Text>
      {items.map((p) => {
        const on = !!(value as any)[p.key];
        return (
          <Pressable key={p.key} onPress={() => onChange({ ...value, [p.key]: !on })} style={s.pledgeRow} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
            <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? WINE : Colors.textMuted} />
            <Text style={s.pledgeText}>{p.text}</Text>
          </Pressable>
        );
      })}
      <Text style={s.sigLabel}>التوقيع (اسمك الكامل)</Text>
      <SignatureInput value={value.signature} onChange={(signature) => onChange({ ...value, signature })} />
      <Text style={s.pledgeNote}>يخضع كل نص لفحص آلي للنسخ ولأسلوب الذكاء الاصطناعي، ثم لمراجعة المشرف. الإخلال بالتعهّد يعرّض الحساب للإيقاف.</Text>
    </View>
  );
}

function SignatureInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput value={value} onChangeText={onChange} placeholder="الاسم كما تحب أن يُوثَّق" placeholderTextColor={Colors.textMuted} style={s.sig} maxLength={120} />;
}

const s = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center", flexWrap: "wrap", gap: 6 },
  verse: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10, marginBottom: 6 },
  hemi: { flex: 1, fontFamily: "Cairo_600SemiBold", color: INK, textAlign: "center" },
  poemLine: { fontFamily: "Cairo_600SemiBold", color: INK, textAlign: "center" },
  prose: { fontFamily: "Cairo_400Regular", color: INK, textAlign: "right", writingDirection: "rtl" },
  bold: { fontFamily: "Cairo_700Bold" },
  italic: { fontStyle: "italic", color: "#5A2E2A" },
  mark: { backgroundColor: GOLD + "3D", color: INK },
  strike: { textDecorationLine: "line-through", textDecorationColor: WINE },
  sep: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  sepLine: { height: 1, width: 48, backgroundColor: GOLD + "88" },
  sepStar: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: GOLD, letterSpacing: 2 },
  doc: { flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-end", borderWidth: 1, borderColor: WINE + "40", backgroundColor: WINE + "0D", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  docT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: WINE, letterSpacing: 0.3 },
  status: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  statusT: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, marginBottom: 12 },
  cardTop: { borderTopWidth: 3, paddingTop: 10, marginTop: -14, marginHorizontal: -14, paddingHorizontal: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  form: { fontFamily: "Cairo_700Bold", fontSize: 12, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8, overflow: "hidden" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginTop: 6, lineHeight: 26 },
  author: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, maxWidth: 160 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  pledge: { backgroundColor: "#FFFBF2", borderRadius: 16, borderWidth: 1, borderColor: GOLD + "55", padding: 14, gap: 8 },
  pledgeTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: INK },
  pledgeSub: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#6B5B4B", textAlign: "right", lineHeight: 20 },
  pledgeRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  pledgeText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: INK, textAlign: "right", lineHeight: 22 },
  sigLabel: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: INK, textAlign: "right", marginTop: 4 },
  sig: { borderBottomWidth: 1.5, borderBottomColor: INK + "66", paddingVertical: 6, fontFamily: "Cairo_700Bold", fontSize: 18, color: WINE, textAlign: "center", fontStyle: "italic" },
  pledgeNote: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A7A6A", textAlign: "right", lineHeight: 19 },
});
