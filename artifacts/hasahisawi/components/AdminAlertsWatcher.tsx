// تنبيه صوتي ومرئي فوري للإدارة عند وصول أي طلب جديد (انضمام، حجز، دفع…).
// يعمل أثناء فتح التطبيق؛ وعند إغلاقه يصل الإشعار الفوري (Push) بصوت عاجل من الخادم.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { SlideInUp, SlideOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { playSound } from "@/lib/sounds";
import { setAdminUnread } from "@/lib/admin-alerts-store";

export type AdminAlert = { id: number; kind: string; title: string; body: string; screen: string; created_at: string; phone?: string | null };

const POLL_MS = 20_000;

/** Short two-tone chime for the web (no audio file / autoplay-safe after first tap). */
function webChime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
    };
    tone(880, 0, 0.22); tone(1320, 0.2, 0.32); tone(880, 0.6, 0.22); tone(1320, 0.8, 0.36);
    setTimeout(() => ctx.close?.(), 1600);
  } catch {}
}

function ring() {
  if (Platform.OS === "web") webChime();
  else {
    playSound("alert");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}

export default function AdminAlertsWatcher() {
  const { user, token } = useAuth();
  const isStaff = !!token && (user?.role === "admin" || user?.role === "moderator");
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<AdminAlert[]>([]);
  const baseline = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!isStaff) return;
    try {
      const after = baseline.current ?? 0;
      const r = await fetch(`${getApiUrl()}/api/admin/alerts?after=${after}&limit=10`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d = await r.json();
      setAdminUnread(Number(d.unread) || 0);
      if (baseline.current === null) { baseline.current = Number(d.latest_id) || 0; return; }
      const fresh: AdminAlert[] = (d.alerts || []).filter((a: AdminAlert) => Number(a.id) > (baseline.current ?? 0));
      if (fresh.length) {
        baseline.current = Math.max(...fresh.map((a) => Number(a.id)));
        setQueue((q) => [...fresh.reverse(), ...q].slice(0, 5));
        ring();
      }
    } catch { /* offline — try again next tick */ }
  }, [isStaff, token]);

  useEffect(() => {
    baseline.current = null;
    setQueue([]);
    if (!isStaff) { setAdminUnread(0); return; }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") poll(); });
    return () => { if (timer.current) clearInterval(timer.current); sub.remove(); };
  }, [isStaff, poll]);

  // auto-dismiss the top banner after 12s
  useEffect(() => {
    if (!queue.length) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 12_000);
    return () => clearTimeout(t);
  }, [queue]);

  if (!isStaff || !queue.length) return null;
  const a = queue[0];
  return (
    <Animated.View key={a.id} entering={SlideInUp.springify().damping(16)} exiting={SlideOutUp} style={[s.wrap, { top: insets.top + 8 }]}>
      <Pressable onPress={() => { setQueue([]); router.push("/admin-requests" as any); }} style={s.card}>
        <View style={s.iconBox}><Ionicons name="notifications" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{a.title}</Text>
          <Text style={s.body} numberOfLines={2}>{a.body}</Text>
          <Text style={s.hint}>{queue.length > 1 ? `+${queue.length - 1} طلبات أخرى · ` : ""}اضغط للمراجعة</Text>
        </View>
        <Pressable hitSlop={10} onPress={() => setQueue((q) => q.slice(1))} style={s.x}>
          <Ionicons name="close" size={16} color="#7A5A00" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 10000, alignItems: "center" },
  card: {
    width: "100%", maxWidth: 520, flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: "#FFF8E1", borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: "#E8A900",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E8A900", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#3D2E00", textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#5C4A12", textAlign: "right", lineHeight: 19 },
  hint: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#946B00", textAlign: "right", marginTop: 2 },
  x: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#F7E3A6", alignItems: "center", justifyContent: "center" },
});
