/** عرض سياسة الخدمة: «## » عنوان قسم، «- » بند، وغير ذلك فقرة */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { NeuRaised } from "@/components/auth/neu";

const ICONS: [RegExp, string][] = [
  [/نفاد|تغيّر|تغير/, "swap-horizontal-outline"], [/نطاق|الخدمة/, "storefront-outline"], [/سعر|دفع|أسعار/, "cash-outline"],
  [/إلغاء|استرد|استرجاع/, "return-down-back-outline"], [/شحن|تسليم/, "airplane-outline"], [/ممنوع/, "ban-outline"], [/خصوص/, "lock-closed-outline"],
];
const iconFor = (t: string) => ICONS.find(([r]) => r.test(t))?.[1] ?? "document-text-outline";

type Sec = { title: string; items: { bullet: boolean; text: string }[] };
export function parsePolicy(text: string): Sec[] {
  const out: Sec[] = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) { out.push({ title: line.replace(/^#+\s*/, ""), items: [] }); continue; }
    if (!out.length) out.push({ title: "", items: [] });
    const bullet = /^[-•*]\s*/.test(line);
    out[out.length - 1].items.push({ bullet, text: line.replace(/^[-•*]\s*/, "") });
  }
  return out;
}

export default function PolicyView({ text }: { text: string }) {
  return (
    <View style={{ gap: 12 }}>
      {parsePolicy(text).map((sec, i) => (
        <NeuRaised key={i} radius={18} depth={5} style={st.card}>
          {sec.title ? (
            <View style={st.head}>
              <View style={st.icon}><Ionicons name={iconFor(sec.title) as any} size={17} color={Colors.primary} /></View>
              <Text style={st.title} accessibilityRole="header">{sec.title}</Text>
            </View>
          ) : null}
          {sec.items.map((it, j) => (
            <View key={j} style={st.item}>
              {it.bullet ? <View style={st.dot} /> : null}
              <Text style={st.text}>{it.text}</Text>
            </View>
          ))}
        </NeuRaised>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  card: { padding: 14, gap: 8 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 2 },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primary + "14", alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  item: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E8A900", marginTop: 10 },
  text: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, lineHeight: 23, color: Colors.textSecondary, textAlign: "right" },
});
