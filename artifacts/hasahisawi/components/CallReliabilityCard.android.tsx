/**
 * «اجعل المكالمات ترن والتطبيق مغلق» — أندرويد:
 * شركات الهواتف (شاومي، أوبو، سامسونج، هواوي…) توقف التطبيقات في الخلفية لتوفير البطارية،
 * فلا ترن المكالمة. هذه البطاقة تكشف القيود وتفتح إعداداتها مباشرة بخطوات واضحة.
 */
import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function notifee(): any { try { return require("@notifee/react-native"); } catch { return null; } }

export default function CallReliabilityCard() {
  const [battery, setBattery] = useState<boolean | null>(null);
  const [pm, setPm] = useState<{ activity?: string | null; manufacturer?: string } | null>(null);
  const [notifOk, setNotifOk] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    const n = notifee(); if (!n) return;
    try { setBattery(await n.default.isBatteryOptimizationEnabled()); } catch { setBattery(null); }
    try { setPm(await n.default.getPowerManagerInfo()); } catch { setPm(null); }
    try { const st = await n.default.getNotificationSettings(); setNotifOk(st.authorizationStatus >= 1); } catch { setNotifOk(null); }
  }, []);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", s => { if (s === "active") check(); });
    return () => sub.remove();
  }, [check]);

  const n = notifee();
  if (!n) return null;
  const steps = [
    { ok: notifOk !== false, icon: "notifications", title: "السماح بالإشعارات", sub: "ليظهر إشعار المكالمة ويرن", go: () => n.default.openNotificationSettings().catch(() => Linking.openSettings()) },
    { ok: battery === false, icon: "battery-charging", title: "إيقاف تحسين البطارية للتطبيق", sub: "اختر «غير مقيّد» أو «لا تحسين»", go: () => n.default.openBatteryOptimizationSettings().catch(() => Linking.openSettings()) },
    ...(pm?.activity ? [{ ok: false, icon: "flash", title: `التشغيل في الخلفية (${pm.manufacturer || "الهاتف"})`, sub: "فعّل «التشغيل التلقائي» و«السماح في الخلفية»", go: () => n.default.openPowerManagerSettings().catch(() => Linking.openSettings()) }] : []),
    { ok: true, icon: "phone-portrait", title: "شاشة المكالمة فوق القفل", sub: "اسمح بـ«الإشعارات بملء الشاشة» إن طُلب منك", go: () => Linking.sendIntent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT").catch(() => Linking.openSettings()) },
  ];
  const pending = steps.filter(s => !s.ok).length;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: pending ? "#FFF7E0" : Colors.primary + "18" }]}>
          <Ionicons name={pending ? "call" : "checkmark-done"} size={22} color={pending ? "#946B00" : Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>المكالمات والتطبيق مغلق</Text>
          <Text style={s.sub}>{pending ? `${pending} إعداد يمنع رنين المكالمات أحياناً — اضبطه مرة واحدة` : "هاتفك جاهز لرنين المكالمات حتى والتطبيق مغلق"}</Text>
        </View>
      </View>
      {steps.map(st => (
        <TouchableOpacity key={st.title} onPress={st.go} style={s.step} activeOpacity={0.8}>
          <Ionicons name={st.ok ? "checkmark-circle" : "alert-circle"} size={20} color={st.ok ? "#00966A" : "#E8A900"} />
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>{st.title}</Text>
            <Text style={s.stepSub}>{st.sub}</Text>
          </View>
          <Ionicons name={st.icon as any} size={16} color={Colors.textMuted} />
          <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 14, marginBottom: 14, gap: 8, ...Colors.shadow.card },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 4 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  step: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  stepSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
});
