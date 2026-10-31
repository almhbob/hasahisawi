import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import VerifiedBadge from "@/components/VerifiedBadge";
import { fetchFollowList, followUser, unfollowUser, type FollowUser } from "@/lib/social-follow";
import { notify } from "@/lib/xplatform";

/** قائمة المتابِعين / المتابَعين لمستخدم. */
export default function FollowsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; kind?: string; name?: string }>();
  const userId = Number(params.id);
  const [kind, setKind] = useState<"followers" | "following">(params.kind === "following" ? "following" : "followers");
  const { token, user, isGuest } = useAuth();
  const myId = user?.id != null ? Number(user.id) : null;
  const [items, setItems] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(userId) || userId <= 0) { setLoading(false); setError("مستخدم غير صالح"); return; }
    setError("");
    try {
      setItems(await fetchFollowList(userId, kind, token));
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, kind, token]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const toggle = async (u: FollowUser) => {
    if (!token || isGuest) { notify("تسجيل مطلوب", "سجّل الدخول لتتابع الأشخاص."); return; }
    setBusyId(u.id);
    try {
      await (u.i_follow ? unfollowUser(u.id, token) : followUser(u.id, token));
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, i_follow: !u.i_follow } : x)));
    } catch (e: any) {
      notify("تعذّر التنفيذ", e?.message || "حاول مرة أخرى");
    } finally {
      setBusyId(null);
    }
  };

  const title = params.name ? String(params.name) : "المتابعة";

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))}
          accessibilityLabel="رجوع"
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabs}>
        {(["followers", "following"] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[s.tab, kind === k && s.tabOn]}
            onPress={() => setKind(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === k }}
          >
            <Text style={[s.tabText, kind === k && s.tabTextOn]}>{k === "followers" ? "المتابِعون" : "يتابع"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? "cloud-offline-outline" : "people-outline"} size={52} color={Colors.divider} />
              <Text style={s.emptyText}>{error || (kind === "followers" ? "لا يوجد متابِعون بعد" : "لا يتابع أحداً بعد")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/profile" as any, params: { id: String(item.id) } })}
            >
              <UserAvatar name={item.name} avatarUrl={item.avatar_url} size={44} borderRadius={14} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                  <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  {item.is_verified ? <VerifiedBadge size={14} /> : null}
                </View>
                {item.headline ? <Text style={s.headline} numberOfLines={1}>{item.headline}</Text> : null}
              </View>
              {myId !== item.id && !isGuest && (
                <TouchableOpacity
                  style={[s.followBtn, item.i_follow && s.followingBtn]}
                  onPress={() => toggle(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id
                    ? <ActivityIndicator size="small" color={item.i_follow ? Colors.primary : "#fff"} />
                    : <Text style={[s.followText, item.i_follow && { color: Colors.primary }]}>{item.i_follow ? "تتابعه" : "متابعة"}</Text>}
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "center" },
  tabs: { flexDirection: "row-reverse", marginHorizontal: 16, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Colors.border },
  tab: { flex: 1, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  tabTextOn: { color: "#fff" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.border },
  name: { flexShrink: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.text, textAlign: "right" },
  headline: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  followBtn: { minWidth: 84, height: 34, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.primary },
  followText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
});
