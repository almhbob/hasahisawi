// وضع المظهر: فاتح / داكن / تلقائي (حسب الهاتف).
//
// الألوان في التطبيق تُقرأ داخل StyleSheet.create عند تحميل كل شاشة، لذلك يجب
// أن يُعرف الوضع *قبل* تحميل أي شاشة، وبشكل متزامن. نقرأه من SecureStore
// (متزامن على الهاتف) أو localStorage (على الويب). تغيير الوضع يُطبَّق عند
// إعادة فتح التطبيق، وعلى الويب بإعادة تحميل الصفحة مباشرة.
import { Appearance, Platform } from "react-native";

export type ThemeMode = "light" | "dark" | "system";
export type Scheme = "light" | "dark";

const KEY = "app_theme_mode";

function isMode(v: unknown): v is ThemeMode {
  return v === "light" || v === "dark" || v === "system";
}

function readSync(): ThemeMode {
  try {
    if (Platform.OS === "web") {
      const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
      return isMode(v) ? v : "system";
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require("expo-secure-store");
    const v = SecureStore.getItem?.(KEY);
    return isMode(v) ? v : "system";
  } catch {
    return "system";
  }
}

function systemScheme(): Scheme {
  try {
    return Appearance.getColorScheme() === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** الوضع الذي اختاره المستخدم عند فتح التطبيق. */
export const initialThemeMode: ThemeMode = readSync();

/** المظهر الفعلي المطبَّق في هذه الجلسة. */
export const activeScheme: Scheme = initialThemeMode === "system" ? systemScheme() : initialThemeMode;

export const isDarkTheme = activeScheme === "dark";

/** يحفظ الاختيار. يُرجع true إذا كان يحتاج إعادة فتح التطبيق ليُطبَّق. */
export async function saveThemeMode(mode: ThemeMode): Promise<boolean> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(KEY, mode); } catch {}
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SecureStore = require("expo-secure-store");
    await SecureStore.setItemAsync(KEY, mode);
  }
  const next: Scheme = mode === "system" ? systemScheme() : mode;
  return next !== activeScheme;
}
