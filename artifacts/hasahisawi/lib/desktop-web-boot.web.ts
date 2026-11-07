// يُحمَّل قبل expo-router: على سطح المكتب تُعطى الشاشات عرض عمود المحتوى بدل عرض النافذة،
// فتبقى تخطيطاتها (المصممة للهاتف) سليمة داخل العمود ولا تتمدد على عرض الشاشة كاملة.
import { Dimensions } from "react-native";
import { contentWidthFor, DESKTOP_MIN, realWindowWidth } from "./desktop-web";

const originalGet = Dimensions.get.bind(Dimensions);
(Dimensions as any).get = (dim: "window" | "screen") => {
  const d = originalGet(dim);
  if (dim !== "window") return d;
  const w = realWindowWidth();
  if (w < DESKTOP_MIN) return d;
  return { ...d, width: contentWidthFor(w) };
};
