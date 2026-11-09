import { loadFont } from "@remotion/google-fonts/Cairo";
import { loadFont as loadAmiri } from "@remotion/google-fonts/Amiri";

export const { fontFamily: cairo } = loadFont("normal", {
  weights: ["400", "700", "900"],
  subsets: ["arabic", "latin"],
});
export const { fontFamily: amiri } = loadAmiri("normal", {
  weights: ["400", "700"],
  subsets: ["arabic"],
});

// ألوان هوية حصاحيصاوي (من constants/colors.ts في التطبيق)
export const C = {
  green: "#00966A",
  greenLight: "#4EC99D",
  gold: "#E8A900",
  goldLight: "#F7D76A",
  bg: "#04140E",
  ink: "#F4F1E8",
};

export const FPS = 30;
export const HOOK_FRAMES = 45;
export const PROMO_FRAMES = 165;
export const TRANSITION_FRAMES = 15;

// مدة مشهد الحكمة حسب عدد الكلمات: ظهور تدريجي ثم وقت كافٍ للقراءة
export const quoteFrames = (quote: string) => {
  const words = quote.trim().split(/\s+/).length;
  return Math.round(20 + words * 6 + 30 + words * 9);
};
