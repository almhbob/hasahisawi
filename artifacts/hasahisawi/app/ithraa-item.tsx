// «إثراء» — صفحة الكتاب/المقال: تفاصيل، قراءة المقال، فتح/تنزيل الكتاب، مشاركة، وإجراءات المشرف وصاحب المساهمة.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, Share, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction, openExternal } from "@/lib/xplatform";
import UserAvatar from "@/components/UserAvatar";
import { ithraaApi, ITHRAA, ITHRAA_GOLD, LANG_LABEL, RIGHTS_OPTIONS, fmtSize, fmtDate, type IthraaItem } from "@/lib/ithraa";
import { BookCover, BookTile, StatusChip, Meta, SectionTitle, ithraaStyles as u } from "@/components/ithraa/ui";

const WEB_BASE = "https://almhbob.github.io/hasahisawi";

export default function IthraaItemScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ item: IthraaItem; can_review: boolean; is_owner: boolean; related: IthraaItem[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [fontSize, setFontSize] = useState(16);

  const load = useCallback(async () => {
    setError("");
    try { setData(await ithraaApi.item(Number(id), token)); } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = () => (router.canGoBack() ? router.back() : router.replace("/ithraa" as any));

  if (error) return (
    <View style={[st.center, { paddingTop: insets.top + 40 }]}>
      <Ionicons name="alert-circle-outline" size={42} color={Colors.textMuted} />
      <Text style={st.err}>{error}</Text>
      <Pressable onPress={back} style={[u.ghostBtn, { marginTop: 12 }]}><Text style={u.ghostText}>رجوع</Text></Pressable>
    </View>
  );
  if (!data) return <View style={st.center}><ActivityIndicator color={ITHRAA} /></View>;

  const { item: it, can_review, is_owner, related } = data;
  const isBook = it.kind === "book";
  const rights = RIGHTS_OPTIONS.find((r) => r.key === it.rights);

  const openFile = async () => {
    try {
      const url = it.status === "approved" ? (await ithraaApi.openUrl(it.id)).url : it.file_url;
      if (url) await openExternal(url);
    } catch (e: any) { notify("تعذّر الفتح", e?.message || "حاول لاحقاً"); }
  };
  const share = async () => {
    const link = `${WEB_BASE}/ithraa-item?id=${it.id}`;
    await Share.share({ message: `📚 ${isBook ? "كتاب" : "مقال"} في «إثراء» على حصاحيصاوي:\n${it.title}${it.author_name ? ` — ${it.author_name}` : ""}\n${link}` }).catch(() => {});
  };
  const act = async (action: "approve" | "reject" | "feature" | "unfeature" | "unpublish") => {
    if (!token) return;
    if (action === "reject" && note.trim().length < 3) return notify("سبب الرفض", "اكتب ملاحظة توضّح لصاحب المساهمة ما يجب تعديله.");
    if (action === "unpublish" && !(await confirmAction("إلغاء النشر", "سيُخفى عن القرّاء ويعود لقائمة المراجعة.", "إلغاء النشر", true))) return;
    setBusy(true);
    try { await ithraaApi.act(token, it.id, action, note.trim() || undefined); setNote(""); await load(); }
    catch (e: any) { notify("تعذّر التنفيذ", e?.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !(await confirmAction("حذف المساهمة", "سيُحذف المحتوى والملف نهائياً.", "حذف", true))) return;
    try { await ithraaApi.remove(token, it.id); back(); } catch (e: any) { notify("تعذّر الحذف", e?.message); }
  };
  const canEdit = (is_owner && it.status !== "approved") || can_review;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} /></Pressable>
        <Text style={st.barTitle} numberOfLines={1}>{isBook ? "كتاب" : "مقال"} · {it.category_label}</Text>
        <Pressable onPress={share} style={st.barBtn} hitSlop={8} accessibilityLabel="مشاركة"><Ionicons name="share-social-outline" size={20} color={Colors.textPrimary} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {it.status !== "approved" && (
          <View style={[st.banner, { backgroundColor: it.status === "rejected" ? "#C0392B12" : "#B7791F14" }]}>
            <StatusChip status={it.status} />
            <Text style={st.bannerText}>
              {it.status === "pending" ? "هذه المساهمة لم تُنشر بعد — يراها صاحبها والمشرفون فقط." : `ملاحظة المشرف: ${it.review_note || "يحتاج تعديلاً"}`}
            </Text>
          </View>
        )}

        {isBook ? (
          <View style={[u.rowR, { gap: 14, alignItems: "flex-start" }]}>
            <BookCover item={it} width={124} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={st.title}>{it.title}</Text>
              {!!it.author_name && <Text style={st.author}>تأليف: {it.author_name}</Text>}
              <View style={[u.rowR, { gap: 10, flexWrap: "wrap" }]}>
                {!!it.file_format && <Meta icon="document-outline" text={it.file_format.toUpperCase()} />}
                {!!it.file_size && <Meta icon="server-outline" text={fmtSize(it.file_size)} />}
                {!!it.pages && <Meta icon="layers-outline" text={`${it.pages} صفحة`} />}
                {!!it.publish_year && <Meta icon="calendar-outline" text={String(it.publish_year)} />}
                <Meta icon="language-outline" text={LANG_LABEL[it.language] || it.language} />
                <Meta icon="download-outline" text={`${it.downloads} قراءة`} />
              </View>
              {it.featured && <Text style={st.feat}>★ من مختارات المشرفين</Text>}
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {it.featured && <Text style={st.feat}>★ من مختارات المشرفين</Text>}
            <Text style={[st.title, { fontSize: 22, lineHeight: 34 }]}>{it.title}</Text>
            <View style={[u.rowR, { gap: 10, flexWrap: "wrap" }]}>
              <Meta icon="person-outline" text={it.author_name || it.uploader_name} />
              {!!it.read_minutes && <Meta icon="time-outline" text={`${it.read_minutes} دقائق قراءة`} />}
              <Meta icon="calendar-outline" text={fmtDate(it.reviewed_at || it.created_at)} />
              <Meta icon="eye-outline" text={`${it.views} مشاهدة`} />
            </View>
          </View>
        )}

        {isBook && it.has_file && (
          <Pressable onPress={openFile} style={[u.primaryBtn, { marginTop: 16 }]} accessibilityRole="button">
            <Ionicons name={it.source === "link" ? "open-outline" : "book-outline"} size={19} color="#fff" />
            <Text style={u.primaryText}>{it.source === "link" ? "فتح رابط الكتاب" : "قراءة / تنزيل الكتاب"}</Text>
          </Pressable>
        )}

        {!!it.description && (
          <View style={[u.card, { marginTop: 16 }]}>
            <Text style={st.h}>{isBook ? "نبذة عن الكتاب" : "ملخّص"}</Text>
            <Text style={st.desc}>{it.description}</Text>
          </View>
        )}

        {!isBook && !!it.body && (
          <>
            <View style={[u.rowR, { justifyContent: "flex-start", gap: 6, marginTop: 14 }]}>
              <Pressable onPress={() => setFontSize((f) => Math.min(22, f + 1))} style={st.fontBtn} accessibilityLabel="تكبير الخط"><Text style={st.fontBtnT}>أ+</Text></Pressable>
              <Pressable onPress={() => setFontSize((f) => Math.max(13, f - 1))} style={st.fontBtn} accessibilityLabel="تصغير الخط"><Text style={st.fontBtnT}>أ−</Text></Pressable>
            </View>
            <View style={[u.card, { marginTop: 8, paddingVertical: 18 }]}>
              {it.body.split(/\n{2,}/).map((p, i) => {
                const heading = /^#{1,3}\s/.test(p);
                return (
                  <Text key={i} style={[st.body, { fontSize: heading ? fontSize + 2 : fontSize, lineHeight: (heading ? fontSize + 2 : fontSize) * 1.85 }, heading && { fontFamily: "Cairo_700Bold", color: ITHRAA }]}>
                    {heading ? p.replace(/^#{1,3}\s/, "") : p.trim()}
                  </Text>
                );
              })}
            </View>
          </>
        )}

        {it.tags.length > 0 && (
          <View style={[u.wrap, { marginTop: 12 }]}>
            {it.tags.map((t) => <Text key={t} style={st.tag}>#{t}</Text>)}
          </View>
        )}

        <View style={[u.card, { marginTop: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10 }]}>
          <Pressable onPress={() => it.uploader_id && router.push({ pathname: "/profile", params: { id: String(it.uploader_id) } } as any)}>
            <UserAvatar name={it.uploader_name} avatarUrl={it.uploader_avatar} size={40} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.h}>شارك بها: {it.uploader_name}</Text>
            <Text style={u.hint}>{fmtDate(it.created_at)}{rights ? ` · ${rights.label}` : ""}{it.reviewer_name ? ` · راجعها ${it.reviewer_name}` : ""}</Text>
          </View>
        </View>

        {can_review && (
          <View style={[u.card, { marginTop: 14, borderColor: ITHRAA + "44" }]}>
            <View style={[u.rowR, { gap: 6 }]}>
              <Ionicons name="shield-checkmark" size={18} color={ITHRAA} />
              <Text style={st.h}>إجراءات المشرف</Text>
            </View>
            {it.status !== "approved" && (
              <TextInput value={note} onChangeText={setNote} placeholder="ملاحظة لصاحب المساهمة (إلزامية عند الرفض)" placeholderTextColor={Colors.textMuted} style={[u.input, { marginTop: 10, minHeight: 60, textAlignVertical: "top" }]} multiline />
            )}
            <View style={[u.wrap, { marginTop: 10 }]}>
              {it.status !== "approved" && <ActBtn label="موافقة ونشر" icon="checkmark-circle" color="#0E8A5F" onPress={() => act("approve")} busy={busy} />}
              {it.status === "pending" && <ActBtn label="رفض مع ملاحظة" icon="close-circle" color="#C0392B" onPress={() => act("reject")} busy={busy} />}
              {it.status === "approved" && <ActBtn label={it.featured ? "إلغاء التمييز" : "تمييز ضمن المختارات"} icon="star" color={ITHRAA_GOLD} onPress={() => act(it.featured ? "unfeature" : "feature")} busy={busy} />}
              {it.status === "approved" && <ActBtn label="إلغاء النشر" icon="eye-off" color="#B7791F" onPress={() => act("unpublish")} busy={busy} />}
            </View>
          </View>
        )}

        {canEdit && (
          <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
            <Pressable onPress={() => router.push({ pathname: "/ithraa-submit", params: { edit: String(it.id) } } as any)} style={[u.ghostBtn, { flex: 1 }]}>
              <Ionicons name="create-outline" size={16} color={Colors.textPrimary} /><Text style={u.ghostText}>{it.status === "rejected" && is_owner ? "تعديل وإعادة الإرسال" : "تعديل"}</Text>
            </Pressable>
            <Pressable onPress={remove} style={[u.ghostBtn, { flex: 1, borderColor: "#C0392B55" }]}>
              <Ionicons name="trash-outline" size={16} color="#C0392B" /><Text style={[u.ghostText, { color: "#C0392B" }]}>حذف</Text>
            </Pressable>
          </View>
        )}

        {related.length > 0 && (
          <>
            <SectionTitle title={`من رف «${it.category_label}»`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }] }} contentContainerStyle={{ gap: 12 }}>
              {related.map((r) => (
                <View key={r.id} style={{ transform: [{ scaleX: -1 }] }}>
                  <BookTile item={r} width={96} onPress={() => router.push({ pathname: "/ithraa-item", params: { id: String(r.id) } } as any)} />
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActBtn({ label, icon, color, onPress, busy }: { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[st.act, { backgroundColor: color + "14", borderColor: color + "55", opacity: busy ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[st.actT, { color }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg, padding: 24 },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8 },
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "center" },
  banner: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderRadius: 12, padding: 10, marginBottom: 14 },
  bannerText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right", lineHeight: 30 },
  author: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: ITHRAA, textAlign: "right" },
  feat: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: ITHRAA_GOLD, textAlign: "right" },
  h: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24, marginTop: 6 },
  body: { fontFamily: "Cairo_400Regular", color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
  tag: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: ITHRAA, backgroundColor: ITHRAA + "12", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  fontBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  fontBtnT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  actT: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
});
