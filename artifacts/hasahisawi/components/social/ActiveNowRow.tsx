// «النشطون الآن» — شريط أفقي في المساحة الاجتماعية + قائمة كاملة
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, FlatList, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import VerifiedBadge from "@/components/VerifiedBadge";
import { ActiveUser, profileApi } from "@/lib/profile-api";

const openProfile = (id: number) => router.push({ pathname: "/profile" as any, params: { id: String(id) } });
const openChat = (u: ActiveUser) => router.push({ pathname: "/conversation" as any, params: { userId: String(u.id), otherName: u.name } });

export default function ActiveNowRow({ token, enabled = true }: { token?: string | null; enabled?: boolean }) {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try { const r = await profileApi.activeNow(token); setUsers(r.users); setTotal(r.total); } catch {}
  }, [token]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => { if (AppState.currentState === "active") load(); }, 45000);
    return () => clearInterval(t);
  }, [enabled, load]);

  if (!users.length) return null;

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <View style={st.titleRow}>
          <View style={st.pulse} />
          <Text style={st.title}>النشطون الآن</Text>
          <Text style={st.count}>{total}</Text>
        </View>
        <TouchableOpacity onPress={() => setOpen(true)} hitSlop={8}><Text style={st.all}>عرض الكل</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
        {users.slice(0, 20).map((u) => (
          <TouchableOpacity key={u.id} style={st.item} onPress={() => openProfile(u.id)} activeOpacity={0.8}>
            <View>
              <View style={[st.ring, u.is_verified && { borderColor: "#1D9BF0" }]}>
                <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={50} borderRadius={25} />
              </View>
              <View style={st.dot} />
            </View>
            <View style={st.nameRow}>
              <Text style={st.name} numberOfLines={1}>{u.name.split(" ")[0]}</Text>
              {u.is_verified && <VerifiedBadge size={11} />}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={st.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[st.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={st.handle} />
            <View style={[st.head, { paddingHorizontal: 16 }]}>
              <View style={st.titleRow}><View style={st.pulse} /><Text style={st.title}>النشطون الآن</Text><Text style={st.count}>{total}</Text></View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <FlatList
              data={users}
              keyExtractor={(u) => String(u.id)}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity style={st.li} onPress={() => { setOpen(false); openProfile(u.id); }}>
                  <View>
                    <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={46} borderRadius={16} />
                    <View style={[st.dot, { bottom: -1, left: -1 }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={st.nameRowL}>
                      <Text style={st.liName} numberOfLines={1}>{u.name}</Text>
                      {u.is_verified && <VerifiedBadge size={14} />}
                    </View>
                    <Text style={st.liSub} numberOfLines={1}>{u.headline || u.profession || "نشط الآن"}</Text>
                  </View>
                  {token ? (
                    <TouchableOpacity style={st.chatBtn} onPress={() => { setOpen(false); openChat(u); }} hitSlop={6}>
                      <Ionicons name="chatbubble-ellipses" size={17} color={Colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              )}
              ListFooterComponent={<Text style={st.foot}>يظهر هنا من فعّل «حالة النشاط» وفتح التطبيق خلال آخر دقيقتين</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4, backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider, paddingVertical: 10 },
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, marginBottom: 6 },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  pulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#22C55E" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  count: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#16A34A", backgroundColor: "#DCFCE7", paddingHorizontal: 7, borderRadius: 10, overflow: "hidden" },
  all: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.primary },
  row: { paddingHorizontal: 12, gap: 12, flexDirection: "row-reverse" },
  item: { alignItems: "center", gap: 4, width: 62 },
  ring: { width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, borderColor: "#22C55E", alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  dot: { position: "absolute", bottom: 2, left: 2, width: 15, height: 15, borderRadius: 8, backgroundColor: "#22C55E", borderWidth: 2.5, borderColor: "#fff" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 2, maxWidth: 62 },
  name: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", maxWidth: 50 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingTop: 8 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, marginBottom: 8 },
  li: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  nameRowL: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  liName: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", flexShrink: 1 },
  liSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  chatBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  foot: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "center", padding: 14 },
});
