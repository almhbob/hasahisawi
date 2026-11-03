// شريط مشاركة على مواقع التواصل — للكاتب: نصه، ملفه وبطاقته، شهادة توثيقه.
import React from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { socialShareUrl, systemShare, copyText, notify, type SocialTarget } from "@/lib/xplatform";

const NETS: { k: SocialTarget | "more" | "copy"; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { k: "whatsapp", label: "واتساب", icon: "logo-whatsapp", color: "#128C7E" },
  { k: "facebook", label: "فيسبوك", icon: "logo-facebook", color: "#1877F2" },
  { k: "x", label: "إكس", icon: "logo-twitter", color: "#111827" },
  { k: "telegram", label: "تيليجرام", icon: "paper-plane", color: "#229ED9" },
  { k: "copy", label: "نسخ الرابط", icon: "link", color: "#5A6B7B" },
  { k: "more", label: "المزيد", icon: "share-social", color: "#7A2E3A" },
];

export default function ShareBar({ url, text, title = "شارك على مواقع التواصل" }: { url: string; text: string; title?: string }) {
  const go = async (k: (typeof NETS)[number]["k"]) => {
    if (k === "copy") { if ((await copyText(url)) === "copied") notify("نُسخ الرابط", "الصقه أينما شئت"); return; }
    if (k === "more") { if (!(await systemShare(text, url))) await Linking.openURL(socialShareUrl("whatsapp", url, text)).catch(() => {}); return; }
    await Linking.openURL(socialShareUrl(k, url, text)).catch(() => notify("تعذّر الفتح", "التطبيق غير متاح على جهازك"));
  };
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
      <View style={s.row}>
        {NETS.map((n) => (
          <Pressable key={n.k} onPress={() => go(n.k)} style={s.item} accessibilityRole="button" accessibilityLabel={n.label}>
            <View style={[s.icon, { backgroundColor: n.color }]}><Ionicons name={n.icon} size={18} color="#fff" /></View>
            <Text style={s.label}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", marginBottom: 10 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between" },
  item: { alignItems: "center", gap: 4, width: 52 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
});
