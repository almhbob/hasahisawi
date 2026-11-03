// منشور في نافذة الصحافة — البيانات والتصريحات تُعرض بترويسة رسمية ورقم مرجعي وتوقيع، مع المرفقات والمشاركة.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Share, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { openExternal } from "@/lib/xplatform";
import { pressApi, PRESS_INK, PRESS_RED, PRESS_PAPER, PARTNER_STATUS, fmtDay, type PressPost, type PressSettings } from "@/lib/press";
import { ithraaStyles as u } from "@/components/ithraa/ui";

const WEB = "https://hasahisawi.pages.dev";

export default function PressPostScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<{ post: PressPost; settings: PressSettings; can_edit: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [size, setSize] = useState(16);
  const load = useCallback(async () => { try { setD(await pressApi.post(Number(id), token)); } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); } }, [id, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/press" as any));

  if (err) return <View style={st.center}><Text style={st.err}>{err}</Text></View>;
  if (!d) return <View style={st.center}><ActivityIndicator color={PRESS_RED} /></View>;
  const p = d.post;
  const official = ["statement", "press_release", "circular"].includes(p.kind);
  const share = () => Share.share({ message: `${p.urgent ? "🔴 عاجل | " : ""}${p.kind_label}: ${p.title}\n${p.ref_no}\n${WEB}/press-post?id=${p.id}` }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: official ? "#EEF0F3" : Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={PRESS_INK} /></Pressable>
        <Text style={st.barTitle}>{p.kind_label}</Text>
        <View style={[u.rowR, { gap: 2 }]}>
          <Pressable onPress={() => setSize((x) => Math.min(22, x + 1))} style={st.barBtn}><Text style={st.aa}>أ+</Text></Pressable>
          <Pressable onPress={share} style={st.barBtn} accessibilityLabel="مشاركة"><Ionicons name="share-social-outline" size={20} color={PRESS_INK} /></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: official ? 14 : 0, paddingBottom: insets.bottom + 40 }}>
        {official ? (
          <View style={st.sheet}>
            <View style={st.letterhead}>
              <View style={{ flex: 1 }}>
                <Text style={st.lhOrg}>{d.settings.status === "active" ? d.settings.partner_name : d.settings.window_title}</Text>
                <Text style={st.lhSub}>{d.settings.status === "active" ? `${d.settings.window_title} · منصة حصاحيصاوي` : `منصة حصاحيصاوي · بالشراكة المقترحة مع ${d.settings.partner_name}`}</Text>
              </View>
              <View style={st.lhLogo}>{d.settings.logo_url ? <Image source={{ uri: d.settings.logo_url }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="newspaper" size={22} color="#fff" />}</View>
            </View>
            <View style={st.redRule} />
            <View style={[u.rowR, { justifyContent: "space-between", marginTop: 10 }]}>
              <Text style={st.meta}>الرقم: {p.ref_no}</Text>
              <Text style={st.meta}>التاريخ: {fmtDay(p.published_at || p.created_at)}</Text>
            </View>
            {p.urgent && <Text style={st.urgentStamp}>عاجل</Text>}
            <Text style={st.docKind}>{p.kind_label}</Text>
            <Text style={st.docTitle}>{p.title}</Text>
            <Body text={p.body || ""} size={size} />
            <View style={st.sign}>
              <Text style={st.signT}>{p.signed_by || "الأمانة الإعلامية"}</Text>
              <Text style={st.meta}>{d.settings.status === "active" ? d.settings.partner_name : d.settings.window_title}</Text>
            </View>
            {d.settings.status !== "active" && <Text style={st.note}>{PARTNER_STATUS[d.settings.status].note}</Text>}
          </View>
        ) : (
          <>
            {!!p.cover_url && <Image source={{ uri: p.cover_url }} style={st.cover} />}
            <View style={{ padding: 18 }}>
              <View style={[u.rowR, { gap: 6 }]}>
                {p.urgent && <Text style={st.tagRed}>عاجل</Text>}
                <Text style={st.kindT}>{p.kind_label}</Text>
                <Text style={st.meta}>{p.ref_no}</Text>
              </View>
              <Text style={st.newsTitle}>{p.title}</Text>
              <Text style={st.meta}>{p.signed_by || "الأمانة الإعلامية"} · {fmtDay(p.published_at, true)} · {p.views} قراءة</Text>
              <View style={{ height: 14 }} />
              <Body text={p.body || ""} size={size} />
            </View>
          </>
        )}
        {p.attachments.length > 0 && (
          <View style={{ paddingHorizontal: official ? 0 : 18, marginTop: 14, gap: 8 }}>
            <Text style={st.h}>المرفقات</Text>
            {p.attachments.map((f, i) => (
              <Pressable key={i} onPress={() => openExternal(f.url)} style={st.file}>
                <Ionicons name={/pdf/i.test(f.url) ? "document-text" : /\.(jpe?g|png)/i.test(f.url) ? "image" : "document-attach"} size={20} color={PRESS_RED} />
                <Text style={st.fileT} numberOfLines={1}>{f.name}</Text>
                <Ionicons name="download-outline" size={18} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
        {d.can_edit && (
          <Pressable onPress={() => router.push({ pathname: "/press-admin", params: { edit: String(p.id) } } as any)} style={[u.ghostBtn, { margin: official ? 0 : 18, marginTop: 16 }]}>
            <Ionicons name="create-outline" size={16} color={PRESS_INK} /><Text style={u.ghostText}>تعديل المنشور</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Body({ text, size }: { text: string; size: number }) {
  return (
    <View style={{ gap: size * 0.7, marginTop: 10 }}>
      {text.split(/\n{1,}/).filter((x) => x.trim()).map((para, i) => <Text key={i} style={[st.body, { fontSize: size, lineHeight: size * 1.9 }]}>{para.trim()}</Text>)}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingBottom: 6, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { minWidth: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: PRESS_INK },
  aa: { fontFamily: "Cairo_700Bold", fontSize: 14, color: PRESS_INK },
  sheet: { backgroundColor: PRESS_PAPER, borderRadius: 6, padding: 20, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  letterhead: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  lhOrg: { fontFamily: "Cairo_700Bold", fontSize: 17, color: PRESS_INK, textAlign: "right" },
  lhSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  lhLogo: { width: 48, height: 48, borderRadius: 10, backgroundColor: PRESS_RED, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  redRule: { height: 3, backgroundColor: PRESS_RED, marginTop: 12, borderRadius: 2 },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textMuted },
  urgentStamp: { alignSelf: "center", marginTop: 12, fontFamily: "Cairo_700Bold", fontSize: 14, color: PRESS_RED, borderWidth: 2, borderColor: PRESS_RED, paddingHorizontal: 16, borderRadius: 6, transform: [{ rotate: "-4deg" }] },
  docKind: { fontFamily: "Cairo_700Bold", fontSize: 20, color: PRESS_INK, textAlign: "center", marginTop: 14, textDecorationLine: "underline" },
  docTitle: { fontFamily: "Cairo_700Bold", fontSize: 16.5, color: PRESS_INK, textAlign: "center", marginTop: 6, lineHeight: 28 },
  body: { fontFamily: "Cairo_400Regular", color: "#1F2937", textAlign: "right" },
  sign: { alignSelf: "flex-start", alignItems: "center", marginTop: 26, gap: 2 },
  signT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: PRESS_INK },
  note: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: "#7A5A12", textAlign: "center", marginTop: 18, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  cover: { width: "100%", height: 220 },
  tagRed: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff", backgroundColor: PRESS_RED, paddingHorizontal: 7, borderRadius: 6, overflow: "hidden" },
  kindT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: PRESS_RED },
  newsTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", lineHeight: 34, marginVertical: 6 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  file: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  fileT: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
});
