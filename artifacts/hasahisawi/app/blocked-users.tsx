import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import UserAvatar from "@/components/UserAvatar";
import { fetchBlockedUsers, unblockUser, type BlockedUser } from "@/lib/social-safety";
import { confirmAction, notify } from "@/lib/xplatform";

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token || isGuest) { setLoading(false); return; }
    setError("");
    try {
      setItems(await fetchBlockedUsers(token));
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isGuest]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unblock = async (u: BlockedUser) => {
    const ok = await confirmAction(`إلغاء حظر ${u.name}؟`, "سيظهر محتواه لك مجدداً ويرى محتواك.", "إلغاء الحظر");
    if (!ok) return;
    setBusyId(u.id);
    try {
      await unblockUser(u.id, token);
      setItems((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e: any) {
      notify("تعذّر إلغاء الحظر", e?.message || "حاول مرة أخرى");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings" as any))}
          accessibilityLabel="رجوع"
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>المستخدمون المحظورون</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => String(u.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <Text style={s.hint}>
              من تحظره لا ترى منشوراته وتعليقاته في المجتمع، ولا يرى منشوراتك وتعليقاتك. لا يُبلَّغ بأنك حظرته.
            </Text>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? "cloud-offline-outline" : "happy-outline"} size={52} color={Colors.divider} />
              <Text style={s.emptyText}>{error || "لم تحظر أحداً"}</Text>
              {error ? (
                <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); load(); }}>
                  <Text style={s.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <UserAvatar name={item.name} avatarUrl={item.avatar_url} size={44} borderRadius={14} />
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity style={s.unblockBtn} onPress={() => unblock(item)} disabled={busyId === item.id}>
                {busyId === item.id
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={s.unblockText}>إلغاء الحظر</Text>}
              </TouchableOpacity>
            </View>
          )}
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
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6, lineHeight: 22 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.border },
  name: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.text, textAlign: "right" },
  unblockBtn: { minWidth: 96, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  unblockText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retry: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primary },
  retryText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
});
