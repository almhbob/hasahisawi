import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { REPORT_REASONS } from "@/lib/social-safety";
import { confirmAction, notify } from "@/lib/xplatform";

type ReportGroup = {
  target_type: "post" | "comment";
  target_id: number;
  reports_count: number;
  last_reported_at: string;
  reasons: string[];
  details: string[];
  content: string | null;
  author_name: string | null;
  author_id: number | null;
  image_url: string | null;
};

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));

function firstImage(v: string | null): string | null {
  if (!v) return null;
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr[0] || null;
  } catch {}
  return /^https?:\/\//.test(v) ? v : null;
}

/** مراجعة بلاغات المجتمع — للإدارة والمشرفين فقط. */
export default function AdminSocialReportsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "moderator";
  const [items, setItems] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !isStaff) { setLoading(false); return; }
    setError("");
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/admin/social-reports?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `خطأ (${res.status})`);
      setItems(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isStaff]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resolve = async (g: ReportGroup, action: "remove" | "dismiss") => {
    const what = g.target_type === "post" ? "المنشور" : "التعليق";
    const ok = await confirmAction(
      action === "remove" ? `حذف ${what}؟` : "رفض البلاغات؟",
      action === "remove" ? `سيُحذف ${what} نهائياً وتُغلق بلاغاته.` : `سيبقى ${what} ظاهراً وتُغلق بلاغاته.`,
      action === "remove" ? "حذف" : "رفض البلاغات",
      action === "remove",
    );
    if (!ok) return;
    const key = `${g.target_type}-${g.target_id}`;
    setBusy(key);
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/admin/social-reports/resolve`, {
        method: "POST",
        offlineQueue: false,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_type: g.target_type, target_id: g.target_id, action }),
      } as any);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `خطأ (${res.status})`);
      setItems((prev) => prev.filter((x) => !(x.target_type === g.target_type && x.target_id === g.target_id)));
    } catch (e: any) {
      notify("تعذّر التنفيذ", e?.message || "حاول مرة أخرى");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin" as any))}
          accessibilityLabel="رجوع"
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>بلاغات المجتمع</Text>
        <View style={{ width: 40 }} />
      </View>

      {!isStaff ? (
        <View style={s.empty}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.divider} />
          <Text style={s.emptyText}>هذه الصفحة للإدارة فقط</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(g) => `${g.target_type}-${g.target_id}`}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? "cloud-offline-outline" : "checkmark-done-circle-outline"} size={52} color={error ? Colors.divider : Colors.success} />
              <Text style={s.emptyText}>{error || "لا توجد بلاغات بانتظار المراجعة"}</Text>
            </View>
          }
          renderItem={({ item: g }) => {
            const key = `${g.target_type}-${g.target_id}`;
            const img = g.target_type === "post" ? firstImage(g.image_url) : null;
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.countPill}>
                    <Ionicons name="flag" size={12} color="#fff" />
                    <Text style={s.countText}>{g.reports_count}</Text>
                  </View>
                  <Text style={s.kind}>{g.target_type === "post" ? "منشور" : "تعليق"}</Text>
                  <Text
                    style={[s.author, g.author_id ? { color: Colors.primary } : null]}
                    onPress={g.author_id ? () => router.push({ pathname: "/profile" as any, params: { id: String(g.author_id) } }) : undefined}
                    numberOfLines={1}
                  >
                    {g.author_name || "مجهول"}
                  </Text>
                </View>
                <View style={s.reasons}>
                  {g.reasons.map((r) => (
                    <View key={r} style={s.reasonChip}><Text style={s.reasonText}>{REASON_LABEL[r] || r}</Text></View>
                  ))}
                </View>
                {g.content == null ? (
                  <Text style={[s.content, { color: Colors.textMuted }]}>المحتوى حُذف مسبقاً</Text>
                ) : (
                  <Text style={s.content} numberOfLines={6}>{g.content || "(بدون نص)"}</Text>
                )}
                {img ? <Image source={{ uri: img }} style={s.img} resizeMode="cover" /> : null}
                {g.details.length > 0 && (
                  <View style={s.details}>
                    {g.details.slice(0, 3).map((d, i) => <Text key={i} style={s.detailText}>«{d}»</Text>)}
                  </View>
                )}
                <View style={s.actions}>
                  <TouchableOpacity style={[s.btn, { backgroundColor: Colors.danger }]} disabled={busy === key} onPress={() => resolve(g, "remove")}>
                    {busy === key ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>حذف المحتوى</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn, s.btnGhost]} disabled={busy === key} onPress={() => resolve(g, "dismiss")}>
                    <Text style={[s.btnText, { color: Colors.textSecondary }]}>إبقاء ورفض البلاغ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  countPill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: Colors.danger, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  kind: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  author: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "left" },
  reasons: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  reasonChip: { backgroundColor: Colors.dangerSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  reasonText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.danger },
  content: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", lineHeight: 22 },
  img: { width: "100%", height: 180, borderRadius: 12, backgroundColor: Colors.bg },
  details: { gap: 4, backgroundColor: Colors.bg, borderRadius: 10, padding: 10 },
  detailText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  actions: { flexDirection: "row-reverse", gap: 10 },
  btn: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});
