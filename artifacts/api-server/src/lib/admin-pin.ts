import crypto from "node:crypto";

/**
 * Admin PIN policy.
 *
 * The admin PIN grants full admin rights (header `x-admin-pin`, admin-login
 * fallback, register-admin code). The historical default "4444" is published
 * in the public repository and hardcoded in the mobile app, so a weak PIN must
 * never authorize anything. When the stored PIN is weak, PIN-based access is
 * DISABLED and admins must use a real admin session (Google / password login).
 * An admin can re-enable PIN access by setting a strong PIN via
 * POST /api/admin/change-pin while signed in.
 */
export const MIN_ADMIN_PIN_LENGTH = 8;
const MAX_ADMIN_PIN_LENGTH = 64;
const KNOWN_WEAK_PINS = new Set([
  "4444", "0000", "1111", "1234", "12345", "123456", "1234567",
  "12345678", "123456789", "87654321", "admin", "password", "hasahisawi",
]);

export function isUsableAdminPin(pin: unknown): pin is string {
  if (typeof pin !== "string") return false;
  if (pin.length < MIN_ADMIN_PIN_LENGTH || pin.length > MAX_ADMIN_PIN_LENGTH) return false;
  if (KNOWN_WEAK_PINS.has(pin.toLowerCase())) return false;
  if (/^(.)\1+$/.test(pin)) return false; // 11111111, aaaaaaaa
  return true;
}

/**
 * The PIN that may authorize admin actions, or null when PIN access is disabled.
 * `stored` is the value from admin_settings (if the caller has one); the
 * DEFAULT_ADMIN_PIN env var is only a fallback when nothing is stored.
 */
export function effectiveAdminPin(stored?: unknown): string | null {
  const candidate =
    typeof stored === "string" && stored.length > 0 ? stored : process.env.DEFAULT_ADMIN_PIN;
  return isUsableAdminPin(candidate) ? candidate : null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** True only when `submitted` matches a strong effective PIN. */
export function pinMatches(submitted: unknown, stored?: unknown): boolean {
  const pin = effectiveAdminPin(stored);
  if (!pin || typeof submitted !== "string") return false;
  if (submitted.length > MAX_ADMIN_PIN_LENGTH) return false;
  return timingSafeEqualStr(submitted, pin);
}

export const WEAK_PIN_MESSAGE =
  "رمز المسؤول يجب أن يكون 8 خانات على الأقل، وألا يكون رمزاً شائعاً أو حرفاً مكرراً";
