import { getApiUrl } from "@/lib/query-client";

export type FuelKey = "gasoline" | "diesel" | "gas";
export type FuelState = { fuel: FuelKey; available: boolean; price: string | number | null; queue: "none" | "short" | "long"; updated_at: string };
export type FuelReport = { fuel: FuelKey; last_available: boolean | null; yes: number; no: number; last_at: string };
export type StationKind = "station" | "gas_shop";
export const KIND_META: Record<StationKind, { label: string; short: string; icon: string }> = {
  station: { label: "محطة وقود", short: "محطة", icon: "speedometer" },
  gas_shop: { label: "محل غاز", short: "محل غاز", icon: "flame" },
};
/** أنواع الوقود التي يبيعها النشاط */
export const fuelsFor = (kind?: StationKind): FuelKey[] => (kind === "gas_shop" ? ["gas"] : ["gasoline", "diesel", "gas"]);

export type FuelStation = {
  id: number; name: string; kind?: StationKind; brand?: string | null; logo_url?: string | null; cover_url?: string | null;
  phone?: string | null; whatsapp?: string | null; area?: string | null; address?: string | null;
  lat?: number | null; lng?: number | null; hours?: string | null; is_24h: boolean;
  services: string[]; notes?: string | null; status: "pending" | "approved" | "suspended";
  owner_user_id?: number | null; updated_at: string; created_at: string;
  fuels: FuelState[]; reports: FuelReport[];
};
export type FuelCatalog = { fuels: Record<FuelKey, { label: string; unit: string }>; services: Record<string, string> };

export const FUEL_META: Record<FuelKey, { label: string; unit: string; icon: string; color: string }> = {
  gasoline: { label: "بنزين", unit: "لتر", icon: "car-sport", color: "#10B981" },
  diesel: { label: "جازولين", unit: "لتر", icon: "bus", color: "#0EA5E9" },
  gas: { label: "غاز الطبخ", unit: "أسطوانة", icon: "flame", color: "#F97316" },
};

export const SERVICE_ICONS: Record<string, string> = {
  car_wash: "water", oil_change: "color-fill", tires: "disc", mechanic: "construct", mini_market: "basket",
  cafe: "cafe", restroom: "man", mosque: "moon", e_payment: "card", atm: "cash", parking: "car", towing: "git-pull-request",
};

export const QUEUE_LABEL: Record<string, { label: string; color: string }> = {
  none: { label: "بلا زحام", color: "#10B981" },
  short: { label: "زحام خفيف", color: "#F59E0B" },
  long: { label: "زحام شديد", color: "#EF4444" },
};

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers as any) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as any)?.error || `خطأ (${r.status})`);
  return d as T;
}

export const fuelApi = {
  list: () => call<{ stations: FuelStation[] } & FuelCatalog>("/fuel-stations"),
  mine: (token: string) => call<{ stations: FuelStation[]; is_admin: boolean } & FuelCatalog>("/fuel-stations/mine", {}, token),
  create: (token: string, body: Partial<FuelStation>) => call<{ id: number; status: string; message: string }>("/fuel-stations", { method: "POST", body: JSON.stringify(body) }, token),
  update: (token: string, id: number, body: Partial<FuelStation>) => call<{ station: FuelStation }>(`/fuel-stations/${id}`, { method: "PATCH", body: JSON.stringify(body) }, token),
  setFuels: (token: string, id: number, fuels: Partial<FuelState>[]) => call<{ station: FuelStation }>(`/fuel-stations/${id}/fuels`, { method: "PUT", body: JSON.stringify({ fuels }) }, token),
  report: (token: string, id: number, fuel: FuelKey, available: boolean) => call<{ message: string }>(`/fuel-stations/${id}/report`, { method: "POST", body: JSON.stringify({ fuel, available }) }, token),
  setStatus: (token: string, id: number, status: string) => call(`/admin/fuel-stations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token),
  addManager: (token: string, id: number, phone: string) => call<{ manager: { name: string } }>(`/admin/fuel-stations/${id}/managers`, { method: "POST", body: JSON.stringify({ phone }) }, token),
};

/** «منذ 5 دقائق» */
export function ago(iso?: string | null) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${Math.round(h / 24)} يوم`;
}

/** حالة الوقود الفعلية: بيان المحطة، وإن كان قديماً (> 6 ساعات) وبلاغ مواطن أحدث فنعرض البلاغ */
export function effectiveFuel(st: FuelStation, fuel: FuelKey): { available: boolean | null; source: "station" | "report" | "none"; at?: string; price?: number | null; queue?: string } {
  const s = st.fuels.find(f => f.fuel === fuel);
  const rep = st.reports?.find(r => r.fuel === fuel);
  const sAt = s ? new Date(s.updated_at).getTime() : 0;
  const rAt = rep ? new Date(rep.last_at).getTime() : 0;
  if (rep && rep.last_available !== null && rAt > sAt && Date.now() - sAt > 6 * 3600_000) {
    return { available: rep.last_available, source: "report", at: rep.last_at, price: s?.price != null ? Number(s.price) : null, queue: s?.queue };
  }
  if (s) return { available: s.available, source: "station", at: s.updated_at, price: s.price != null ? Number(s.price) : null, queue: s.queue };
  return { available: null, source: "none" };
}
