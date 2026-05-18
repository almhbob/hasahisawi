import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";

export type AttentionAlertKind = "info" | "success" | "warning" | "critical";

let lastAlertAt = 0;
const MIN_GAP_MS = 8000;

export function shouldPlayAttentionAlert(): boolean {
  const now = Date.now();
  if (now - lastAlertAt < MIN_GAP_MS) return false;
  lastAlertAt = now;
  return true;
}

export async function playAttentionAlert(kind: AttentionAlertKind = "warning") {
  if (!shouldPlayAttentionAlert()) return;
  if (Platform.OS === "web") return;

  try {
    if (kind === "critical") {
      Vibration.vibrate([0, 350, 180, 350]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (kind === "success") {
      Vibration.vibrate(120);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    Vibration.vibrate([0, 220, 120, 220]);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}
}

export function countPendingAdminItems(input: {
  ads?: Array<{ status?: string }>;
  communities?: Array<{ status?: string }>;
  serviceRequests?: Array<{ status?: string }>;
  drivers?: Array<{ status?: string }>;
  trips?: Array<{ status?: string }>;
}) {
  const count = (items?: Array<{ status?: string }>) =>
    (items ?? []).filter((item) => item.status === "pending").length;

  return (
    count(input.ads) +
    count(input.communities) +
    count(input.serviceRequests) +
    count(input.drivers) +
    count(input.trips)
  );
}

export async function alertForNewPendingAdminItems(previous: number, current: number) {
  if (current > previous) await playAttentionAlert("critical");
}
