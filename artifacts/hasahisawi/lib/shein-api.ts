/**
 * طلبات شي إن — طبقة الاتصال بالخادم + حساب التكلفة للمعاينة (نفس معادلة الخادم).
 * الخادم يعيد الحساب دائماً؛ الأرقام هنا للعرض فقط.
 */
import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/query-client";

export type SheinStatus =
  | "pending_payment_verification" | "paid_and_processing" | "purchased_saudi"
  | "shipped_to_sudan" | "received_hasahisa" | "delivered" | "cancelled";
export type ServiceState = "active" | "coming_soon" | "maintenance";
export type SheinRole = "verifier" | "saudi" | "hasahisa";

export type SheinSettings = {
  status: ServiceState; note: string; sar_to_sdg: number; proxy_fee_pct: number; proxy_fee_fixed_sar: number;
  local_shipping_sar: number; intl_shipping_sar_per_item: number; local_delivery_sdg: number; bank_info: string;
};
export type Financials = ReturnType<typeof computeFinancials>;
export type SheinOrder = {
  id: number; user_id: number; product_url: string; status: SheinStatus;
  item_details: { title?: string; size?: string; color?: string; qty: number; notes?: string; unit_price_sar: number; image_url?: string | null };
  financials: Financials;
  delivery: { name?: string; phone?: string; address?: string; lat?: number | null; lng?: number | null };
  payment_receipt_url?: string | null; tracking_number?: string | null; shein_order_no?: string | null; cancel_reason?: string | null;
  saudi_agent_id?: number | null; hasahisa_agent_id?: number | null; package_id?: number | null;
  customer_name?: string; customer_phone?: string; saudi_agent_name?: string | null; hasahisa_agent_name?: string | null; waybill?: string | null; carrier?: string | null;
  created_at: string; updated_at: string;
};
export type SheinEvent = { status: SheinStatus; note?: string | null; created_at: string; actor_name?: string | null };
export type SheinPackage = { id: number; waybill?: string | null; tracking_number?: string | null; carrier?: string | null; note?: string | null; status: "shipped" | "received"; orders: number; shipped_at: string; received_at?: string | null; saudi_agent_name?: string | null };
export type SheinAgent = { user_id: number; role: SheinRole; active: boolean; name: string; phone?: string | null };

export const STATUS_META: Record<SheinStatus, { label: string; short: string; icon: string; color: string }> = {
  pending_payment_verification: { label: "بانتظار التحقق من الدفع", short: "التحقق من الدفع", icon: "receipt-outline", color: "#B45309" },
  paid_and_processing: { label: "تم تأكيد الدفع — قيد التنفيذ", short: "تأكيد الدفع", icon: "card-outline", color: "#0EA5E9" },
  purchased_saudi: { label: "تم الشراء من شي إن بالسعودية", short: "تم الشراء", icon: "bag-check-outline", color: "#7C3AED" },
  shipped_to_sudan: { label: "شُحن إلى السودان", short: "في الطريق", icon: "airplane-outline", color: "#2563EB" },
  received_hasahisa: { label: "وصل الحصاحيصا — جاهز للتسليم", short: "وصل الحصاحيصا", icon: "home-outline", color: "#0D9488" },
  delivered: { label: "تم التسليم", short: "تم التسليم", icon: "checkmark-done-circle", color: "#15803D" },
  cancelled: { label: "ملغي", short: "ملغي", icon: "close-circle-outline", color: "#B91C1C" },
};
/** مراحل الخط الزمني بالترتيب */
export const FLOW: SheinStatus[] = ["pending_payment_verification", "paid_and_processing", "purchased_saudi", "shipped_to_sudan", "received_hasahisa", "delivered"];

export const SERVICE_BADGE: Record<ServiceState, { label: string; color: string; bg: string; icon: string }> = {
  active: { label: "فعالة", color: "#15803D", bg: "#DCFCE7", icon: "checkmark-circle" },
  coming_soon: { label: "قريباً", color: "#946B00", bg: "#FFF4D6", icon: "time" },
  maintenance: { label: "قيد الصيانة", color: "#B42323", bg: "#FDECEC", icon: "construct" },
};
export const ROLE_LABEL: Record<SheinRole, string> = { verifier: "مدقق الدفع", saudi: "وكيل السعودية", hasahisa: "وكيل الحصاحيصا" };

const money = (n: number) => Math.round(n * 100) / 100;
export function computeFinancials(unitPriceSar: number, qty: number, s: SheinSettings) {
  const base = money(unitPriceSar * qty);
  const proxyFee = money(base * (s.proxy_fee_pct / 100) + s.proxy_fee_fixed_sar);
  const localShip = money(s.local_shipping_sar);
  const intlShip = money(s.intl_shipping_sar_per_item * qty);
  const totalSar = money(base + proxyFee + localShip + intlShip);
  const deliverySdg = Math.round(s.local_delivery_sdg);
  return {
    unit_price_sar: money(unitPriceSar), qty, base_price_sar: base,
    proxy_fee_sar: proxyFee, proxy_fee_pct: s.proxy_fee_pct, proxy_fee_fixed_sar: s.proxy_fee_fixed_sar,
    local_shipping_sar: localShip, international_shipping_sar: intlShip,
    local_delivery_sdg: deliverySdg, total_sar: totalSar, sar_to_sdg: s.sar_to_sdg,
    total_sdg: Math.round(totalSar * s.sar_to_sdg + deliverySdg),
  };
}
export const fmt = (n: number | string | null | undefined, digits = 0) =>
  Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function isSheinUrl(u: string): boolean {
  try { return /(^|\.)shein(link)?\.[a-z.]+$/i.test(new URL(u.trim()).hostname); } catch { return false; }
}
/** يستخرج الرابط من نص المشاركة (تطبيق شي إن يشارك نصاً + رابطاً) */
export function extractUrl(text: string): string {
  const m = /https?:\/\/[^\s"'<>]+/i.exec(text || "");
  return (m ? m[0] : text || "").trim().replace(/^http:\/\//i, "https://");
}

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers as any) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "تعذّر الاتصال بالخادم");
  return j as T;
}
const post = (body?: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });

export const sheinApi = {
  config: (token?: string | null) => call<{ settings: SheinSettings; roles: SheinRole[]; is_admin: boolean }>("/shein/config", {}, token),
  create: (token: string, body: Record<string, unknown>) => call<{ order: SheinOrder; message: string }>("/shein/orders", post(body), token),
  mine: (token: string) => call<{ orders: SheinOrder[] }>("/shein/orders/mine", {}, token),
  get: (token: string, id: number) => call<{ order: SheinOrder; events: SheinEvent[] }>(`/shein/orders/${id}`, {}, token),
  cancel: (token: string, id: number) => call<{ order: SheinOrder }>(`/shein/orders/${id}/cancel`, post(), token),
  verifyQueue: (token: string) => call<{ orders: SheinOrder[] }>("/shein/verify/queue", {}, token),
  verify: (token: string, id: number, approve: boolean, note?: string) => call<{ order: SheinOrder }>(`/shein/orders/${id}/verify`, post({ approve, note }), token),
  saudi: (token: string) => call<{ orders: SheinOrder[]; packages: SheinPackage[] }>("/shein/saudi/orders", {}, token),
  claim: (token: string, id: number) => call(`/shein/orders/${id}/claim`, post(), token),
  purchased: (token: string, id: number, shein_order_no?: string) => call<{ order: SheinOrder }>(`/shein/orders/${id}/purchased`, post({ shein_order_no }), token),
  createPackage: (token: string, body: { order_ids: number[]; tracking_number?: string; waybill?: string; carrier?: string; note?: string }) => call<{ package: SheinPackage; orders: number }>("/shein/packages", post(body), token),
  hasahisa: (token: string) => call<{ packages: SheinPackage[]; orders: SheinOrder[]; delivered: SheinOrder[] }>("/shein/hasahisa/board", {}, token),
  receive: (token: string, pid: number) => call<{ orders: number }>(`/shein/packages/${pid}/receive`, post(), token),
  delivered: (token: string, id: number) => call<{ order: SheinOrder }>(`/shein/orders/${id}/delivered`, post(), token),
  overview: (token: string, status?: string) => call<{ orders: SheinOrder[]; counts: { status: SheinStatus; n: number; sdg: number }[]; agents: SheinAgent[]; settings: SheinSettings }>(`/admin/shein/overview${status ? `?status=${status}` : ""}`, {}, token),
  saveSettings: (token: string, body: Partial<SheinSettings>) => call<{ settings: SheinSettings }>("/admin/shein/settings", { method: "PUT", body: JSON.stringify(body) }, token),
  addAgent: (token: string, phone: string, role: SheinRole) => call<{ agent: SheinAgent }>("/admin/shein/agents", post({ phone, role }), token),
  removeAgent: (token: string, userId: number, role: SheinRole) => call(`/admin/shein/agents/${userId}/${role}`, { method: "DELETE" }, token),
  adminCancel: (token: string, id: number, reason: string) => call<{ order: SheinOrder }>(`/admin/shein/orders/${id}/cancel`, post({ reason }), token),
};

/** حالة الخدمة لشارة «قريباً / فعالة / قيد الصيانة» في الرئيسية (مخبأة لدقيقتين) */
let cached: { at: number; v: ServiceState } | null = null;
export function useSheinServiceState(): ServiceState | null {
  const [v, setV] = useState<ServiceState | null>(cached?.v ?? null);
  useEffect(() => {
    if (cached && Date.now() - cached.at < 120_000) return;
    let alive = true;
    sheinApi.config().then(r => { cached = { at: Date.now(), v: r.settings.status }; if (alive) setV(r.settings.status); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return v;
}
