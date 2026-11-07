/**
 * الرئيسية الميسّرة للمكفوفين وضعاف البصر: أزرار كبيرة بتباين عالٍ.
 * لمسة أولى تنطق اسم الخدمة ووصفها، ولمسة ثانية خلال ثانيتين تفتحها (نمط قارئات الشاشة).
 * مع قارئ الشاشة (TalkBack/VoiceOver) تعمل اللمسة المزدوجة المعتادة مباشرة.
 */
import React, { useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useA11y } from "@/lib/a11y";

const ITEMS: { title: string; hint: string; icon: any; route: string; color: string }[] = [
  { title: "مواقيت الأذان", hint: "الصلاة القادمة ووقتها والأذكار", icon: "moon", route: "/(tabs)/prayer", color: "#1D4ED8" },
  { title: "الدردشة", hint: "رسائلك ومحادثاتك", icon: "chatbubbles", route: "/(tabs)/chat", color: "#047857" },
  { title: "أرقام الطوارئ والمهمة", hint: "الشرطة والإسعاف والمطافي", icon: "call", route: "/(tabs)/numbers", color: "#B91C1C" },
  { title: "الدليل الطبي", hint: "صيدليات ومستشفيات وعيادات", icon: "medkit", route: "/(tabs)/medical", color: "#0F766E" },
  { title: "مشاويرك علينا", hint: "اطلب سائقاً يوصلك", icon: "car", route: "/(tabs)/transport", color: "#B45309" },
  { title: "المواعيد", hint: "حجز موعد وتنبيهات", icon: "calendar", route: "/(tabs)/appointments", color: "#6D28D9" },
  { title: "محطات الوقود", hint: "أين يتوفر الوقود الآن", icon: "speedometer", route: "/fuel-stations", color: "#C2410C" },
  { title: "المطاعم", hint: "اطلب وجبتك", icon: "restaurant", route: "/(tabs)/restaurants", color: "#BE185D" },
  { title: "ملفي الشخصي", hint: "بياناتك وحسابك", icon: "person-circle", route: "/profile", color: "#334155" },
  { title: "الإعدادات", hint: "إعدادات الصوت وحجم الخط والتباين", icon: "settings", route: "/(tabs)/settings", color: "#475569" },
];

export default function AccessibleHome() {
  const insets = useSafeAreaInsets();
  const a = useA11y();
  const armed = useRef<{ i: number; t: number } | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  const press = (i: number) => {
    const it = ITEMS[i];
    const now = Date.now();
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    // مع قارئ الشاشة: اللمسة المزدوجة تصل كضغطة واحدة فنفتح مباشرة
    if (a.screenReaderOn || (armed.current && armed.current.i === i && now - armed.current.t < 2200)) {
      armed.current = null;
      a.speak(`فتح ${it.title}`);
      router.push(it.route as any);
      return;
    }
    armed.current = { i, t: now };
    setFocus(i);
    a.speak(`${it.title}. ${it.hint}. اضغط مرة أخرى للفتح.`);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/" as any))} style={s.back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="arrow-forward" size={28} color="#FACC15" />
        </Pressable>
        <Text style={s.title} accessibilityRole="header">الرئيسية الميسّرة</Text>
      </View>
      <Text style={s.help}>لمسة لسماع اسم الخدمة، ولمسة ثانية لفتحها.</Text>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 140 }}>
        {ITEMS.map((it, i) => (
          <Pressable
            key={it.route}
            onPress={() => press(i)}
            style={[s.item, { borderColor: focus === i ? "#FACC15" : "transparent" }]}
            accessibilityRole="button"
            accessibilityLabel={it.title}
            accessibilityHint={it.hint}
          >
            <View style={[s.icon, { backgroundColor: it.color }]}><Ionicons name={it.icon} size={34} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemHint}>{it.hint}</Text>
            </View>
          </Pressable>
        ))}

        <View style={s.settings}>
          <Text style={s.setTitle} accessibilityRole="header">إعدادات الوضع</Text>
          <Row label="المساعد الصوتي" value={a.enabled} onChange={v => { a.update({ enabled: v }); a.speak(v ? "فُعّل المساعد الصوتي" : "أُوقف المساعد الصوتي"); }} />
          <Row label="تكبير الخط" value={a.largeText} onChange={v => a.update({ largeText: v })} />
          <Row label="إعلان اسم كل شاشة" value={a.announceScreens} onChange={v => a.update({ announceScreens: v })} />
          {Platform.OS === "web" && <Row label="تباين عالٍ" value={a.highContrast} onChange={v => a.update({ highContrast: v })} />}
          {Platform.OS === "android" && (
            <Pressable onPress={() => Linking.sendIntent("android.settings.ACCESSIBILITY_SETTINGS").catch(() => Linking.openSettings())} style={s.sysBtn} accessibilityRole="button">
              <Ionicons name="accessibility" size={24} color="#0F172A" />
              <Text style={s.sysText}>فتح إعدادات TalkBack في الهاتف</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <Text style={s.rowText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: "#FACC15", false: "#475569" }} thumbColor="#fff" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020617" },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  back: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 28, color: "#FFFFFF", textAlign: "right" },
  help: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: "#FACC15", textAlign: "right", paddingHorizontal: 16, marginTop: 6 },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: 16, backgroundColor: "#0F172A", borderRadius: 22, padding: 14, minHeight: 92, borderWidth: 3 },
  icon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontFamily: "Cairo_700Bold", fontSize: 23, color: "#FFFFFF", textAlign: "right" },
  itemHint: { fontFamily: "Cairo_500Medium", fontSize: 16, color: "#CBD5E1", textAlign: "right" },
  settings: { backgroundColor: "#0F172A", borderRadius: 22, padding: 16, gap: 8, marginTop: 8 },
  setTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#FACC15", textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
  rowText: { fontFamily: "Cairo_600SemiBold", fontSize: 18, color: "#FFFFFF" },
  sysBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#FACC15", borderRadius: 16, padding: 14, marginTop: 6 },
  sysText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#0F172A" },
});
