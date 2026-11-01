import React from "react";
import Svg, { Circle, Defs, Mask, Rect } from "react-native-svg";

/**
 * شارة الهلال الأحمر: هلال أحمر على خلفية بيضاء.
 * تُستخدم داخل مساحة جمعية الهلال الأحمر السوداني فقط وبتفويض منها
 * (الشارة محمية بموجب اتفاقيات جنيف).
 * مرسومة متجهياً لتبقى حادة بكل الأحجام: دائرة حمراء تُقتطع منها دائرة مزاحة.
 */
export default function RedCrescentMark({ size = 24, color = "#D7141A", background = "#FFFFFF", rounded = true }: {
  size?: number; color?: string; background?: string | null; rounded?: boolean;
}) {
  const id = React.useId?.().replace(/:/g, "") ?? "rc";
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="شارة الهلال الأحمر">
      <Defs>
        <Mask id={`crescent-${id}`}>
          <Rect x="0" y="0" width="100" height="100" fill="#000" />
          <Circle cx="50" cy="50" r="34" fill="#fff" />
          <Circle cx="63" cy="50" r="28" fill="#000" />
        </Mask>
      </Defs>
      {background ? <Rect x="0" y="0" width="100" height="100" rx={rounded ? 24 : 0} fill={background} /> : null}
      <Rect x="0" y="0" width="100" height="100" fill={color} mask={`url(#crescent-${id})`} />
    </Svg>
  );
}
