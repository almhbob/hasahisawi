// جسر صغير للوحدة الأصلية HasahisawiCallScreen (Android فقط — انظر CallScreenModule.kt)
// كل الدوال آمنة: لا تفعل شيئاً على الويب أو في نسخة لا تحتوي الوحدة.
import { NativeModules, Platform } from "react-native";

type CallScreenNative = {
  setCallWindow(overLockScreen: boolean, keepScreenOn: boolean): void;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<boolean>;
};

const mod: CallScreenNative | null =
  Platform.OS === "android" ? ((NativeModules as any).HasahisawiCallScreen ?? null) : null;

export const hasCallScreenNative = () => !!mod;

/** إظهار شاشة المكالمة فوق قفل الشاشة وإبقاء الشاشة مضاءة أثناء الرنين */
export function setCallWindow(overLockScreen: boolean, keepScreenOn = false): void {
  try { mod?.setCallWindow(overLockScreen, keepScreenOn); } catch {}
}

/** Android 14+: هل يسمح النظام للتطبيق بعرض المكالمة الواردة بملء الشاشة؟ */
export async function canUseFullScreenIntent(): Promise<boolean> {
  try { return mod ? await mod.canUseFullScreenIntent() : true; } catch { return true; }
}

export async function openFullScreenIntentSettings(): Promise<boolean> {
  try { return mod ? await mod.openFullScreenIntentSettings() : false; } catch { return false; }
}
