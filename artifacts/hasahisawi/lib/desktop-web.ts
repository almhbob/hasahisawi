// تخطيط سطح المكتب على الويب: شريط جانبي ثابت + عمود محتوى بعرض مريح + لوحة جانبية على الشاشات الكبيرة.
// الشاشات صُممت بعرض الهاتف وكثير منها يحسب أبعاده من Dimensions.get("window")،
// لذلك نُبلغها بعرض عمود المحتوى لا بعرض النافذة كاملة (انظر desktop-web-boot.web.ts).
import { Platform } from "react-native";

export const DESKTOP_MIN = 1024;   // من هذا العرض يظهر تخطيط الموقع
export const SIDEBAR_W = 288;
export const ASIDE_MIN = 1400;     // لوحة جانبية إضافية على الشاشات العريضة
export const ASIDE_W = 320;
export const CONTENT_MAX = 880;

export function realWindowWidth(): number {
  if (Platform.OS !== "web" || typeof window === "undefined") return 0;
  return window.innerWidth || document.documentElement.clientWidth || 0;
}

export function isDesktopWidth(w = realWindowWidth()): boolean {
  return Platform.OS === "web" && w >= DESKTOP_MIN;
}

/** عرض عمود المحتوى لعرض نافذة معيّن */
export function contentWidthFor(w: number): number {
  const aside = w >= ASIDE_MIN ? ASIDE_W + 24 : 0;
  return Math.max(360, Math.min(CONTENT_MAX, w - SIDEBAR_W - aside - 48));
}
