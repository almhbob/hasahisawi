// Ownership checks shared by the transport, food and occasions routes.
// Each answers "may this signed-in user act on that record?" so a route never
// trusts an id or a phone number sent by the client.
import type { Request } from "express";
import { query, isStaff, sessionUser, type SessionUser } from "./shared-db";

/** Last 9 digits of a phone: 0912345678, +249912345678 and 249 912 345 678 all match. */
export function phoneKey(phone: unknown): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export function samePhone(a: unknown, b: unknown): boolean {
  const ka = phoneKey(a);
  return ka !== null && ka === phoneKey(b);
}

export function isTransportStaff(u: SessionUser | null): boolean {
  return !!u && ["admin", "moderator", "transport_supervisor"].includes(u.role);
}

/**
 * The approved driver record the user may act as, or null.
 * - Staff may act as any approved driver (dispatching on someone's behalf).
 * - Otherwise the driver must be linked to the user, or — for drivers who
 *   registered before signing in — carry the user's phone number; such a
 *   driver is linked to the account on first use so the phone is not needed again.
 * Without `driverId`, returns the user's own approved driver, if any.
 */
export async function ownedDriver(u: SessionUser | null, driverId?: number | null): Promise<Record<string, any> | null> {
  if (!u) return null;
  const key = phoneKey(u.phone);

  if (driverId) {
    const r = await query(`SELECT * FROM transport_drivers WHERE id=$1 AND status='approved' LIMIT 1`, [driverId]);
    const d = r.rows[0];
    if (!d) return null;
    if (isTransportStaff(u) || Number(d.user_id) === Number(u.id)) return d;
    if (d.user_id == null && key && phoneKey(d.phone) === key) return linkDriver(d, u.id);
    return null;
  }

  const own = await query(
    `SELECT * FROM transport_drivers WHERE user_id=$1 AND status='approved' ORDER BY id DESC LIMIT 1`, [u.id]);
  if (own.rows[0]) return own.rows[0];
  if (!key) return null;
  const byPhone = await query(
    `SELECT * FROM transport_drivers
      WHERE user_id IS NULL AND status='approved' AND RIGHT(regexp_replace(phone,'\\D','','g'),9)=$1
      ORDER BY id DESC LIMIT 1`, [key]);
  return byPhone.rows[0] ? linkDriver(byPhone.rows[0], u.id) : null;
}

async function linkDriver(d: Record<string, any>, userId: number) {
  const r = await query(
    `UPDATE transport_drivers SET user_id=$1 WHERE id=$2 AND user_id IS NULL RETURNING *`, [userId, d.id]);
  // Lost a race to another account linking the same driver: not ours.
  return r.rows[0] ?? null;
}

/** The food business the user owns (or any, for staff), or null. */
export async function ownedFoodBusiness(u: SessionUser | null, businessId: unknown): Promise<Record<string, any> | null> {
  const id = Number(businessId);
  if (!u || !Number.isInteger(id) || id <= 0) return null;
  const r = await query(`SELECT * FROM food_businesses WHERE id=$1 LIMIT 1`, [id]);
  const b = r.rows[0];
  if (!b) return null;
  return isStaff(u) || Number(b.owner_user_id) === Number(u.id) ? b : null;
}

/** The occasions shop the user owns (matched by the shop's phone), or any shop for staff. */
export async function ownedOccasionShop(u: SessionUser | null, shopPhone: unknown): Promise<Record<string, any> | null> {
  const key = phoneKey(shopPhone);
  if (!u || !key) return null;
  if (!isStaff(u) && phoneKey(u.phone) !== key) return null;
  const r = await query(
    `SELECT * FROM occasion_shops WHERE RIGHT(regexp_replace(phone,'\\D','','g'),9)=$1 ORDER BY id LIMIT 1`, [key]);
  return r.rows[0] ?? null;
}

/**
 * The merchant space the caller may manage, or null: the merchant's own portal
 * session (Bearer mp_…), its linked user / matching phone, or staff.
 */
export async function ownedMerchant(req: Request, merchantId: unknown): Promise<Record<string, any> | null> {
  const id = Number(merchantId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await query(`SELECT * FROM merchant_spaces WHERE id=$1 LIMIT 1`, [id]);
  const m = r.rows[0];
  if (!m) return null;
  const auth = String(req.headers.authorization || "");
  const tok = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (tok.startsWith("mp_")) return m.status === "approved" && m.portal_token === tok ? m : null;
  const u = await sessionUser(req);
  if (!u) return null;
  if (isStaff(u) || Number(m.user_id) === Number(u.id) || samePhone(m.phone, u.phone)) return m;
  return null;
}
