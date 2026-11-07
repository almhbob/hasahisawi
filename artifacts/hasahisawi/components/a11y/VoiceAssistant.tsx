/**
 * المساعد الصوتي (وضع المكفوفين): زر عائم كبير يظهر في كل الشاشات عند تفعيل الوضع.
 *  • لمسة: «أنت في …» ثم قراءة محتوى الشاشة (في المتصفح يُقرأ النص الفعلي للصفحة).
 *  • ضغط مطوّل: قائمة أوامر بأزرار كبيرة: اقرأ الشاشة، الرئيسية الميسّرة، رجوع، الطوارئ، سرعة النطق.
 *  • إعلان تلقائي لاسم كل شاشة جديدة.
 */
import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useA11y } from "@/lib/a11y";
import { GROUPS } from "@/components/DrawerMenu";

const EXTRA_TITLES: Record<string, string> = {
  "/": "الرئيسية", "/prayer": "المساحة الدينية ومواقيت الأذان", "/chat": "الدردشة", "/appointments": "المواعيد",
  "/settings": "الإعدادات", "/login": "تسجيل الدخول", "/fuel-stations": "محطات الوقود", "/shein": "طلبات شي إن", "/accessible-home": "الرئيسية الميسّرة",
  "/conversation": "محادثة", "/restaurant": "صفحة مطعم", "/forgot-password": "استعادة كلمة المرور", "/doc-scanner": "ماسح المستندات",
};

export function screenTitle(pathname: string): string {
  const p = (pathname || "/").replace(/\/$/, "") || "/";
  if (EXTRA_TITLES[p]) return EXTRA_TITLES[p];
  for (const g of GROUPS) for (const it of g.items) {
    const r = it.route.replace("/(tabs)", "").replace(/\/$/, "") || "/";
    if (r === p) return it.title;
  }
  return "صفحة في تطبيق حصاحيصاوي";
}

/** نص الصفحة الظاهر (الويب فقط) — مختصر ومنظّف */
function webPageText(): string {
  if (Platform.OS !== "web" || typeof document === "undefined") return "";
  const root = document.getElementById("root");
  const t = (root?.innerText || "").replace(/[‏‎]/g, "").split("\n").map(x => x.trim()).filter(x => x.length > 1);
  const uniq: string[] = [];
  for (const x of t) if (!uniq.includes(x)) uniq.push(x);
  return uniq.join("، ").slice(0, 1800);
}

export default function VoiceAssistant() {
  const a = useA11y();
  const pathname = usePathname() || "/";
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const last = useRef("");

  // إعلان الشاشة الجديدة
  useEffect(() => {
    if (!a.enabled || !a.announceScreens || last.current === pathname) return;
    last.current = pathname;
    const t = setTimeout(() => a.speak(`${screenTitle(pathname)}. للمساعدة اضغط زر المساعد الصوتي أسفل الشاشة.`), 600);
    return () => clearTimeout(t);
  }, [pathname, a.enabled]);

  if (!a.enabled || /^\/(call)/.test(pathname)) return null;

  const tap = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (a.speaking) { a.stop(); return; }
    const body = webPageText();
    a.speak(`أنت في ${screenTitle(pathname)}. ${body || "مرّر إصبعك على الشاشة مع تفعيل قارئ الشاشة لسماع كل عنصر، أو اضغط مطولاً على هذا الزر لقائمة الأوامر."}`);
  };

  const cmd = (fn: () => void, say?: string) => () => { setMenu(false); if (say) a.speak(say); fn(); };

  return (
    <>
      <Pressable
        onPress={tap}
        onLongPress={() => { setMenu(true); a.speak("قائمة الأوامر الصوتية"); }}
        style={[s.fab, { bottom: insets.bottom + 92 }]}
        accessibilityRole="button"
        accessibilityLabel="المساعد الصوتي"
        accessibilityHint="لمسة لقراءة الشاشة، ضغط مطوّل لقائمة الأوامر"
      >
        <Ionicons name={a.speaking ? "stop" : "volume-high"} size={30} color="#fff" />
      </Pressable>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
            <Text style={s.title} accessibilityRole="header">أوامر المساعد الصوتي</Text>
            <Big icon="reader" label="اقرأ هذه الشاشة" onPress={cmd(tap)} />
            <Big icon="grid" label="الرئيسية الميسّرة" onPress={cmd(() => router.push("/accessible-home" as any))} />
            <Big icon="arrow-forward" label="رجوع للشاشة السابقة" onPress={cmd(() => router.canGoBack() ? router.back() : router.replace("/accessible-home" as any))} />
            <Big icon="call" label="أرقام الطوارئ" color="#D93636" onPress={cmd(() => router.push("/(tabs)/numbers" as any))} />
            <View style={s.row}>
              <Big flex icon="remove" label="أبطأ" onPress={() => { const r = Math.max(0.5, +(a.rate - 0.15).toFixed(2)); a.update({ rate: r }); a.speak("أبطأ"); }} />
              <Big flex icon="add" label="أسرع" onPress={() => { const r = Math.min(1.5, +(a.rate + 0.15).toFixed(2)); a.update({ rate: r }); a.speak("أسرع"); }} />
            </View>
            <Big icon="close" label="إغلاق" color="#4A5E55" onPress={() => { setMenu(false); a.speak("أُغلقت القائمة"); }} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function Big({ icon, label, onPress, color = "#006B4A", flex }: { icon: any; label: string; onPress: () => void; color?: string; flex?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.big, { backgroundColor: color }, flex && { flex: 1 }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={26} color="#fff" />
      <Text style={s.bigText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fab: {
    position: "absolute", left: 16, width: 66, height: 66, borderRadius: 33, zIndex: 9999,
    backgroundColor: "#006B4A", alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#F7D76A",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 12,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1A2C25", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 10, width: "100%", maxWidth: 620, alignSelf: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#F7D76A", textAlign: "center", marginBottom: 6 },
  row: { flexDirection: "row-reverse", gap: 10 },
  big: { flexDirection: "row-reverse", alignItems: "center", gap: 14, minHeight: 64, borderRadius: 18, paddingHorizontal: 18 },
  bigText: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" },
});
