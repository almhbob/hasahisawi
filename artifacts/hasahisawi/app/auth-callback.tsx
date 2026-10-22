import React, { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth-context";

// يستقبل العودة من صفحة الدخول بحساب Google (hasahisawi://auth-callback?token=…)
// إذا لم تلتقطها نافذة المتصفح مباشرة.
export default function AuthCallback() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { loginWithToken, user, isGuest } = useAuth();
  const [err, setErr] = useState("");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const tk = typeof token === "string" ? token : "";
    if (!tk) {
      router.replace(user && !isGuest ? "/" : "/login");
      return;
    }
    loginWithToken(tk)
      .then(() => router.replace("/"))
      .catch((e: any) => {
        setErr(e?.message || "تعذّر إكمال الدخول");
        setTimeout(() => router.replace("/login"), 1800);
      });
  }, [token]);

  return (
    <View style={s.root}>
      {err ? <Text style={s.err}>{err}</Text> : (<>
        <ActivityIndicator size="large" color="#1F5C8A" />
        <Text style={s.txt}>جارٍ إكمال تسجيل الدخول…</Text>
      </>)}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F1E9", gap: 14, padding: 24 },
  txt: { color: "#173F5F", fontFamily: "Cairo_600SemiBold", fontSize: 15 },
  err: { color: "#C0392B", fontFamily: "Cairo_600SemiBold", fontSize: 15, textAlign: "center" },
});
