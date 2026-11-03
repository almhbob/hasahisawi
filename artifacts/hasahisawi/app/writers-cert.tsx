// شهادة توثيق نص أدبي — رقم التوثيق، البصمة، التاريخ، ورمز QR لصفحة التحقق العلنية.
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { getApiUrl } from "@/lib/query-client";
import { copyText, notify, openExternal } from "@/lib/xplatform";
import { litApi, WINE, GOLD, INK, PAPER, fmtDate } from "@/lib/lit";
import { ithraaStyles as u } from "@/components/ithraa/ui";

type V = Awaited<ReturnType<typeof litApi.verify>>;
const STATUS: Record<string, string> = { approved: "منشور في ديوان الكُتّاب", pending: "قيد المراجعة", contest: "مشاركة في مسابقة", rejected: "غير منشور", withdrawn: "سحبه الكاتب" };

export default function WritersCert() {
  const insets = useSafeAreaInsets();
  const { no } = useLocalSearchParams<{ no: string }>();
  const [v, setV] = useState<V | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { litApi.verify(String(no)).then(setV).catch(() => setErr("رقم التوثيق غير موجود")); }, [no]);
  const url = `${getApiUrl()}/api/public/lit/verify/${encodeURIComponent(String(no))}`;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/writers" as any));

  return (
    <View style={{ flex: 1, backgroundColor: "#EFE7D6" }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <Text style={st.barTitle}>شهادة توثيق</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {!v && !err && <ActivityIndicator color={WINE} style={{ marginTop: 40 }} />}
        {!!err && <Text style={st.err}>{err}</Text>}
        {v && (
          <View style={st.cert}>
            <View style={st.frame}>
              <View style={st.corner} />
              <Text style={st.org}>منصة حصاحيصاوي · إثراء</Text>
              <Text style={st.head}>شهادة توثيق نص أدبي</Text>
              <View style={st.rule}><View style={st.ruleLine} /><Ionicons name="ribbon" size={18} color={GOLD} /><View style={st.ruleLine} /></View>
              <Text style={st.lead}>يشهد سجلّ «ديوان الكُتّاب» بأن الكاتب</Text>
              <Text style={st.name}>{v.author}</Text>
              <Text style={st.lead}>وثّق {v.status === "contest" ? "مشاركته" : "نصّه"} من جنس «{v.form_label}»{v.title ? " بعنوان" : ""}</Text>
              {!!v.title && <Text style={st.ttl}>«{v.title}»</Text>}
              <Text style={st.lead}>بعد تعهّده بأنه من تأليفه، غير منقول، ولا مولَّد بالذكاء الاصطناعي.</Text>

              <View style={st.grid}>
                <Cell k="رقم التوثيق" v={v.doc_no} mono />
                <Cell k="تاريخ التوثيق" v={fmtDate(v.documented_at, true)} />
                <Cell k="الحالة" v={STATUS[v.status] || v.status} />
              </View>
              <Text style={st.hashK}>البصمة الرقمية للنص (SHA-256)</Text>
              <Text style={st.hash} selectable>{(v.hash.match(/.{1,32}/g) || [v.hash]).join("\n")}</Text>

              <View style={st.qrRow}>
                <View style={st.qr}><QRCode value={url} size={92} color={INK} backgroundColor="#fff" /></View>
                <Text style={st.qrT}>امسح الرمز للتحقق من صحة الشهادة على صفحة السجل العلنية. أي تعديل على النص يغيّر بصمته.</Text>
              </View>
            </View>
          </View>
        )}
        {v && (
          <View style={{ gap: 10, marginTop: 16 }}>
            <Pressable onPress={() => Share.share({ message: `شهادة توثيق نص — ديوان الكُتّاب (حصاحيصاوي)\nرقم التوثيق: ${v.doc_no}\nتحقق: ${url}` }).catch(() => {})} style={[u.primaryBtn, { backgroundColor: WINE }]}>
              <Ionicons name="share-social" size={18} color="#fff" /><Text style={u.primaryText}>مشاركة الشهادة</Text>
            </Pressable>
            <View style={[u.rowR, { gap: 8 }]}>
              <Pressable onPress={async () => { if ((await copyText(String(v.doc_no))) === "copied") notify("تم النسخ", v.doc_no); }} style={[u.ghostBtn, { flex: 1 }]}><Ionicons name="copy-outline" size={16} color={INK} /><Text style={u.ghostText}>نسخ الرقم</Text></Pressable>
              <Pressable onPress={() => openExternal(url)} style={[u.ghostBtn, { flex: 1 }]}><Ionicons name="open-outline" size={16} color={INK} /><Text style={u.ghostText}>صفحة التحقق</Text></Pressable>
            </View>
            {!!v.text_id && <Pressable onPress={() => router.push({ pathname: "/writers-text", params: { id: String(v.text_id) } } as any)} style={u.ghostBtn}><Text style={u.ghostText}>قراءة النص</Text></Pressable>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Cell({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={st.cell}>
      <Text style={st.cellK}>{k}</Text>
      <Text style={[st.cellV, mono && { color: WINE, letterSpacing: 0.5 }]}>{v}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingBottom: 6 },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK },
  err: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#9B2C2C", textAlign: "center", marginTop: 40 },
  cert: { backgroundColor: PAPER, borderRadius: 10, padding: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  frame: { borderWidth: 2, borderColor: GOLD, borderRadius: 6, padding: 18, alignItems: "center", gap: 4 },
  corner: { position: "absolute", top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderColor: GOLD + "66", borderRadius: 4 },
  org: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#8A7A6A", letterSpacing: 0.5 },
  head: { fontFamily: "Cairo_700Bold", fontSize: 22, color: WINE },
  rule: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  ruleLine: { height: 1, width: 70, backgroundColor: GOLD },
  lead: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: INK, textAlign: "center", lineHeight: 22 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 24, color: INK, marginVertical: 2 },
  ttl: { fontFamily: "Cairo_700Bold", fontSize: 17, color: WINE, textAlign: "center" },
  grid: { alignSelf: "stretch", marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: GOLD + "66", paddingVertical: 6 },
  cell: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 6, gap: 10 },
  cellK: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#8A7A6A" },
  cellV: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: INK, textAlign: "left" },
  hashK: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "#8A7A6A", marginTop: 10 },
  hash: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: INK, textAlign: "center", letterSpacing: 0.5 },
  qrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 14, alignSelf: "stretch" },
  qr: { padding: 6, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: GOLD + "66" },
  qrT: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "#6B5B4B", textAlign: "right", lineHeight: 19 },
});
