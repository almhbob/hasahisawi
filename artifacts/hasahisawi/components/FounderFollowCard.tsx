// بطاقة «تابِع مؤسس حصاحيصاوي» — تظهر لمن لا يتابعه بعد، ويمكن إخفاؤها
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const KEY = "hsw_founder_card_hidden_v1";

export default function FounderFollowCard() {
  const { token, isGuest } = useAuth();
  const [d, setD] = useState<any>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setHidden(v === "1")).catch(() => setHidden(false));
    fetch(`${getApiUrl()}/api/users/founder`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json()).then(setD).catch(() => {});
  }, [token]);
  if (hidden || !d?.founder || d.is_me || d.i_follow) return null;
  const f = d.founder;
  const follow = async () => {
    if (!token || isGuest) return router.push("/login" as any);
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/users/${f.id}/follow`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setD({ ...d, i_follow: true, followers: d.followers + 1 });
    } finally { setBusy(false); }
  };
  return (
    <LinearGradient colors={["#00966A", "#004D36"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={st.card}>
      <Pressable onPress={() => { setHidden(true); AsyncStorage.setItem(KEY, "1").catch(() => {}); }} style={st.close} hitSlop={10} accessibilityLabel="إخفاء">
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: "/profile", params: { id: String(f.id) } } as any)} style={st.row}>
        <View style={st.avRing}>{f.avatar_url ? <Image source={{ uri: f.avatar_url }} style={st.av} /> : <Ionicons name="person" size={26} color="#00966A" />}</View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
            <Text style={st.name} numberOfLines={1}>{f.name}</Text>
            <Ionicons name="checkmark-circle" size={16} color="#E8A900" />
          </View>
          <Text style={st.title}>{f.title}</Text>
          <Text style={st.sub}>{d.followers ? `${d.followers.toLocaleString("ar-EG")} متابِع · ` : ""}تابِع آخر تحديثات التطبيق وخدمات المدينة</Text>
        </View>
      </Pressable>
      <Pressable onPress={follow} disabled={busy} style={[st.btn, busy && { opacity: 0.6 }]} accessibilityRole="button">
        <Ionicons name="person-add" size={16} color="#3D2C00" /><Text style={st.btnT}>متابعة المؤسس</Text>
      </Pressable>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 22, padding: 14, gap: 12, marginHorizontal: 12, marginVertical: 8 },
  close: { position: "absolute", top: 10, left: 10, zIndex: 2 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: "#E8A900", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  av: { width: 52, height: 52, borderRadius: 26 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right", flexShrink: 1 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#E8A900", textAlign: "right" },
  sub: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#E8A900", borderRadius: 14, paddingVertical: 10 },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#3D2C00" },
});
