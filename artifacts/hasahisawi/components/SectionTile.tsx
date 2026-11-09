// بلاطة القسم العصرية: مربع بزوايا ناعمة بتدرج لوني، لمعة علوية، ظل ملوّن، وأيقونة بيضاء عريضة بتفصيلة ذهبية.
import React from "react";
import { View, Platform, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import SectionGlyph from "@/components/SectionGlyph";
import { toneFor } from "@/lib/section-tones";

export default function SectionTile({ id, size = 44, glyphScale = 0.58 }: { id: string; size?: number; glyphScale?: number }) {
  const t = toneFor(id);
  const r = Math.round(size * 0.32);
  const shadow = Platform.select({
    web: { boxShadow: `0 ${Math.round(size * 0.12)}px ${Math.round(size * 0.3)}px ${t.shadow}55` } as any,
    default: { shadowColor: t.shadow, shadowOpacity: 0.35, shadowRadius: size * 0.18, shadowOffset: { width: 0, height: size * 0.1 }, elevation: 4 },
  });
  return (
    <View style={[{ width: size, height: size, borderRadius: r }, shadow]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={[t.from, t.to]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: "hidden" }]}>
        {/* لمعة علوية ناعمة */}
        <View style={{ position: "absolute", top: -size * 0.35, left: -size * 0.15, width: size * 1.1, height: size * 0.75, borderRadius: size, backgroundColor: "rgba(255,255,255,0.16)" }} />
        {/* حلقة خفيفة في الزاوية */}
        <View style={{ position: "absolute", bottom: -size * 0.28, right: -size * 0.28, width: size * 0.7, height: size * 0.7, borderRadius: size, borderWidth: size * 0.06, borderColor: "rgba(255,255,255,0.12)" }} />
      </LinearGradient>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <SectionGlyph id={id} size={Math.round(size * glyphScale)} color={t.glyph} accent={t.accent} strokeWidth={2.1} />
      </View>
    </View>
  );
}
