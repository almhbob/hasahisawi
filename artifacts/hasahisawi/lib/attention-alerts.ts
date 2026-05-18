export type AttentionAlertKind = "info" | "success" | "warning" | "critical";

let lastAlertAt = 0;
const MIN_GAP_MS = 8000;

export function shouldPlayAttentionAlert(): boolean {
  const now = Date.now();
  if (now - lastAlertAt < MIN_GAP_MS) return false;
  lastAlertAt = now;
  return true;
}
