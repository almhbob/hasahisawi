// شاشة المكالمة الصوتية عبر الإنترنت (WebRTC داخل WebView مخفي)
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, PermissionsAndroid, Vibration, BackHandler, Alert, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import UserAvatar from "@/components/UserAvatar";
import { callsApi, callPageUrl, setActiveCall, type VoiceCall } from "@/lib/calls";

type Phase = "loading" | "incoming" | "ringing" | "connecting" | "active" | "ended";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function micPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: "إذن الميكروفون", message: "يحتاج التطبيق الميكروفون لإجراء المكالمة الصوتية", buttonPositive: "سماح", buttonNegative: "رفض",
    });
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ callId: string; role?: string; name?: string; avatar?: string }>();
  const callId = Number(p.callId);
  const role: "caller" | "callee" = p.role === "caller" ? "caller" : "callee";
  const { token } = useAuth();

  const [call, setCall] = useState<VoiceCall | null>(null);
  const [ice, setIce] = useState<any[] | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [endText, setEndText] = useState("");
  const [webOn, setWebOn] = useState(false);
  const web = useRef<WebView>(null);
  const ring = useRef<any>(null);
  const finished = useRef(false);

  const otherName = (role === "caller" ? call?.callee_name : call?.caller_name) || p.name || "مستخدم";
  const otherAvatar = (role === "caller" ? call?.callee_avatar : call?.caller_avatar) ?? p.avatar ?? null;

  // ── نغمة الرنين للمكالمة الواردة ──
  const stopRing = useCallback(() => {
    Vibration.cancel();
    const s = ring.current; ring.current = null;
    if (s) { s.stopAsync().catch(() => {}); s.unloadAsync().catch(() => {}); }
  }, []);
  const startRing = useCallback(async () => {
    if (Platform.OS === "web") return;
    Vibration.vibrate([0, 900, 700], true);
    try {
      const { Audio } = await import("expo-av");
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync(require("../assets/sounds/hasahisawi_urgent.wav"), { shouldPlay: true, isLooping: true, volume: 1 });
      if (finished.current) { sound.unloadAsync().catch(() => {}); return; }
      ring.current = sound;
    } catch {}
  }, []);

  const close = useCallback((text: string) => {
    if (finished.current) return;
    finished.current = true;
    stopRing();
    setWebOn(false);
    setEndText(text);
    setPhase("ended");
    setTimeout(() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/chat" as any); }, 1400);
  }, [stopRing]);

  // ── التحميل ──
  useEffect(() => {
    if (!token || !callId) return;
    setActiveCall(callId);
    let alive = true;
    (async () => {
      try {
        const r = await callsApi.get(token, callId);
        if (!alive) return;
        setCall(r.call); setIce(r.ice);
        if (!["ringing", "accepted"].includes(r.call.status)) { close(r.call.status === "missed" ? "انتهت المكالمة" : "المكالمة منتهية"); return; }
        if (role === "callee") {
          if (r.call.status === "ringing") { setPhase("incoming"); startRing(); }
          else close("المكالمة منتهية");
        } else {
          if (!(await micPermission())) { callsApi.end(token, callId).catch(() => {}); close("لا يمكن الاتصال بدون إذن الميكروفون"); return; }
          setPhase("ringing"); setWebOn(true);
        }
      } catch (e: any) { close(e?.message || "تعذّر فتح المكالمة"); }
    })();
    return () => { alive = false; };
  }, [token, callId]); // eslint-disable-line react-hooks/exhaustive-deps

  // المكالمة الواردة: إن ألغاها المتصل قبل الرد
  useEffect(() => {
    if (phase !== "incoming" || !token) return;
    const t = setInterval(async () => {
      try { const r = await callsApi.get(token, callId); if (r.call.status !== "ringing") close("فاتتك المكالمة"); } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [phase, token, callId, close]);

  // عدّاد المدة
  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // عند مغادرة الشاشة: أنهِ المكالمة
  useEffect(() => () => {
    stopRing(); setActiveCall(null);
    if (!finished.current && token && callId) callsApi.end(token, callId).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hangup = useCallback(() => {
    web.current?.injectJavaScript(`window.__cmd && window.__cmd({type:"hangup"}); true;`);
    if (token) callsApi.end(token, callId).catch(() => {});
    close(phase === "active" ? `انتهت المكالمة · ${fmt(secs)}` : "أُلغيت المكالمة");
  }, [token, callId, close, phase, secs]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "ended") return false;
      Alert.alert("إنهاء المكالمة؟", "", [{ text: "متابعة المكالمة", style: "cancel" }, { text: "إنهاء", style: "destructive", onPress: hangup }]);
      return true;
    });
    return () => sub.remove();
  }, [phase, hangup]);

  const accept = async () => {
    if (!token) return;
    stopRing();
    if (!(await micPermission())) { callsApi.decline(token, callId).catch(() => {}); close("لا يمكن الرد بدون إذن الميكروفون"); return; }
    try {
      const r = await callsApi.accept(token, callId);
      setIce(r.ice); setPhase("connecting"); setWebOn(true);
    } catch (e: any) { close(e?.message || "انتهت المكالمة"); }
  };
  const decline = () => { if (token) callsApi.decline(token, callId).catch(() => {}); close("رُفضت المكالمة"); };

  const toggleMute = () => {
    const v = !muted; setMuted(v);
    web.current?.injectJavaScript(`window.__cmd && window.__cmd({type:"mute",on:${v}}); true;`);
  };

  const onMessage = (e: any) => {
    let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === "status" && m.status === "accepted" && phase === "ringing") setPhase("connecting");
    if (m.type === "conn") {
      if (m.state === "connected") { setPhase("active"); Vibration.vibrate(60); }
      if (m.state === "failed") { if (token) callsApi.end(token, callId).catch(() => {}); close("تعذّر الاتصال — تحقّق من الإنترنت"); }
    }
    if (m.type === "ended") {
      const r = m.reason;
      close(r === "declined" ? "رُفضت المكالمة" : r === "missed" ? "لم يتم الرد" : r === "failed" ? "انقطع الاتصال" : phase === "active" ? `انتهت المكالمة · ${fmt(secs)}` : "انتهت المكالمة");
    }
    if (m.type === "mic_error") { if (token) callsApi.end(token, callId).catch(() => {}); close("تعذّر تشغيل الميكروفون"); }
  };

  const statusText =
    phase === "loading" ? "جارٍ التحضير…" :
    phase === "incoming" ? "مكالمة صوتية واردة" :
    phase === "ringing" ? "جارٍ الرنين…" :
    phase === "connecting" ? "جارٍ الاتصال…" :
    phase === "active" ? fmt(secs) : endText;

  const config = JSON.stringify({ api: getApiUrl(), token, callId, role, ice: ice || undefined });

  return (
    <LinearGradient colors={["#06382A", "#0B5C45", "#0E7A5A"]} style={[st.root, { paddingTop: insets.top + 30, paddingBottom: insets.bottom + 30 }]}>
      <View style={st.top}>
        <View style={st.badge}><Ionicons name="lock-closed" size={11} color="#ffffffB0" /><Text style={st.badgeTxt}>مكالمة صوتية عبر الإنترنت · حصاحيصاوي</Text></View>
        <View style={[st.avatarRing, (phase === "incoming" || phase === "ringing") && st.avatarPulse]}>
          <UserAvatar name={otherName} avatarUrl={otherAvatar} size={128} borderRadius={64} />
        </View>
        <Text style={st.name} numberOfLines={1}>{otherName}</Text>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
          {phase === "connecting" || phase === "loading" ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={[st.status, phase === "active" && { fontFamily: "Cairo_700Bold", fontSize: 20 }]}>{statusText}</Text>
        </View>
      </View>

      {phase === "incoming" ? (
        <View style={st.row}>
          <View style={st.btnCol}>
            <TouchableOpacity style={[st.big, { backgroundColor: "#E53935" }]} onPress={decline} accessibilityLabel="رفض"><Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} /></TouchableOpacity>
            <Text style={st.btnTxt}>رفض</Text>
          </View>
          <View style={st.btnCol}>
            <TouchableOpacity style={[st.big, { backgroundColor: "#22C55E" }]} onPress={accept} accessibilityLabel="رد"><Ionicons name="call" size={32} color="#fff" /></TouchableOpacity>
            <Text style={st.btnTxt}>رد</Text>
          </View>
        </View>
      ) : phase === "ended" ? (
        <View style={st.row}><Ionicons name="call-outline" size={34} color="#ffffff90" /></View>
      ) : (
        <View style={st.row}>
          <View style={st.btnCol}>
            <TouchableOpacity style={[st.small, muted && { backgroundColor: "#fff" }]} onPress={toggleMute} disabled={phase === "loading"} accessibilityLabel="كتم">
              <Ionicons name={muted ? "mic-off" : "mic"} size={26} color={muted ? "#0B5C45" : "#fff"} />
            </TouchableOpacity>
            <Text style={st.btnTxt}>{muted ? "إلغاء الكتم" : "كتم"}</Text>
          </View>
          <View style={st.btnCol}>
            <TouchableOpacity style={[st.big, { backgroundColor: "#E53935" }]} onPress={hangup} accessibilityLabel="إنهاء"><Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} /></TouchableOpacity>
            <Text style={st.btnTxt}>إنهاء</Text>
          </View>
          <View style={st.btnCol}>
            <TouchableOpacity style={st.small} onPress={() => router.push({ pathname: "/conversation" as any, params: { chatId: String(call?.chat_id || ""), otherName } })} disabled={!call?.chat_id} accessibilityLabel="الدردشة">
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={st.btnTxt}>رسالة</Text>
          </View>
        </View>
      )}

      {webOn && token && ice && Platform.OS !== "web" ? (
        <WebView
          ref={web}
          source={{ uri: callPageUrl() }}
          style={st.hiddenWeb}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          injectedJavaScriptBeforeContentLoaded={`window.__CALL = ${config}; true;`}
          onMessage={onMessage}
          onError={() => { if (token) callsApi.end(token, callId).catch(() => {}); close("تعذّر تحميل المكالمة"); }}
        />
      ) : null}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, justifyContent: "space-between", alignItems: "center" },
  top: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#ffffff18", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 26 },
  badgeTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#ffffffC0" },
  avatarRing: { padding: 6, borderRadius: 80, backgroundColor: "#ffffff15" },
  avatarPulse: { borderWidth: 3, borderColor: "#ffffff55" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", marginTop: 10 },
  status: { fontFamily: "Cairo_400Regular", fontSize: 15, color: "#ffffffD0" },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-evenly", alignSelf: "stretch", paddingHorizontal: 20 },
  btnCol: { alignItems: "center", gap: 8 },
  big: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center", elevation: 6 },
  small: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff22", marginTop: 6 },
  btnTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#ffffffD0" },
  hiddenWeb: { position: "absolute", width: 2, height: 2, opacity: 0.01, bottom: 0, left: 0 },
});
