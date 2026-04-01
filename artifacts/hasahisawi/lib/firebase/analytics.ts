import { Platform } from "react-native";
import { app, isFirebaseConfigured } from "./index";

let _analytics: unknown = null;

async function getAnalyticsInstance() {
  if (!isFirebaseConfigured || Platform.OS !== "web") return null;
  if (_analytics) return _analytics;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    const supported = await isSupported();
    if (supported) {
      _analytics = getAnalytics(app);
    }
  } catch {}
  return _analytics;
}

export async function logEvent(name: string, params?: Record<string, unknown>) {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { logEvent: fbLogEvent } = await import("firebase/analytics");
    fbLogEvent(analytics as Parameters<typeof fbLogEvent>[0], name, params);
  } catch {}
}

export async function logScreenView(screenName: string) {
  await logEvent("screen_view", { screen_name: screenName });
}

export async function logLogin(method: string) {
  await logEvent("login", { method });
}

export async function logSignUp(method: string) {
  await logEvent("sign_up", { method });
}

export async function logShare(contentType: string, itemId: string) {
  await logEvent("share", { content_type: contentType, item_id: itemId });
}
