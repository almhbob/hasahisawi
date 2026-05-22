import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Vibration,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_TOKEN_KEY = "auth_backend_token";

export default function QRScannerScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const scanLock = useRef(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanned(true);

    // Extract token from QR value.
    // QR encodes full URL: https://api.../api/auth/qr/{TOKEN}/confirm
    // Also support: raw token string or ?token= query param
    let token = data.trim();
    try {
      const url = new URL(data);
      // Try path extraction: /api/auth/qr/{TOKEN}/confirm
      const pathMatch = url.pathname.match(/\/api\/auth\/qr\/([^/]+)\//);
      if (pathMatch?.[1]) {
        token = pathMatch[1];
      } else {
        // Fallback: try query param
        const qp = url.searchParams.get("token");
        if (qp) token = qp;
      }
    } catch {
      // data is not a URL — treat as raw token
    }

    if (!token || token.length < 20 || token.startsWith("http")) {
      Alert.alert("رمز غير صحيح", "هذا ليس رمز QR صالحاً لتسجيل الدخول.", [
        { text: "إعادة المسح", onPress: () => { scanLock.current = false; setScanned(false); } },
      ]);
      return;
    }

    setLoading(true);
    try {
      const authToken = await AsyncStorage.getItem(BACKEND_TOKEN_KEY);
      if (!authToken) {
        Alert.alert(
          "غير مسجل الدخول",
          "يجب أن تكون مسجلاً دخولك على الجوال أولاً.",
          [{ text: "حسناً", onPress: () => { scanLock.current = false; setScanned(false); setLoading(false); } }]
        );
        return;
      }

      // Mark as scanned first so web sees the intermediate state
      await fetchWithTimeout(`${getApiUrl()}/api/auth/qr/${token}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      }).catch(() => {});

      // Then confirm (creates web session)
      const res = await fetchWithTimeout(`${getApiUrl()}/api/auth/qr/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      });
      const body = await res.json();
      if (body.ok) {
        Vibration.vibrate([0, 100, 80, 100]);
        setSuccess(true);
      } else {
        Alert.alert("خطأ", body.error || "فشل تأكيد الرمز — الرمز منتهي أو استُخدم من قبل", [
          { text: "إعادة المسح", onPress: () => { scanLock.current = false; setScanned(false); setLoading(false); } },
        ]);
      }
    } catch {
      Alert.alert("خطأ في الاتصال", "تحقق من الإنترنت وحاول مجدداً.", [
        { text: "إعادة المسح", onPress: () => { scanLock.current = false; setScanned(false); setLoading(false); } },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <Ionicons name="camera-outline" size={64} color={Colors.primary} />
        <Text style={styles.permTitle}>إذن الكاميرا مطلوب</Text>
        <Text style={styles.permSub}>لمسح رمز QR لربط جهاز الكمبيوتر</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>السماح بالكاميرا</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (success) {
    return (
      <View style={[styles.root, styles.center]}>
        <LinearGradient colors={["#020C1B", "#061525"]} style={StyleSheet.absoluteFill} />
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={52} color="#fff" />
        </View>
        <Text style={styles.successTitle}>تم ربط الجهاز بنجاح!</Text>
        <Text style={styles.successSub}>الكمبيوتر الآن مسجل دخوله تلقائياً</Text>
        <TouchableOpacity style={styles.permBtn} onPress={() => router.back()}>
          <Text style={styles.permBtnTxt}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>مسح رمز QR</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Viewfinder */}
        <View style={styles.viewfinderWrap}>
          <View style={styles.viewfinder}>
            {/* Corner marks */}
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((s, i) => (
              <View key={i} style={[styles.corner, s]} />
            ))}
          </View>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        </View>

        {/* Bottom hint */}
        <View style={styles.bottomHint}>
          <Ionicons name="desktop-outline" size={20} color={Colors.primary} />
          <Text style={styles.hintText}>
            وجّه الكاميرا نحو رمز QR الظاهر على شاشة الكمبيوتر
          </Text>
        </View>
      </View>
    </View>
  );
}

const FRAME = 240;
const CORNER = 28;

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: "#000" },
  center:         { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  overlay:        { flex: 1 },
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "rgba(0,0,0,0.55)",
  },
  topTitle:       { color: "#fff", fontSize: 17, fontFamily: "Cairo-SemiBold" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center", alignItems: "center",
  },
  viewfinderWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  viewfinder: {
    width: FRAME, height: FRAME, position: "relative",
    borderRadius: 4,
  },
  corner: {
    position: "absolute", width: CORNER, height: CORNER,
    borderColor: Colors.primary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,12,27,0.72)",
    justifyContent: "center", alignItems: "center", borderRadius: 4,
  },
  bottomHint: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    marginHorizontal: 0,
  },
  hintText: {
    color: "#BAE6FD", fontSize: 13, fontFamily: "Cairo-Regular",
    textAlign: "right", flex: 1,
  },
  permTitle:   { color: Colors.textPrimary, fontSize: 20, fontFamily: "Cairo-Bold", marginTop: 16, textAlign: "center" },
  permSub:     { color: Colors.textSecondary, fontSize: 14, fontFamily: "Cairo-Regular", textAlign: "center", marginTop: 6, marginBottom: 24 },
  permBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14, marginTop: 8,
  },
  permBtnTxt:  { color: "#fff", fontSize: 15, fontFamily: "Cairo-SemiBold" },
  backBtn:     { marginTop: 12 },
  backTxt:     { color: Colors.textMuted, fontSize: 14, fontFamily: "Cairo-Regular" },
  successCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: "#16A34A",
    justifyContent: "center", alignItems: "center", marginBottom: 20,
  },
  successTitle: { color: Colors.textPrimary, fontSize: 22, fontFamily: "Cairo-Bold", textAlign: "center" },
  successSub:   { color: Colors.textSecondary, fontSize: 14, fontFamily: "Cairo-Regular", textAlign: "center", marginTop: 6, marginBottom: 24 },
});
