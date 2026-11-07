/** 🕊️ مراجعة بلاغات الوفاة وإدارة حسابات الصدقة الجارية */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu, NeuRaised } from "@/components/auth/neu";
import ImageLightbox from "@/components/ImageLightbox";
import UserAvatar from "@/components/UserAvatar";

export default function AdminMemorials() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const api = getApiUrl();
  const [items, setItems] = useState<any[] | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const load = useCallback(async () => {
    const r = await fetch(`${api}/api/admin/memorials`, { headers }).then(x => x.json()).catch(() => ({ memorials: [] }));
    setItems(r.memorials || []);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const act = async (m: any, body: any) => {
    setBusy(m.id);
    const r = await fetch(`${api}/api/admin/memorials/${m.id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return notify("خطأ", d.error);
    if (d.removed) notify("تم تأكيد الوفاة", `حُذف: ${d.removed.posts} منشور، ${d.removed.comments} تعليق، ${d.removed.chats} محادثة. بدأ النشر اليومي صدقةً جارية.`);
    load();
  };
  const confirm = async (m: any) => {
    if (!(await confirmAction("تأكيد الوفاة", `هذا الإجراء نهائي: تُحذف منشورات «${m.name}» (${m.user_posts}) وتعليقاته ومحادثاته، ويُغلق حسابه ويتحول لصفحة صدقة جارية. تأكد من صحة الشهادة.`, "تأكيد نهائي", true))) return;
    act(m, { status: "confirmed" });
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={s.title}>حسابات المتوفين</Text><Text style={s.sub}>بلاغات الوفاة والصدقة الجارية</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {items === null ? <ActivityIndicator style={{ marginTop: 30 }} /> : items.length === 0 ? <Text style={[s.muted, { textAlign: "center", padding: 30 }]}>لا توجد بلاغات</Text> : items.map(m => (
          <NeuRaised key={m.id} radius={20} depth={6} style={[s.card, m.status === "pending" && { borderWidth: 1.5, borderColor: "#F7D76A" }]}>
            <View style={s.row}>
              <UserAvatar name={m.name} avatarUrl={m.avatar_url || undefined} size={44} borderRadius={14} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{m.name}</Text>
                <Text style={s.muted}>{m.phone} · {m.user_posts} منشور</Text>
              </View>
              <View style={[s.badge, { backgroundColor: m.status === "pending" ? "#FFF7E0" : m.status === "confirmed" ? "#D3F1E5" : "#FDECEC" }]}>
                <Text style={[s.badgeText, { color: m.status === "pending" ? "#6B4D00" : m.status === "confirmed" ? "#004D36" : "#A32020" }]}>{m.status === "pending" ? "قيد المراجعة" : m.status === "confirmed" ? "مؤكد" : "مرفوض"}</Text>
              </View>
            </View>
            <Text style={s.info}>المبلِّغ: {m.reporter_name} ({m.relation}) · {m.reporter_phone || ""}</Text>
            {m.death_date ? <Text style={s.info}>تاريخ الوفاة: {new Date(m.death_date).toLocaleDateString("ar-SD")}</Text> : null}
            {m.notes ? <Text style={s.info}>{m.notes}</Text> : null}
            {m.certificate_url ? (
              <Pressable onPress={() => setZoom(m.certificate_url)} style={s.cert} accessibilityLabel="عرض الشهادة">
                <Image source={{ uri: m.certificate_url }} style={s.certImg} resizeMode="cover" />
                <View style={s.certTag}><Ionicons name="document-text" size={13} color="#fff" /><Text style={s.certTagText}>شهادة الوفاة — اضغط للتكبير</Text></View>
              </Pressable>
            ) : null}
            {m.status === "pending" ? (
              <View style={s.row}>
                <TouchableOpacity onPress={() => confirm(m)} disabled={busy === m.id} style={[s.btn, { backgroundColor: "#006B4A", flex: 2 }]}>
                  {busy === m.id ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={s.btnText}>تأكيد الوفاة</Text></>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => act(m, { status: "rejected", reason: "تعذّر التحقق من البيانات" })} style={[s.btn, { borderWidth: 1, borderColor: "#EF444466" }]}><Text style={[s.btnText, { color: "#D93636" }]}>رفض</Text></TouchableOpacity>
              </View>
            ) : m.status === "confirmed" ? (
              <View style={s.row}>
                <Text style={[s.info, { flex: 1 }]}>نُشر {m.posts_count} منشور صدقة · {m.duas_count} دعوة</Text>
                <Text style={s.muted}>النشر اليومي</Text>
                <Switch value={m.auto_post} onValueChange={v => act(m, { auto_post: v })} />
                <TouchableOpacity onPress={() => router.push({ pathname: "/memorial", params: { user: String(m.user_id) } } as any)}><Ionicons name="open-outline" size={20} color={Colors.primary} /></TouchableOpacity>
              </View>
            ) : null}
          </NeuRaised>
        ))}
      </ScrollView>
      <ImageLightbox uri={zoom} onClose={() => setZoom(null)} title="شهادة الوفاة" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  card: { padding: 14, gap: 8 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  badge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  info: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  cert: { height: 140, borderRadius: 14, overflow: "hidden" },
  certImg: { width: "100%", height: "100%" },
  certTag: { position: "absolute", bottom: 8, right: 8, flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  certTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff" },
  btn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
});
