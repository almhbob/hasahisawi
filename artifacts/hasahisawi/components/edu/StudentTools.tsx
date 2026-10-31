// أدوات الطالب: جدول المذاكرة الأسبوعي + بطاقات المراجعة (Flashcards).
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import Animated, { FlipInEasyX } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { confirmAction, notify } from "@/lib/xplatform";
import { paperDocument, printPaper, esc } from "@/lib/paper";
import { ToolHeader, Field, Btn, Card, Empty, Segmented, EDU } from "@/components/edu/ui";
import { useStudentData, uid, type Deck } from "@/lib/edu-store";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

const DAYS = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const jsToIdx = (d: number) => (d + 1) % 7; // JS: 0=Sunday → our 0=Saturday

export function StudyPlanner({ onBack }: { onBack: () => void }) {
  const { data, update } = useStudentData();
  const [day, setDay] = useState(jsToIdx(new Date().getDay()));
  const [time, setTime] = useState("17:00");
  const [subject, setSubject] = useState("");
  const blocks = useMemo(() => data.plan.filter((b) => b.day === day).sort((a, b) => a.time.localeCompare(b.time)), [data.plan, day]);
  const doneAll = data.plan.filter((b) => b.done).length;

  const add = () => {
    if (subject.trim().length < 2) return notify("اكتب المادة أو المهمة");
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return notify("الوقت بصيغة 17:00");
    update((d) => ({ ...d, plan: [...d.plan, { id: uid(), day, time: time.trim().padStart(5, "0"), subject: subject.trim() }] }));
    setSubject("");
  };
  const print = () => {
    const times = Array.from(new Set(data.plan.map((b) => b.time))).sort();
    const rows = times.map((t) => `<tr><td><b>${t}</b></td>${DAYS.map((_, i) => `<td>${data.plan.filter((b) => b.day === i && b.time === t).map((b) => esc(b.subject)).join("<br/>")}</td>`).join("")}</tr>`).join("");
    printPaper(paperDocument({ theme: "academic", title: "جدول المذاكرة الأسبوعي", landscape: true,
      bodyHtml: `<table><thead><tr><th>الوقت</th>${DAYS.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
      note: "«من جدّ وجد، ومن زرع حصد» — التزم بجدولك وراجع أولاً بأول." }), "جدول المذاكرة");
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="جدول المذاكرة الأسبوعي" sub={`${data.plan.length} حصة مذاكرة · أنجزت ${doneAll}`} onBack={onBack}
        right={data.plan.length ? <Pressable onPress={print} hitSlop={8}><Ionicons name="print-outline" size={21} color={EDU.teal} /></Pressable> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <RtlScrollRow contentContainerStyle={{ gap: 6}}>
          {DAYS.map((d, i) => {
            const n = data.plan.filter((b) => b.day === i).length;
            return (
              <Pressable key={d} onPress={() => setDay(i)} style={[st.day, day === i && st.dayOn]}>
                <Text style={[st.dayText, day === i && { color: "#fff" }]}>{d}</Text>
                <Text style={[st.dayN, day === i && { color: "#DDEFEA" }]}>{n ? `${n} حصص` : "—"}</Text>
              </Pressable>
            );
          })}
        </RtlScrollRow>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field value={subject} onChangeText={setSubject} placeholder="الفيزياء — مراجعة الفصل الثالث" /></View>
            <View style={{ width: 84 }}><Field value={time} onChangeText={setTime} placeholder="17:00" keyboardType="numbers-and-punctuation" /></View>
          </View>
          <Btn title={`إضافة ليوم ${DAYS[day]}`} icon="add" color={EDU.teal} onPress={add} />
        </Card>
        {blocks.length === 0 ? <Empty icon="calendar-outline" title={`لا توجد مذاكرة يوم ${DAYS[day]}`} sub="وزّع موادك على أيام الأسبوع وعلّم ما أنجزته." /> :
          blocks.map((b) => (
            <View key={b.id} style={[st.block, b.done && { backgroundColor: Colors.primarySoft, borderColor: "#BFE3D3" }]}>
              <Pressable hitSlop={8} onPress={() => update((d) => ({ ...d, plan: d.plan.map((x) => (x.id === b.id ? { ...x, done: !x.done } : x)) }))}>
                <Ionicons name={b.done ? "checkmark-circle" : "ellipse-outline"} size={24} color={b.done ? "#0E8A5F" : Colors.textMuted} />
              </Pressable>
              <Text style={st.time}>{b.time}</Text>
              <Text style={[st.subj, b.done && { textDecorationLine: "line-through", color: Colors.textMuted }]} numberOfLines={2}>{b.subject}</Text>
              <Pressable hitSlop={8} onPress={() => update((d) => ({ ...d, plan: d.plan.filter((x) => x.id !== b.id) }))}><Ionicons name="close" size={18} color="#B9C2BE" /></Pressable>
            </View>
          ))}
        {doneAll > 0 && <Btn title="بدء أسبوع جديد (إلغاء علامات الإنجاز)" icon="refresh" outline onPress={() => update((d) => ({ ...d, plan: d.plan.map((x) => ({ ...x, done: false })) }))} />}
      </ScrollView>
    </View>
  );
}

export function Flashcards({ onBack }: { onBack: () => void }) {
  const { data, update } = useStudentData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "study">("study");
  const [title, setTitle] = useState(""); const [subject, setSubject] = useState("");
  const [front, setFront] = useState(""); const [back, setBack] = useState("");
  const [idx, setIdx] = useState(0); const [flip, setFlip] = useState(false);
  const deck = data.decks.find((d) => d.id === openId) ?? null;
  const saveDeck = (fn: (d: Deck) => Deck) => update((s) => ({ ...s, decks: s.decks.map((d) => (d.id === openId ? fn(d) : d)) }));

  if (deck) {
    const queue = deck.cards.filter((c) => !c.known);
    const card = queue.length ? queue[idx % queue.length] : null;
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ToolHeader title={deck.title} sub={`${deck.cards.length} بطاقة · أتقنت ${deck.cards.length - queue.length}`} onBack={() => { setOpenId(null); setIdx(0); setFlip(false); }} />
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Segmented value={mode} onChange={setMode} options={[{ key: "study", label: "المراجعة" }, { key: "edit", label: "البطاقات" }]} />
        </View>
        {mode === "study" ? (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
            {!deck.cards.length ? <Empty icon="albums-outline" title="أضف بطاقات أولاً" /> : !card ? (
              <Empty icon="trophy-outline" title="أحسنت! أتقنت كل البطاقات 🎉" action={<Btn title="إعادة المراجعة من البداية" icon="refresh" onPress={() => saveDeck((d) => ({ ...d, cards: d.cards.map((c) => ({ ...c, known: false })) }))} />} />
            ) : (
              <>
                <Text style={st.progress}>{(idx % queue.length) + 1} / {queue.length}</Text>
                <Pressable onPress={() => setFlip((f) => !f)}>
                  <Animated.View key={`${card.id}-${flip}`} entering={FlipInEasyX.duration(350)} style={[st.flash, flip && { backgroundColor: EDU.ink }]}>
                    <Text style={[st.flashLabel, flip && { color: "#CFE3F5" }]}>{flip ? "الإجابة" : "السؤال"}</Text>
                    <Text style={[st.flashText, flip && { color: "#fff" }]}>{flip ? card.back : card.front}</Text>
                    <Text style={[st.flashHint, flip && { color: "#9FBAD3" }]}>اضغط للقلب</Text>
                  </Animated.View>
                </Pressable>
                <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                  <Btn title="أتقنتها" icon="checkmark" color="#0E8A5F" style={{ flex: 1 }} onPress={() => { saveDeck((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, known: true } : c)) })); setFlip(false); }} />
                  <Btn title="راجعها لاحقاً" icon="repeat" color={EDU.gold} style={{ flex: 1 }} onPress={() => { setIdx((i) => i + 1); setFlip(false); }} />
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Card style={{ gap: 8 }}>
              <Field label="السؤال / المصطلح" value={front} onChangeText={setFront} placeholder="ما قانون نيوتن الثاني؟" multiline />
              <Field label="الإجابة" value={back} onChangeText={setBack} placeholder="القوة = الكتلة × التسارع" multiline />
              <Btn title="إضافة البطاقة" icon="add" color={EDU.teal} onPress={() => {
                if (!front.trim() || !back.trim()) return notify("أكمل السؤال والإجابة");
                saveDeck((d) => ({ ...d, cards: [...d.cards, { id: uid(), front: front.trim(), back: back.trim() }] })); setFront(""); setBack("");
              }} />
            </Card>
            {deck.cards.map((c, i) => (
              <View key={c.id} style={st.block}>
                <Text style={st.time}>{i + 1}</Text>
                <View style={{ flex: 1 }}><Text style={st.subj}>{c.front}</Text><Text style={st.ans}>{c.back}</Text></View>
                <Pressable hitSlop={8} onPress={() => saveDeck((d) => ({ ...d, cards: d.cards.filter((x) => x.id !== c.id) }))}><Ionicons name="trash-outline" size={18} color="#D93636" /></Pressable>
              </View>
            ))}
            <Btn title="حذف المجموعة" icon="trash-outline" outline color="#D93636" onPress={async () => { if (await confirmAction("حذف المجموعة", `حذف «${deck.title}» وكل بطاقاتها؟`, "حذف", true)) { update((s) => ({ ...s, decks: s.decks.filter((d) => d.id !== deck.id) })); setOpenId(null); } }} />
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ToolHeader title="بطاقات المراجعة" sub="احفظ المصطلحات والقوانين وراجعها بذكاء" onBack={onBack} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1 }}><Field value={title} onChangeText={setTitle} placeholder="اسم المجموعة: قوانين الفيزياء" /></View>
            <View style={{ width: 110 }}><Field value={subject} onChangeText={setSubject} placeholder="المادة" /></View>
          </View>
          <Btn title="مجموعة جديدة" icon="add" color={EDU.teal} onPress={() => {
            if (title.trim().length < 2) return notify("اكتب اسم المجموعة");
            const d = { id: uid(), title: title.trim(), subject: subject.trim(), cards: [] };
            update((s) => ({ ...s, decks: [d, ...s.decks] })); setTitle(""); setSubject(""); setOpenId(d.id); setMode("edit");
          }} />
        </Card>
        {data.decks.length === 0 ? <Empty icon="albums-outline" title="لا توجد مجموعات" sub="أنشئ مجموعة لكل مادة وأضف أسئلة وإجابات قصيرة للمراجعة السريعة قبل الامتحان." /> :
          data.decks.map((d) => {
            const known = d.cards.filter((c) => c.known).length;
            const pct = d.cards.length ? (known / d.cards.length) * 100 : 0;
            return (
              <Card key={d.id} onPress={() => { setOpenId(d.id); setMode(d.cards.length ? "study" : "edit"); setIdx(0); setFlip(false); }}>
                <Text style={st.subj}>{d.title}</Text>
                <Text style={st.ans}>{[d.subject, `${d.cards.length} بطاقة`, `أتقنت ${known}`].filter(Boolean).join(" · ")}</Text>
                <View style={st.bar}><View style={[st.barFill, { width: `${pct}%` }]} /></View>
              </Card>
            );
          })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  day: { minWidth: 76, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: EDU.line, alignItems: "center" },
  dayOn: { backgroundColor: EDU.ink, borderColor: EDU.ink },
  dayText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.ink },
  dayN: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: Colors.textMuted },
  block: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: EDU.line, padding: 10 },
  time: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.teal, minWidth: 40, textAlign: "center" },
  subj: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  ans: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  progress: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  flash: { minHeight: 230, borderRadius: 22, backgroundColor: Colors.cardBg, borderWidth: 1.5, borderColor: EDU.line, padding: 22, alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  flashLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU.teal },
  flashText: { fontFamily: "Cairo_700Bold", fontSize: 20, color: EDU.ink, textAlign: "center", lineHeight: 34 },
  flashHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  bar: { height: 6, borderRadius: 3, backgroundColor: EDU.soft, marginTop: 8, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: EDU.teal },
});
