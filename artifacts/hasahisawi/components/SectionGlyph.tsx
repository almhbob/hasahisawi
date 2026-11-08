// أيقونة قسم من نظام أيقونات حصاحيصاوي (ثنائية اللون: لون الهيكل + ذهبي الشعار)
import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { GLYPH_GOLD, GLYPH_STROKE, SECTION_GLYPHS } from "@/lib/section-glyphs";

export function hasSectionGlyph(id: string) { return !!SECTION_GLYPHS[id]; }

export default function SectionGlyph({ id, size = 24, color = "#004D36", accent = GLYPH_GOLD }: { id: string; size?: number; color?: string; accent?: string }) {
  const g = SECTION_GLYPHS[id];
  if (!g) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {g.parts.map((p, i) => {
        const col = p.accent ? accent : color;
        const paint = p.fill
          ? { fill: col, stroke: "none" as const }
          : { fill: "none" as const, stroke: col, strokeWidth: GLYPH_STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
        return p.c ? <Circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} {...paint} /> : <Path key={i} d={p.d} {...paint} />;
      })}
    </Svg>
  );
}
