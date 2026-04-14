import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────
type Driver = {
  id: number; name: string; phone: string;
  vehicle_type: string; vehicle_desc?: string; plate?: string;
  area?: string; status: "pending" | "approved" | "rejected";
  admin_note?: string; is_online: boolean;
  rating?: number; total_trips?: number; created_at: string;
  user_name_ref?: string;
};
type Trip = {
  id: number; user_name: string; user_phone: string;
  from_zone: number; to_zone: number;
  from_detail?: string; to_detail?: string;
  trip_type: string; status: string; estimated_fare?: number;
  driver_id?: number; driver_name?: string; driver_phone?: string;
  notes?: string; created_at: string;
};
type FareRow = { from_zone: number; to_zone: number; fare_car: number; fare_rickshaw: number; fare_delivery: number };
type Settings = { transport_status: string; transport_note: string; transport_phone?: string };
type Overview = { drivers: any; trips: any; fares: FareRow[]; settings: any };

// ─── Constants ──────────────────────────────────────────────────────────────
const ZONES: Record<number, string> = { 1: "م١ · وسط المدينة", 2: "م٢ · الشمالية", 3: "م٣ · الجنوبية", 4: "م٤ · الشرقية", 5: "م٥ · الغربية" };
const VEHICLE_ICON: Record<string, string> = { car: "🚗", motorcycle: "🏍️", tuk_tuk: "🛺", pickup: "🛻", bus: "🚌", سيارة: "🚗", ركشة: "🛺", دراجة: "🏍️" };
const TRIP_TYPE_AR: Record<string, string> = { car: "سيارة", rickshaw: "ركشة", delivery: "توصيل" };
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "انتظار",    color: "#fbbf24", bg: "rgba(251,191,36,.12)"  },
  active:     { label: "جارية",    color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  completed:  { label: "مكتملة",   color: "#60a5fa", bg: "rgba(96,165,250,.12)"  },
  cancelled:  { label: "ملغاة",    color: "#f87171", bg: "rgba(248,113,113,.12)" },
  approved:   { label: "مقبول",    color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  rejected:   { label: "مرفوض",   color: "#f87171", bg: "rgba(248,113,113,.12)" },
};
const orange = "#f97316";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: "#94a3b8", bg: "rgba(148,163,184,.12)" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}30`, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}
function KpiCard({ value, label, icon, color = orange }: { value: string | number; label: string; icon: string; color?: string }) {
  return (
    <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 150 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color + "18", border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "hsl(210 40% 95%)", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "hsl(210 40% 85%)", display: "flex", alignItems: "center", gap: 8 }}>{children}</h3>;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Transport() {
  const [tab, setTab] = useState<"overview" | "drivers" | "trips" | "fares" | "settings">("overview");
  const [overview,  setOverview]  = useState<any>(null);
  const [drivers,   setDrivers]   = useState<Driver[]>([]);
  const [trips,     setTrips]     = useState<Trip[]>([]);
  const [fares,     setFares]     = useState<FareRow[]>([]);
  const [settings,  setSettings]  = useState<Settings>({ transport_status: "available", transport_note: "" });
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // Filters
  const [driverFilter, setDriverFilter] = useState("all");
  const [tripFilter,   setTripFilter]   = useState("all");
  const [search,       setSearch]       = useState("");

  // Assign modal
  const [assignTrip,    setAssignTrip]   = useState<Trip | null>(null);
  const [assignDriver,  setAssignDriver] = useState<number | "">("");

  // Note modal
  const [noteDriver, setNoteDriver] = useState<Driver | null>(null);
  const [noteText,   setNoteText]   = useState("");

  // Inline fare edit
  const [editFare, setEditFare] = useState<FareRow | null>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, dr, tr, fa, se] = await Promise.all([
        apiJson<any>("/admin/transport/overview"),
        apiJson<Driver[]>("/admin/transport/drivers"),
        apiJson<Trip[]>("/admin/transport/trips"),
        apiJson<FareRow[]>("/transport/fares"),
        apiJson<Settings>("/admin/transport/settings"),
      ]);
      setOverview(ov);
      setDrivers(Array.isArray(dr) ? dr : []);
      setTrips(Array.isArray(tr) ? tr : []);
      // fares: may be nested object or flat array
      if (Array.isArray(fa)) {
        setFares(fa);
      } else if (fa && typeof fa === "object") {
        const rows: FareRow[] = [];
        for (const from of Object.keys(fa) as any[]) {
          for (const to of Object.keys((fa as any)[from])) {
            const cell = (fa as any)[from][to];
            rows.push({ from_zone: +from, to_zone: +to, fare_car: cell.car, fare_rickshaw: cell.rickshaw, fare_delivery: cell.delivery });
          }
        }
        setFares(rows);
      }
      if (se && typeof se === "object") {
        setSettings({
          transport_status: (se as any).transport_status ?? "available",
          transport_note:   (se as any).transport_note   ?? "",
          transport_phone:  (se as any).transport_phone  ?? "",
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const setDriverStatus = async (id: number, status: string, note?: string) => {
    await apiFetch(`/admin/transport/drivers/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...(note !== undefined ? { admin_note: note } : {}) }) });
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, status: status as any, ...(note !== undefined ? { admin_note: note } : {}) } : d));
  };
  const deleteDriver = async (id: number) => {
    if (!confirm("حذف هذا السائق نهائياً؟")) return;
    await apiFetch(`/admin/transport/drivers/${id}`, { method: "DELETE" });
    setDrivers(prev => prev.filter(d => d.id !== id));
  };
  const deleteTrip = async (id: number) => {
    if (!confirm("حذف هذه الرحلة؟")) return;
    await apiFetch(`/admin/transport/trips/${id}`, { method: "DELETE" });
    setTrips(prev => prev.filter(t => t.id !== id));
  };
  const assignDriverToTrip = async () => {
    if (!assignTrip || !assignDriver) return;
    await apiFetch(`/admin/transport/trips/${assignTrip.id}/assign`, { method: "PATCH", body: JSON.stringify({ driver_id: assignDriver, status: "active" }) });
    const drv = drivers.find(d => d.id === +assignDriver);
    setTrips(prev => prev.map(t => t.id === assignTrip.id ? { ...t, driver_id: +assignDriver, driver_name: drv?.name, status: "active" } : t));
    setAssignTrip(null); setAssignDriver("");
  };
  const saveSettings = async () => {
    setSaving(true);
    await apiFetch("/admin/transport/settings", { method: "PUT", body: JSON.stringify(settings) });
    setSaving(false);
    alert("✅ تم حفظ الإعدادات");
  };
  const saveFare = async (f: FareRow) => {
    await apiFetch("/admin/transport/fares", { method: "PUT", body: JSON.stringify(f) });
    setFares(prev => prev.map(r => r.from_zone === f.from_zone && r.to_zone === f.to_zone ? f : r));
    setEditFare(null);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const pendingDrivers   = drivers.filter(d => d.status === "pending");
  const approvedDrivers  = drivers.filter(d => d.status === "approved");
  const onlineDrivers    = drivers.filter(d => d.is_online && d.status === "approved");
  const pendingTrips     = trips.filter(t => t.status === "pending");
  const activeTrips      = trips.filter(t => t.status === "active");

  const filteredDrivers = drivers.filter(d => {
    if (driverFilter !== "all" && d.status !== driverFilter) return false;
    if (search && !d.name.includes(search) && !d.phone.includes(search)) return false;
    return true;
  });
  const filteredTrips = trips.filter(t => {
    if (tripFilter !== "all" && t.status !== tripFilter) return false;
    if (search && !t.user_name?.includes(search) && !t.user_phone?.includes(search)) return false;
    return true;
  });

  // ─── Tab Renderer ─────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard value={approvedDrivers.length} label="سائق مقبول"      icon="🚗" color={orange} />
        <KpiCard value={onlineDrivers.length}   label="سائق متصل الآن"  icon="🟢" color="#34d399" />
        <KpiCard value={pendingDrivers.length}  label="طلبات انتضار"     icon="⏳" color="#fbbf24" />
        <KpiCard value={pendingTrips.length}    label="رحلة بانتظار سائق" icon="📍" color="#f87171" />
        <KpiCard value={activeTrips.length}     label="رحلة جارية"       icon="🔄" color="#60a5fa" />
        <KpiCard value={trips.filter(t => t.status === "completed").length} label="رحلة مكتملة" icon="✅" color="#a78bfa" />
      </div>

      {/* Service Status Banner */}
      <div style={{
        background: settings.transport_status === "available" ? "rgba(52,211,153,.08)" : "rgba(251,191,36,.08)",
        border: `1px solid ${settings.transport_status === "available" ? "rgba(52,211,153,.3)" : "rgba(251,191,36,.3)"}`,
        borderRadius: 16, padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>{settings.transport_status === "available" ? "✅" : settings.transport_status === "maintenance" ? "🔧" : "🕐"}</div>
          <div>
            <div style={{ fontWeight: 700, color: "hsl(210 40% 90%)", fontSize: 15 }}>
              {settings.transport_status === "available" ? "الخدمة تعمل" : settings.transport_status === "maintenance" ? "وضع الصيانة" : "الخدمة قادمة قريباً"}
            </div>
            {settings.transport_note && <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 2 }}>{settings.transport_note}</div>}
          </div>
        </div>
        <button onClick={() => setTab("settings")} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid hsl(217 32% 22%)", background: "transparent", color: "hsl(215 20% 65%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>تعديل الإعدادات</button>
      </div>

      {/* Recent Pending Trips */}
      {pendingTrips.length > 0 && (
        <div>
          <SectionTitle>⚡ رحلات تحتاج تعيين سائق ({pendingTrips.length})</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingTrips.slice(0, 5).map(t => (
              <div key={t.id} style={{ background: "hsl(222 47% 10%)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: "hsl(210 40% 90%)", fontSize: 14 }}>{t.user_name}</div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 3 }}>
                    {ZONES[t.from_zone] ?? `م${t.from_zone}`} → {ZONES[t.to_zone] ?? `م${t.to_zone}`}
                    {t.trip_type ? ` · ${TRIP_TYPE_AR[t.trip_type] ?? t.trip_type}` : ""}
                    {t.estimated_fare ? ` · ${t.estimated_fare} ج.س` : ""}
                  </div>
                </div>
                <Badge status={t.status} />
                <button onClick={() => { setAssignTrip(t); setTab("trips"); }}
                  style={{ padding: "7px 16px", borderRadius: 10, border: `1px solid ${orange}50`, background: orange + "15", color: orange, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>
                  📡 تعيين سائق
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Drivers */}
      {pendingDrivers.length > 0 && (
        <div>
          <SectionTitle>🆕 سائقون ينتظرون الموافقة ({pendingDrivers.length})</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingDrivers.map(d => (
              <div key={d.id} style={{ background: "hsl(222 47% 10%)", border: "1px solid rgba(251,191,36,.15)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, color: "hsl(210 40% 90%)", fontSize: 14 }}>{d.name} <span style={{ fontSize: 18 }}>{VEHICLE_ICON[d.vehicle_type] ?? "🚗"}</span></div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 2 }}>{d.phone}{d.plate ? ` · ${d.plate}` : ""}{d.area ? ` · ${d.area}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setDriverStatus(d.id, "approved")} style={{ padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.12)", color: "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>✓ قبول</button>
                  <button onClick={() => setDriverStatus(d.id, "rejected")} style={{ padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.1)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>✗ رفض</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderDrivers = () => (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "pending", "approved", "rejected"] as const).map(f => {
            const labels: Record<string, string> = { all: `الكل (${drivers.length})`, pending: `انتظار (${pendingDrivers.length})`, approved: `مقبول (${approvedDrivers.length})`, rejected: "مرفوض" };
            return (
              <button key={f} onClick={() => setDriverFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: driverFilter === f ? `${orange}60` : "hsl(217 32% 17%)", background: driverFilter === f ? `${orange}15` : "transparent", color: driverFilter === f ? orange : "hsl(215 20% 55%)" }}>
                {labels[f]}
              </button>
            );
          })}
        </div>
        <input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: 220 }} />
      </div>

      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 1.4fr", padding: "11px 18px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)" }}>
          <span>السائق</span><span>الهاتف · اللوحة</span><span>المنطقة</span><span>الحالة</span><span>التقييم</span><span>الإجراءات</span>
        </div>
        {filteredDrivers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>لا يوجد سائقون</div>
        ) : filteredDrivers.map(d => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 0.8fr 1.4fr", padding: "13px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
            {/* Name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${orange}15`, border: `1px solid ${orange}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                {VEHICLE_ICON[d.vehicle_type] ?? "🚗"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{d.name}</div>
                {d.vehicle_desc && <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{d.vehicle_desc}</div>}
                {d.is_online && <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700 }}>● متصل</span>}
              </div>
            </div>
            {/* Contact */}
            <div style={{ fontSize: 12, color: "hsl(215 20% 58%)" }}>
              <div>{d.phone}</div>
              {d.plate && <div style={{ marginTop: 2 }}>{d.plate}</div>}
            </div>
            {/* Area */}
            <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{d.area || "—"}</span>
            {/* Status */}
            <Badge status={d.status} />
            {/* Rating */}
            <div style={{ fontSize: 13, color: "#fbbf24" }}>
              {d.rating ? `⭐ ${d.rating}` : "—"}
              {d.total_trips ? <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>{d.total_trips} رحلة</div> : null}
            </div>
            {/* Actions */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {d.status !== "approved" && (
                <button onClick={() => setDriverStatus(d.id, "approved")} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>قبول</button>
              )}
              {d.status !== "rejected" && (
                <button onClick={() => setDriverStatus(d.id, "rejected")} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>رفض</button>
              )}
              <button onClick={() => { setNoteDriver(d); setNoteText(d.admin_note || ""); }}
                style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>ملاحظة</button>
              <button onClick={() => deleteDriver(d.id)}
                style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTrips = () => (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "pending", "active", "completed", "cancelled"] as const).map(f => {
            const counts: Record<string, number> = { all: trips.length, pending: pendingTrips.length, active: activeTrips.length, completed: trips.filter(t => t.status === "completed").length, cancelled: trips.filter(t => t.status === "cancelled").length };
            const labels: Record<string, string> = { all: "الكل", pending: "انتظار", active: "جارية", completed: "مكتملة", cancelled: "ملغاة" };
            const isActive = tripFilter === f;
            return (
              <button key={f} onClick={() => setTripFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: isActive ? (STATUS_META[f]?.color ?? orange) + "60" : "hsl(217 32% 17%)", background: isActive ? (STATUS_META[f]?.color ?? orange) + "15" : "transparent", color: isActive ? (STATUS_META[f]?.color ?? orange) : "hsl(215 20% 55%)" }}>
                {labels[f]} {counts[f] > 0 && <span style={{ opacity: 0.75 }}>({counts[f]})</span>}
              </button>
            );
          })}
        </div>
        <input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: 220 }} />
      </div>

      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.2fr 1.4fr", padding: "11px 18px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)" }}>
          <span>العميل</span><span>المسار</span><span>النوع · الأجرة</span><span>الحالة · السائق</span><span>الإجراءات</span>
        </div>
        {filteredTrips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>لا توجد رحلات</div>
        ) : filteredTrips.map(t => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.2fr 1.4fr", padding: "13px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{t.user_name}</div>
              <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginTop: 2 }}>{t.user_phone}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "hsl(210 40% 80%)" }}>
                {ZONES[t.from_zone] ?? `م${t.from_zone}`} <span style={{ color: orange }}>→</span> {ZONES[t.to_zone] ?? `م${t.to_zone}`}
              </div>
              {(t.from_detail || t.to_detail) && <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>{t.from_detail} {t.to_detail ? `→ ${t.to_detail}` : ""}</div>}
              <div style={{ fontSize: 10, color: "hsl(215 20% 40%)", marginTop: 2 }}>{new Date(t.created_at).toLocaleString("ar-SA")}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "hsl(210 40% 75%)" }}>{TRIP_TYPE_AR[t.trip_type] ?? t.trip_type}</div>
              {t.estimated_fare ? <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 2, fontWeight: 700 }}>{t.estimated_fare} ج.س</div> : null}
            </div>
            <div>
              <Badge status={t.status} />
              {t.driver_name && <div style={{ fontSize: 11, color: "hsl(215 20% 52%)", marginTop: 4 }}>🚗 {t.driver_name}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {t.status === "pending" && (
                <button onClick={() => setAssignTrip(t)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${orange}50`, background: `${orange}12`, color: orange, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>📡 تعيين</button>
              )}
              <button onClick={() => deleteTrip(t.id)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFares = () => {
    const zones = [1, 2, 3, 4, 5];
    return (
      <div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "hsl(215 20% 52%)" }}>اضغط على أي خلية لتعديل التعرفة بين المنطقتين</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "hsl(222 47% 10%)", borderRadius: 16, overflow: "hidden", border: "1px solid hsl(217 32% 14%)" }}>
            <thead>
              <tr style={{ background: "hsl(222 47% 9%)" }}>
                <th style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", textAlign: "right", borderBottom: "1px solid hsl(217 32% 14%)", borderLeft: "1px solid hsl(217 32% 14%)" }}>من ↓  إلى ←</th>
                {zones.map(z => (
                  <th key={z} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: orange, textAlign: "center", borderBottom: "1px solid hsl(217 32% 14%)", borderLeft: "1px solid hsl(217 32% 14%)", whiteSpace: "nowrap" }}>م{z}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map(from => (
                <tr key={from}>
                  <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700, color: orange, borderBottom: "1px solid hsl(217 32% 12%)", borderLeft: "1px solid hsl(217 32% 14%)", whiteSpace: "nowrap" }}>م{from}</td>
                  {zones.map(to => {
                    const fare = fares.find(f => f.from_zone === from && f.to_zone === to);
                    if (!fare) return <td key={to} style={{ padding: "12px 14px", textAlign: "center", color: "hsl(215 20% 30%)", borderBottom: "1px solid hsl(217 32% 12%)", borderLeft: "1px solid hsl(217 32% 14%)", fontSize: 12 }}>—</td>;
                    return (
                      <td key={to} onClick={() => setEditFare({ ...fare })}
                        style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid hsl(217 32% 12%)", borderLeft: "1px solid hsl(217 32% 14%)", cursor: "pointer", transition: "background .2s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${orange}10`)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(210 40% 88%)" }}>{fare.fare_car} <span style={{ fontSize: 10, color: "hsl(215 20% 45%)" }}>ج.س</span></div>
                        <div style={{ fontSize: 10, color: "hsl(215 20% 48%)", marginTop: 2 }}>ر:{fare.fare_rickshaw} · ت:{fare.fare_delivery}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "hsl(215 20% 45%)" }}>
          السطر الأول: سيارة · ر: ركشة · ت: توصيل — الأسعار بالجنيه السوداني
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Service Status */}
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 15%)", padding: "22px 24px" }}>
        <SectionTitle>⚙️ حالة الخدمة</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { value: "available",    label: "متاحة ✅",      desc: "التطبيق يقبل الطلبات والحجوزات" },
            { value: "maintenance",  label: "صيانة 🔧",      desc: "الخدمة معطّلة مؤقتاً للصيانة" },
            { value: "coming_soon",  label: "قريباً 🕐",      desc: "إشعار المستخدمين بموعد الإطلاق" },
          ] as const).map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, cursor: "pointer", background: settings.transport_status === opt.value ? `${orange}10` : "transparent", border: `1px solid ${settings.transport_status === opt.value ? orange + "40" : "hsl(217 32% 17%)"}` }}>
              <input type="radio" name="status" value={opt.value} checked={settings.transport_status === opt.value}
                onChange={() => setSettings(s => ({ ...s, transport_status: opt.value }))}
                style={{ marginTop: 3, accentColor: orange }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 40% 88%)" }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: "hsl(215 20% 52%)", marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Note */}
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 15%)", padding: "22px 24px" }}>
        <SectionTitle>📝 رسالة للمستخدمين</SectionTitle>
        <textarea
          value={settings.transport_note}
          onChange={e => setSettings(s => ({ ...s, transport_note: e.target.value }))}
          rows={3} placeholder="تُعرض في شاشة انتظار أو صيانة الخدمة..."
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 8%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
        />
      </div>

      {/* Phone */}
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 15%)", padding: "22px 24px" }}>
        <SectionTitle>📞 رقم دعم الخدمة</SectionTitle>
        <input
          value={settings.transport_phone ?? ""}
          onChange={e => setSettings(s => ({ ...s, transport_phone: e.target.value }))}
          placeholder="+249 9XX XXX XXX"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 8%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
        />
      </div>

      <button onClick={saveSettings} disabled={saving} style={{
        padding: "13px", borderRadius: 14, border: "none",
        background: saving ? "hsl(217 32% 18%)" : `linear-gradient(135deg, ${orange}, #ea580c)`,
        color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
      }}>{saving ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}</button>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  const TABS = [
    { key: "overview", label: "النظرة العامة", icon: "📊" },
    { key: "drivers",  label: `السائقون ${pendingDrivers.length > 0 ? `(${pendingDrivers.length}🔴)` : ""}`, icon: "🚗" },
    { key: "trips",    label: `الرحلات ${pendingTrips.length > 0 ? `(${pendingTrips.length}🟡)` : ""}`,    icon: "📍" },
    { key: "fares",    label: "التعرفة",    icon: "💰" },
    { key: "settings", label: "الإعدادات", icon: "⚙️" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Page Header */}
      <div style={{ padding: "24px 28px 0", borderBottom: "1px solid hsl(217 32% 13%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `${orange}18`, border: `1px solid ${orange}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🚗</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "hsl(210 40% 95%)" }}>مشوارك علينا</h1>
            <p style={{ margin: 0, fontSize: 13, color: "hsl(215 20% 50%)" }}>لوحة إدارة خدمة النقل اللوجستي</p>
          </div>
          <button onClick={load} style={{ marginRight: "auto", padding: "8px 16px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>🔄 تحديث</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
              style={{
                padding: "10px 18px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                background: "transparent",
                color: tab === t.key ? orange : "hsl(215 20% 52%)",
                borderBottom: `2px solid ${tab === t.key ? orange : "transparent"}`,
                transition: "all .2s",
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 28px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "hsl(215 20% 45%)", fontSize: 15 }}>⏳ جارٍ تحميل البيانات...</div>
        ) : (
          <>
            {tab === "overview" && renderOverview()}
            {tab === "drivers"  && renderDrivers()}
            {tab === "trips"    && renderTrips()}
            {tab === "fares"    && renderFares()}
            {tab === "settings" && renderSettings()}
          </>
        )}
      </div>

      {/* ── Assign Driver Modal ── */}
      {assignTrip && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setAssignTrip(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 400, maxWidth: "90vw", boxShadow: "0 24px 60px rgba(0,0,0,.6)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 92%)" }}>📡 تعيين سائق للرحلة</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "hsl(215 20% 52%)" }}>
              {assignTrip.user_name} · {ZONES[assignTrip.from_zone] ?? `م${assignTrip.from_zone}`} → {ZONES[assignTrip.to_zone] ?? `م${assignTrip.to_zone}`}
            </p>
            <select value={assignDriver} onChange={e => setAssignDriver(+e.target.value || "")}
              style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, marginBottom: 16 }}>
              <option value="">— اختر سائقاً —</option>
              {approvedDrivers.map(d => <option key={d.id} value={d.id}>{VEHICLE_ICON[d.vehicle_type] ?? "🚗"} {d.name} {d.is_online ? "● متصل" : ""}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAssignTrip(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={assignDriverToTrip} disabled={!assignDriver} style={{ flex: 1.4, padding: "11px", borderRadius: 12, border: "none", background: assignDriver ? `linear-gradient(135deg,${orange},#ea580c)` : "hsl(217 32% 18%)", color: "#fff", cursor: assignDriver ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>تأكيد التعيين</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Driver Note Modal ── */}
      {noteDriver && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setNoteDriver(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 380, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "hsl(210 40% 92%)" }}>📝 ملاحظة إدارية — {noteDriver.name}</h3>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="أكتب ملاحظتك هنا..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setNoteDriver(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={async () => { await setDriverStatus(noteDriver.id, noteDriver.status, noteText); setNoteDriver(null); }}
                style={{ flex: 1.4, padding: "11px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>حفظ الملاحظة</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fare Edit Modal ── */}
      {editFare && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setEditFare(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 26px", width: 360, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "hsl(210 40% 92%)" }}>💰 تعديل التعرفة</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "hsl(215 20% 52%)" }}>
              {ZONES[editFare.from_zone] ?? `م${editFare.from_zone}`} → {ZONES[editFare.to_zone] ?? `م${editFare.to_zone}`}
            </p>
            {([
              { key: "fare_car",      label: "🚗 سيارة (ج.س)" },
              { key: "fare_rickshaw", label: "🛺 ركشة (ج.س)" },
              { key: "fare_delivery", label: "📦 توصيل (ج.س)" },
            ] as const).map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: "hsl(215 20% 55%)", display: "block", marginBottom: 6 }}>{f.label}</label>
                <input type="number" value={editFare[f.key]} onChange={e => setEditFare(prev => prev ? { ...prev, [f.key]: +e.target.value } : null)}
                  style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 88%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setEditFare(null)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
              <button onClick={() => saveFare(editFare)} style={{ flex: 1.4, padding: "11px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${orange},#ea580c)`, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>حفظ التعرفة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
