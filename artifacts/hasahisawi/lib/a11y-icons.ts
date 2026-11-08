/**
 * الأيقونات زخرفية: نخفيها عن قارئ الشاشة (TalkBack / VoiceOver / قارئات المتصفح) في كل التطبيق،
 * فلا يتوقف عندها ولا ينطق رمزها، ويُقرأ النص أو تسمية الزر فقط.
 * يُستورد مرة واحدة في app/_layout.tsx قبل رسم أي شاشة.
 */
import * as VectorIcons from "@expo/vector-icons";

const HIDDEN = {
  accessible: false,
  importantForAccessibility: "no-hide-descendants",
  accessibilityElementsHidden: true,
  "aria-hidden": true,
} as const;

/** هل الحرف من نطاق الاستخدام الخاص (حروف خطوط الأيقونات)؟ */
export const ICON_GLYPHS = /[-]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/g;

let done = false;
export function hideIconsFromScreenReaders() {
  if (done) return;
  done = true;
  for (const Icon of Object.values(VectorIcons) as any[]) {
    // عائلات الأيقونات وحدها تحمل glyphMap (Ionicons، MaterialCommunityIcons، Feather…)
    if (typeof Icon === "function" && Icon.glyphMap) {
      try { Icon.defaultProps = { ...(Icon.defaultProps || {}), ...HIDDEN }; } catch { /* */ }
    }
  }
}
hideIconsFromScreenReaders();
