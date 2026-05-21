import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_TOKEN_KEY = "auth_backend_token";
const USER_KEY = "auth_user_data";
const QR_TTL_MS = 3 * 60 * 1000; // 3 minutes

type Phase = "loading" | "ready" | "scanned" | "confirmed" | "expired" | "error";

export default function QRWebLoginScreen() {
  const insets = useSafeAreaInsets();
  const { login: authLogin } = useAuth();
  const [token, setToken]       = useState<string | null>(null);
  const [phase, setPhase]       = useState<Phase>("loading");
  const [countdown, setCountdown] = useState(QR_TTL_MS / 1000);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current)  clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const generateQR = async () => {
    stopPolling();
    setPhase("loading");
    setCountdown(QR_TTL_MS / 1000);
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/auth/qr/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!body.token) throw new Error("no token");
      setToken(body.token);
      setPhase("ready");
      startPolling(body.token);
      startCountdown();
    } catch {
      setPhase("error");
    }
  };

  const startPolling = (tok: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchWithTimeout(`${getApiUrl()}/api/auth/qr/${tok}/poll`);
        const body = await res.json();
        if (body.status === "scanned") {
          setPhase("scanned");
        } else if (body.status === "confirmed" && body.token) {
          stopPolling();
          setPhase("confirmed");
          // Store the received auth token and load user
          await AsyncStorage.setItem(BACKEND_TOKEN_KEY, body.token);
          const meRes = await fetchWithTimeout(`${getApiUrl()}/api/auth/me`, {
            headers: { Authorization: `Bearer ${body.token}` },
          });
          const meBody = await meRes.json();
          if (meBody.user) {
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(meBody.user));
          }
          setTimeout(() => router.replace("/(tabs)/"), 1200);
        } else if (body.status === "expired") {
          stopPolling();
          setPhase("expired");
        }
      } catch {}
    }, 2000);
  };

  const startCountdown = () => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          stopPolling();
          setPhase("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    generateQR();
    return () => stopPolling();
  }, []);

  const qrValue = token
    ? `${getApiUrl()}/api/auth/qr/${token}/confirm`
    : "";

  const mins = Math.floor(countdown / 60);
  const secs = (countdown % 60).toString().padStart(2, "0");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#020C1B", "#061525", "#020C1B"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تسجيل الدخول عبر QR</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        {/* Instruction */}
        <Text style={styles.title}>افتح التطبيق على جوالك</Text>
        <Text style={styles.subtitle}>
          ثم اذهب إلى الإعدادات ← ربط بالكمبيوتر، ومسح هذا الرمز
        </Text>

        {/* QR box */}
        <View style={styles.qrBox}>
          {phase === "loading" && (
            <ActivityIndicator size="large" color={Colors.primary} />
          )}

          {(phase === "ready" || phase === "scanned") && token && (
            <>
              <QRCode
                value={qrValue}
                size={200}
                backgroundColor="#fff"
                color="#020C1B"
              />
              {phase === "scanned" && (
                <View style={styles.scannedOverlay}>
                  <Ionicons name="phone-portrait-outline" size={36} color="#fff" />
                  <Text style={styles.scannedTxt}>تم المسح…{"\n"}أكمل على جوالك</Text>
                </View>
              )}
            </>
          )}

          {phase === "confirmed" && (
            <View style={styles.confirmedBox}>
              <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
              <Text style={styles.confirmedTxt}>تم تسجيل الدخول!</Text>
            </View>
          )}

          {phase === "expired" && (
            <View style={styles.expiredBox}>
              <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.expiredTxt}>انتهت صلاحية الرمز</Text>
            </View>
          )}

          {phase === "error" && (
            <View style={styles.expiredBox}>
              <Ionicons name="wifi-outline" size={48} color="#EF4444" />
              <Text style={styles.expiredTxt}>خطأ في الاتصال</Text>
            </View>
          )}
        </View>

        {/* Countdown / refresh */}
        {(phase === "ready" || phase === "scanned") && (
          <View style={styles.countdownRow}>
            <Ionicons name="timer-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.countdownTxt}>
              ينتهي بعد {mins}:{secs}
            </Text>
          </View>
        )}

        {(phase === "expired" || phase === "error") && (
          <TouchableOpacity style={styles.refreshBtn} onPress={generateQR}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.refreshTxt}>توليد رمز جديد</Text>
          </TouchableOpacity>
        )}

        {/* Steps */}
        {(phase === "ready" || phase === "scanned") && (
          <View style={styles.steps}>
            {[
              { n: "١", t: "افتح التطبيق على جوالك وأنت مسجل الدخول" },
              { n: "٢", t: "اذهب إلى الإعدادات" },
              { n: "٣", t: 'اضغط "ربط بالكمبيوتر" ومسح هذا الرمز' },
              { n: "٤", t: "يُسجَّل دخولك هنا تلقائياً" },
            ].map((s) => (
              <View key={s.n} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumTxt}>{s.n}</Text>
                </View>
                <Text style={styles.stepTxt}>{s.t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(37,99,235,0.15)",
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: "Cairo-SemiBold" },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(37,99,235,0.12)",
    justifyContent: "center", alignItems: "center",
  },
  body: { flex: 1, alignItems: "center", paddingTop: 32, paddingHorizontal: 24 },
  title:    { color: Colors.textPrimary, fontSize: 20, fontFamily: "Cairo-Bold", textAlign: "center" },
  subtitle: { color: Colors.textSecondary, fontSize: 13, fontFamily: "Cairo-Regular", textAlign: "center", marginTop: 6, marginBottom: 28 },
  qrBox: {
    width: 240, height: 240, backgroundColor: "#fff", borderRadius: 20,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
    borderWidth: 3, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,12,27,0.88)",
    justifyContent: "center", alignItems: "center", gap: 10,
  },
  scannedTxt: { color: "#fff", fontSize: 14, fontFamily: "Cairo-SemiBold", textAlign: "center" },
  confirmedBox: { justifyContent: "center", alignItems: "center", gap: 10 },
  confirmedTxt: { color: "#22C55E", fontSize: 16, fontFamily: "Cairo-Bold" },
  expiredBox:   { justifyContent: "center", alignItems: "center", gap: 10 },
  expiredTxt:   { color: Colors.textMuted, fontSize: 14, fontFamily: "Cairo-Regular" },
  countdownRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 14,
  },
  countdownTxt: { color: Colors.textMuted, fontSize: 13, fontFamily: "Cairo-Regular" },
  refreshBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 20,
    backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12,
  },
  refreshTxt: { color: "#fff", fontSize: 14, fontFamily: "Cairo-SemiBold" },
  steps: { width: "100%", marginTop: 28, gap: 14 },
  step: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.18)", borderWidth: 1, borderColor: Colors.primary,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  stepNumTxt: { color: Colors.primary, fontSize: 13, fontFamily: "Cairo-Bold" },
  stepTxt:    { color: Colors.textSecondary, fontSize: 13, fontFamily: "Cairo-Regular", flex: 1, textAlign: "right", paddingTop: 4 },
});
