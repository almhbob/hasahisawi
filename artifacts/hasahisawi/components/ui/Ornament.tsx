import React from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Svg, { Defs, Pattern, Path, Rect, G } from "react-native-svg";

/**
 * زخارف حصاحيصاوي: نجمة ثمانية (خاتم) بخطوط رفيعة — من الزخرفة السودانية والإسلامية،
 * بدل أشكال «الشبكات التقنية» العامة.
 */

const GOLD = "#E8B931";

/** مسار نجمة ثمانية مركزها (cx,cy): مربعان متداخلان أحدهما مدوَّر 45° */
function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** نسيج متكرر من النجوم الثمانية — لتغطية صورة أو بطاقة بشفافية خفيفة. */
export function StarPattern({ color = GOLD, opacity = 0.14, size = 44, style }: {
  color?: string; opacity?: number; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const h = size / 2;
  return (
    <View pointerEvents="none" style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="khatam" width={size} height={size} patternUnits="userSpaceOnUse">
            <G stroke={color} strokeWidth={0.8} fill="none" opacity={opacity}>
              <Path d={starPath(h, h, h * 0.78)} />
              {/* خطوط تصل النجوم ببعضها */}
              <Path d={`M0,${h} L${h * 0.3},${h} M${size - h * 0.3},${h} L${size},${h} M${h},0 L${h},${h * 0.3} M${h},${size - h * 0.3} L${h},${size}`} />
            </G>
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#khatam)" />
      </Svg>
    </View>
  );
}

/** علامة صغيرة بجانب عناوين الأقسام: نجمة ذهبية وخط رفيع. */
export function SectionMark({ color = GOLD }: { color?: string }) {
  return (
    <Svg width={30} height={12} viewBox="0 0 30 12" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={starPath(24, 6, 5.5)} fill={color} />
      <Path d="M0 6 H16" stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

/** فاصل زخرفي: خط — نجمة — خط. */
export function OrnamentDivider({ color = GOLD, width = 120 }: { color?: string; width?: number }) {
  const c = width / 2;
  return (
    <Svg width={width} height={12} viewBox={`0 0 ${width} 12`}>
      <Path d={`M4 6 H${c - 10} M${c + 10} 6 H${width - 4}`} stroke={color} strokeWidth={1} opacity={0.6} strokeLinecap="round" />
      <Path d={starPath(c, 6, 5.5)} fill={color} />
    </Svg>
  );
}
