// واجهة المطاعم والكافتريات على الخادم
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import Colors from "@/constants/colors";

export type BizType = "restaurant" | "cafe" | "bakery" | "juice";
export type FoodCat = "meals" | "drinks" | "dessert" | "bakery" | "offers";
export type OrderType = "delivery" | "takeaway" | "dine_in";
export type OrderStatus = "new" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";

export type FoodBusiness = {
  id: number; name: string; business_type: BizType;
  phone?: string | null; whatsapp?: string | null; address?: string | null; district?: string | null;
  description?: string | null; logo_url?: string | null; cover_url?: string | null;
  opening_hours?: string | null; prep_note?: string | null;
  delivery_enabled: boolean; takeaway_enabled: boolean; dine_in_enabled: boolean;
  delivery_fee: number; min_order: number; accepting_orders: boolean;
  status: "pending" | "approved" | "rejected"; owner_user_id?: number | null;
  product_count?: number; is_owner?: boolean;
};

export type FoodProduct = {
  id: number; business_id: number; name: string; category: FoodCat; description?: string | null;
  price: number; cost?: number; stock?: number | null; prep_minutes?: number; is_available: boolean;
  images: { image_url: string }[]; business_name?: string;
};

export type OrderItem = { id: number; name: string; price: number; qty: number; note?: string };

export type FoodOrder = {
  id: number; order_number: string; business_id: number; customer_name?: string | null; customer_phone?: string | null;
  order_type: OrderType; status: OrderStatus; subtotal: number; delivery_fee: number; total: number;
  notes?: string | null; delivery_address?: string | null; items: OrderItem[]; created_at: string; updated_at?: string;
  cancel_reason?: string | null;
  business_name?: string; business_phone?: string | null; business_whatsapp?: string | null; business_logo?: string | null;
};

export type FoodInvoice = {
  id: number; invoice_number: string; order_id?: number | null; subtotal: number; discount: number; total: number;
  payment_method: string; paid_amount: number; change_amount: number; items: OrderItem[]; issued_at: string;
};

export type FoodReport = {
  period: string;
  summary: { invoice_count: number; sales_total: number; discount_total: number; avg_ticket: number; cost_total: number; profit: number };
  top_products: { name: string; qty: number; total: number }[];
  orders_by_status: Partial<Record<OrderStatus, number>>;
};

export const TYPE_META: Record<BizType, { label: string; icon: string; color: string }> = {
  restaurant: { label: "مطعم", icon: "silverware-fork-knife", color: "#0E9C64" },
  cafe: { label: "كافتيريا", icon: "coffee", color: "#C26D3D" },
  bakery: { label: "مخبز وحلويات", icon: "baguette", color: "#B88400" },
  juice: { label: "عصائر ومثلجات", icon: "cup", color: "#2186C2" },
};

export const CAT_META: Record<FoodCat, { label: string; icon: string }> = {
  meals: { label: "وجبات", icon: "food" },
  drinks: { label: "مشروبات", icon: "cup" },
  dessert: { label: "حلويات", icon: "cake-variant" },
  bakery: { label: "مخبوزات", icon: "baguette" },
  offers: { label: "عروض", icon: "tag-heart" },
};
export const CAT_KEYS = Object.keys(CAT_META) as FoodCat[];

export const ORDER_TYPE_AR: Record<OrderType, string> = { delivery: "توصيل", takeaway: "استلام", dine_in: "داخل المحل" };

export const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string; icon: string }> = {
  new: { label: "جديد", color: "#B3261E", bg: "#FDE8E8", icon: "notifications" },
  accepted: { label: "مقبول", color: "#0E5A80", bg: "#E2EEF5", icon: "checkmark-circle" },
  preparing: { label: "قيد التحضير", color: "#8A6400", bg: "#FFF4D6", icon: "flame" },
  ready: { label: "جاهز", color: "#0B7A4E", bg: "#E6F4EC", icon: "bag-check" },
  delivered: { label: "تم التسليم", color: "#3D4A43", bg: "#EEF1EF", icon: "checkmark-done" },
  cancelled: { label: "ملغي", color: "#6B6B6B", bg: "#F0F0F0", icon: "close-circle" },
};
export const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: "accepted", label: "قبول الطلب" },
  accepted: { to: "preparing", label: "بدء التحضير" },
  preparing: { to: "ready", label: "الطلب جاهز" },
  ready: { to: "delivered", label: "تم التسليم" },
};

export const fmtMoney = (n: number) => `${Math.round(Number(n || 0)).toLocaleString("en-US")} ج.س`;
export const productImage = (p: Pick<FoodProduct, "images">) => p.images?.[0]?.image_url || null;
export const bizColor = (b: Pick<FoodBusiness, "business_type">) => (TYPE_META[b.business_type] || TYPE_META.restaurant).color || Colors.primary;

export function waLink(num?: string | null, text?: string) {
  if (!num) return null;
  let d = num.replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "249" + d.slice(1);
  if (!d.startsWith("249") && d.length === 9) d = "249" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

export class FoodApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }

async function call<T>(path: string, token?: string | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${getApiUrl()}${path}`, { method: init.method || "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch { throw new FoodApiError("تعذّر الاتصال — تحقق من الإنترنت", 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new FoodApiError((data as any)?.error || `خطأ (${res.status})`, res.status);
  return data as T;
}

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return p ? `?${p}` : "";
};

export const foodApi = {
  businesses: (token?: string | null, o: { type?: BizType | ""; q?: string; mine?: boolean; all?: boolean } = {}) =>
    call<{ businesses: FoodBusiness[]; can_moderate: boolean }>(`/api/food/businesses${qs({ type: o.type, q: o.q, mine: o.mine ? 1 : undefined, all: o.all ? 1 : undefined })}`, token),
  business: (id: number | string, token?: string | null) =>
    call<{ business: FoodBusiness; products: FoodProduct[]; can_manage: boolean; can_moderate: boolean; active_orders: number }>(`/api/food/businesses/${id}`, token),
  createBusiness: (token: string | null | undefined, body: Partial<FoodBusiness>) => call<{ business: FoodBusiness; message: string }>(`/api/food/businesses`, token, { method: "POST", body }),
  updateBusiness: (token: string | null | undefined, id: number, body: Partial<FoodBusiness> & { status?: string }) => call<{ business: FoodBusiness }>(`/api/food/businesses/${id}`, token, { method: "PATCH", body }),
  deleteBusiness: (token: string | null | undefined, id: number) => call<{ ok: true }>(`/api/food/businesses/${id}`, token, { method: "DELETE" }),
  createProduct: (token: string | null | undefined, body: any) => call<{ product: FoodProduct }>(`/api/food/products`, token, { method: "POST", body }),
  updateProduct: (token: string | null | undefined, id: number, body: any) => call<{ product: FoodProduct }>(`/api/food/products/${id}`, token, { method: "PATCH", body }),
  deleteProduct: (token: string | null | undefined, id: number) => call<{ ok: true }>(`/api/food/products/${id}`, token, { method: "DELETE" }),
  placeOrder: (token: string | null | undefined, body: any) => call<{ order: FoodOrder; message: string }>(`/api/food/orders`, token, { method: "POST", body }),
  orders: (token: string | null | undefined, businessId: number, scope: "active" | "done" | "all" = "active") => call<{ orders: FoodOrder[] }>(`/api/food/orders${qs({ business_id: businessId, scope })}`, token),
  myOrders: (token: string | null | undefined) => call<{ orders: FoodOrder[] }>(`/api/food/my-orders`, token),
  setOrderStatus: (token: string | null | undefined, id: number, status: OrderStatus, reason?: string) => call<{ order: FoodOrder }>(`/api/food/orders/${id}`, token, { method: "PATCH", body: { status, reason } }),
  invoice: (token: string | null | undefined, body: any) => call<{ invoice: FoodInvoice }>(`/api/food/invoices`, token, { method: "POST", body }),
  invoices: (token: string | null | undefined, businessId: number) => call<{ invoices: FoodInvoice[] }>(`/api/food/invoices${qs({ business_id: businessId })}`, token),
  report: (token: string | null | undefined, businessId: number, period: "day" | "week" | "month" | "year") => call<FoodReport>(`/api/food/reports${qs({ business_id: businessId, period })}`, token),
};
