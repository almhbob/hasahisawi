import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const UC  = "#1F5C8A";
const UC2 = "#9DBBD6";

type Post = { id: number; title: string; body: string; image_url?: string | null; is_pinned: boolean; created_at: string; author_name?: string | null; author_title?: string | null };

function fmtDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return s; }
}

export default function StudentUnionNewsScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/student-union/posts?limit=100`);
      const d = await r.json();
      if (!r.ok) throw new Error();
      setPosts(d.posts || []); setError(false);
    } catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>أخبار وإعلانات الاتحاد</Text>
          <Text style={s.headerSub}>اتحاد طلاب محلية الحصاحيصا</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? <ActivityIndicator color={UC} style={{ marginTop: 60 }} /> : (
        <FlatList
          data={posts}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? "cloud-offline-outline" : "megaphone-outline"} size={46} color={Colors.textMuted} />
              <Text style={s.emptyText}>{error ? "تعذّر تحميل الأخبار" : "لا توجد أخبار بعد"}</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify()} style={[s.card, item.is_pinned && { borderColor: "#F59E0B60" }]}>
              {item.image_url ? <Image source={{ uri: item.image_url }} style={s.img} resizeMode="cover" /> : null}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                {item.is_pinned && <Ionicons name="pin" size={14} color="#F59E0B" />}
                <Text style={s.title}>{item.title}</Text>
              </View>
              <Text style={s.body}>{item.body}</Text>
              <Text style={s.meta}>{fmtDate(item.created_at)}{item.author_name ? ` · ${item.author_name}${item.author_title ? ` (${item.author_title})` : ""}` : ""}</Text>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, textAlign: "center", marginTop: 2 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, gap: 6 },
  img: { width: "100%", height: 170, borderRadius: 12, marginBottom: 4, backgroundColor: Colors.bg },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15.5, color: Colors.text, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", lineHeight: 23 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 60 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted },
});
