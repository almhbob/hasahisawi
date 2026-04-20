import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────
type Driver = {
  id: number; name: string; phone: string;
  vehicle_type: string; vehicle_desc?: string; plate?: string;
  area?: string; status: "pending" | "approved" | "rejected";
  admin_note?: string; is_online: boolean;
  rating?: number; total_trips?: number; created_at: string;
  user_name_ref?: string; operator_name?: string; operator_id?: number;
};
type Trip = {
  id: number; user_name: string; user_phone: string;
  from_zone: number; to_zone: number;
  from_detail?: string; to_detail?: string;
  trip_type: string; vehicle_preference?: string; status: string;
  estimated_fare?: number; actual_fare?: number;
  platform_revenue?: number; operator_revenue?: number;
  driver_id?: number; driver_name?: string; driver_phone?: string;
  operator_id?: number; operator_name?: string;
  notes?: string; delivery_desc?: string;
  created_at: string; completed_at?: string;
};
type FareRow = {
  from_zone: number; to_zone: number;
  fare_car: number; fare_rickshaw: number;
  fare_delivery: number; fare_motorcycle: number;
};
type Settings = { transport_status: string; transport_note: string; transport_phone?: string };
type Operator = {
  id: number; name: string; contact_name: string; phone: string; email: string;
  contract_start?: string; contract_end?: string;
  operator_share_pct: number; platform_share_pct: number;
  status: "active" | "suspended" | "terminated";
  notes: string; created_at: string;
  active_drivers?: number; total_trips?: number;
  total_revenue?: number; total_operator_revenue?: number; total_platform_revenue?: number;
};
type Reports = {
  overall: {
    completed_trips: number; cancelled_trips: number; pending_trips: number; active_trips: number;
    total_revenue: number; platform_revenue: number; operator_revenue: number; avg_fare: number;
  };
  byVehicle: { vehicle_preference: string; trips: number; revenue: number }[];
  byOperator: { id: number; name: string; operator_share_pct: number; platform_share_pct: number; trips: number; revenue: number; operator_share: number; platform_share: number }[];
  daily: { day: string; trips: number; revenue: number; platform_revenue: number }[];
  recent: Trip[];
};

// ─── Constants ──────────────────────────────────────────────────────────────
const ZONES: Record<number, string> = { 1: "م١ · وسط المدينة", 2: "م٢ · الشمالية", 3: "م٣ · الجنوبية", 4: "م٤ · الشرقية", 5: "م٥ · الغربية" };
const VEHICLE_ICON: Record<string, string> = { car: "🚗", motorcycle: "🏍️", rickshaw: "🛺", delivery: "📦", tuk_tuk: "🛺", سيارة: "🚗", ركشة: "🛺", دراجة: "🏍️" };
const VEHICLE_AR: Record<string, string> = { car: "سيارة", rickshaw: "ركشة", delivery: "توصيل", motorcycle: "دراجة نارية" };
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "انتظار",    color: "#fbbf24", bg: "rgba(251,191,36,.12)"  },
  active:     { label: "جارية",    color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  in_progress:{ label: "جارية",    color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  completed:  { label: "مكتملة",   color: "#60a5fa", bg: "rgba(96,165,250,.12)"  },
  cancelled:  { label: "ملغاة",    color: "#f87171", bg: "rgba(248,113,113,.12)" },
  approved:   { label: "مقبول",    color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  rejected:   { label: "مرفوض",   color: "#f87171", bg: "rgba(248,113,113,.12)" },
  active_op:  { label: "نشطة",     color: "#34d399", bg: "rgba(52,211,153,.12)"  },
  suspended:  { label: "موقوفة",   color: "#fbbf24", bg: "rgba(251,191,36,.12)"  },
  terminated: { label: "منتهية",   color: "#f87171", bg: "rgba(248,113,113,.12)" },
};
const orange = "#f97316";

function fmt(n: number | undefined | null) {
  if (!n) return "0";
  return n.toLocaleString("ar-EG");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: "#94a3b8", bg: "rgba(148,163,184,.12)" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.color}30`, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}
function KpiCard({ value, label, icon, color = orange, sub }: { value: string | number; label: string; icon: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 16, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 140 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color + "18", border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "hsl(210 40% 95%)", lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
        <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "hsl(210 40% 85%)", display: "flex", alignItems: "center", gap: 8 }}>{children}</h3>;
}
function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>{label}{required && " *"}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Transport() {
  const [tab, setTab] = useState<"overview" | "drivers" | "trips" | "fares" | "operators" | "reports" | "settings">("overview");
  const [overview,   setOverview]   = useState<any>(null);
  const [drivers,    setDrivers]    = useState<Driver[]>([]);
  const [trips,      setTrips]      = useState<Trip[]>([]);
  const [fares,      setFares]      = useState<FareRow[]>([]);
  const [settings,   setSettings]   = useState<Settings>({ transport_status: "available", transport_note: "" });
  const [operators,  setOperators]  = useState<Operator[]>([]);
  const [reports,    setReports]    = useState<Reports | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Filters
  const [driverFilter, setDriverFilter] = useState("all");
  const [tripFilter,   setTripFilter]   = useState("all");
  const [search,       setSearch]       = useState("");

  // Assign trip modal
  const [assignTrip,   setAssignTrip]   = useState<Trip | null>(null);
  const [assignDriver, setAssignDriver] = useState<number | "">("");

  // Complete trip modal
  const [completeTrip, setCompleteTrip] = useState<Trip | null>(null);
  const [actualFare,   setActualFare]   = useState("");

  // Note modal
  const [noteDriver, setNoteDriver] = useState<Driver | null>(null);
  const [noteText,   setNoteText]   = useState("");

  // Inline fare edit
  const [editFare, setEditFare] = useState<FareRow | null>(null);

  // Operator form
  const [showOpForm,   setShowOpForm]   = useState(false);
  const [editOp,       setEditOp]       = useState<Operator | null>(null);
  const [opForm, setOpForm] = useState({ name: "", contact_name: "", phone: "", email: "", contract_start: "", contract_end: "", operator_share_pct: "70", platform_share_pct: "30", notes: "", status: "active" });

  // Supervisor form
  const [showSupForm, setShowSupForm] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", email: "", password: "" });
  const [supMsg, setSupMsg] = useState("");

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, dr, tr, fa, se, ops] = await Promise.all([
        apiJson<any>("/admin/transport/overview"),
        apiJson<Driver[]>("/admin/transport/drivers"),
        apiJson<Trip[]>("/admin/transport/trips"),
        apiJson<any>("/transport/fares"),
        apiJson<Settings>("/admin/transport/settings"),
        apiJson<Operator[]>("/admin/transport/operators"),
      ]);
      setOverview(ov);
      setDrivers(Array.isArray(dr) ? dr : []);
      setTrips(Array.isArray(tr) ? tr : []);
      if (Array.isArray(fa)) {
        setFares(fa);
      } else if (fa && typeof fa === "object") {
        const rows: FareRow[] = [];
        for (const from of Object.keys(fa) as any[]) {
          for (const to of Object.keys((fa as any)[from])) {
            const cell = (fa as any)[from][to];
            rows.push({ from_zone: +from, to_zone: +to, fare_car: cell.car, fare_rickshaw: cell.rickshaw, fare_delivery: cell.delivery, fare_motorcycle: cell.motorcycle ?? 0 });
          }
        }
        setFares(rows);
      }
      if (se && typeof se === "object") {
        setSettings({ transport_status: (se as any).transport_status ?? "available", transport_note: (se as any).transport_note ?? "", transport_phone: (se as any).transport_phone ?? "" });
      }
      setOperators(Array.isArray(ops) ? ops : []);
    } catch {}
    setLoading(false);
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const r = await apiJson<Reports>("/admin/transport/reports");
      setReports(r as Reports);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "reports") loadReports(); }, [tab, loadReports]);

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
    await apiFetch(`/admin/transport/trips/${assignTrip.id}/assign`, { method: "PATCH", body: JSON.stringify({ driver_id: assignDriver, status: "in_progress" }) });
    const drv = drivers.find(d => d.id === +assignDriver);
    setTrips(prev => prev.map(t => t.id === assignTrip.id ? { ...t, driver_id: +assignDriver, driver_name: drv?.name, status: "in_progress" } : t));
    setAssignTrip(null); setAssignDriver("");
  };
  const completeTripAction = async () => {
    if (!completeTrip || !actualFare) return;
    const res = await apiFetch(`/admin/transport/trips/${completeTrip.id}/complete`, { method: "PATCH", body: JSON.stringify({ actual_fare: +actualFare, operator_id: completeTrip.operator_id }) });
    if (res.ok) {
      const data = await res.json();
      setTrips(prev => prev.map(t => t.id === completeTrip.id ? { ...t, status: "completed", actual_fare: data.actual_fare, platform_revenue: data.platform_revenue, operator_revenue: data.operator_revenue } : t));
      setCompleteTrip(null); setActualFare("");
    }
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
  const saveOperator = async () => {
    const body = { ...opForm, operator_share_pct: +opForm.operator_share_pct, platform_share_pct: +opForm.platform_share_pct };
    if (editOp) {
      await apiFetch(`/admin/transport/operators/${editOp.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await apiFetch("/admin/transport/operators", { method: "POST", body: JSON.stringify(body) });
    }
    setShowOpForm(false); setEditOp(null);
    setOpForm({ name: "", contact_name: "", phone: "", email: "", contract_start: "", contract_end: "", operator_share_pct: "70", platform_share_pct: "30", notes: "", status: "active" });
    load();
  };
  const deleteOperator = async (id: number) => {
    if (!confirm("حذف هذه الشركة المشغّلة نهائياً؟")) return;
    await apiFetch(`/admin/transport/operators/${id}`, { method: "DELETE" });
    setOperators(prev => prev.filter(o => o.id !== id));
  };
  const createSupervisor = async () => {
    setSupMsg("");
    const res = await apiFetch("/auth/register-transport-supervisor", { method: "POST", body: JSON.stringify(supForm) });
    if (res.ok) { setSupMsg("✅ تم إنشاء حساب المشرف بنجاح"); setSupForm({ name: "", email: "", password: "" }); setShowSupForm(false); }
    else { const err = await res.json().catch(() => ({})); setSupMsg("❌ " + ((err as any).error ?? "خطأ")); }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const pendingDrivers  = drivers.filter(d => d.status === "pending");
  const approvedDrivers = drivers.filter(d => d.status === "approved");
  const onlineDrivers   = drivers.filter(d => d.is_online && d.status === "approved");
  const pendingTrips    = trips.filter(t => t.status === "pending");
  const activeTrips     = trips.filter(t => t.status === "active" || t.status === "in_progress");
  const totalRevenue    = trips.filter(t => t.status === "completed").reduce((s, t) => s + (t.actual_fare ?? 0), 0);
  const platformRevTotal = trips.filter(t => t.status === "completed").reduce((s, t) => s + (t.platform_revenue ?? 0), 0);

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

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  const TABS: { id: string; label: string; icon: string }[] = [
    { id: "overview",  label: "نظرة عامة",   icon: "📊" },
    { id: "drivers",   label: `السائقون (${drivers.length})`, icon: "🚗" },
    { id: "trips",     label: `الرحلات (${trips.length})`,    icon: "📍" },
    { id: "fares",     label: "التعرفة",      icon: "💰" },
    { id: "operators", label: `الشركات (${operators.length})`, icon: "🏢" },
    { id: "reports",   label: "التقارير",     icon: "📈" },
    { id: "settings",  label: "الإعدادات",    icon: "⚙️" },
  ];

  // ─── Modals ────────────────────────────────────────────────────────────────
  const modalBg: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const modalBox: React.CSSProperties = { background: "hsl(222 47% 11%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 20, padding: "28px 30px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" };

  // ─── Renderers ────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard value={approvedDrivers.length} label="سائق مقبول"       icon="🚗" color={orange} />
        <KpiCard value={onlineDrivers.length}   label="سائق متصل الآن"   icon="🟢" color="#34d399" />
        <KpiCard value={pendingDrivers.length}  label="طلبات انتظار"      icon="⏳" color="#fbbf24" />
        <KpiCard value={pendingTrips.length}    label="رحلة بانتظار سائق" icon="📍" color="#f87171" />
        <KpiCard value={activeTrips.length}     label="رحلة جارية"        icon="🔄" color="#60a5fa" />
        <KpiCard value={fmt(totalRevenue)}      label="إجمالي الإيراد (ج.س)" icon="💵" color="#a78bfa" sub={`المنصة: ${fmt(platformRevTotal)}`} />
        <KpiCard value={operators.filter(o => o.status === "active").length} label="شركة مشغّلة نشطة" icon="🏢" color="#34d399" />
      </div>

      <div style={{ background: settings.transport_status === "available" ? "rgba(52,211,153,.08)" : "rgba(251,191,36,.08)", border: `1px solid ${settings.transport_status === "available" ? "rgba(52,211,153,.3)" : "rgba(251,191,36,.3)"}`, borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
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
                    {t.vehicle_preference ? ` · ${VEHICLE_AR[t.vehicle_preference] ?? t.vehicle_preference}` : ""}
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
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr 1.6fr", padding: "11px 18px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)" }}>
          <span>السائق</span><span>الهاتف · اللوحة</span><span>المنطقة</span><span>الشركة المشغّلة</span><span>الحالة</span><span>الإجراءات</span>
        </div>
        {filteredDrivers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>لا يوجد سائقون</div>
        ) : filteredDrivers.map(d => (
          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 0.8fr 1.6fr", padding: "13px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
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
            <div style={{ fontSize: 12, color: "hsl(215 20% 58%)" }}><div>{d.phone}</div>{d.plate && <div style={{ marginTop: 2 }}>{d.plate}</div>}</div>
            <span style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{d.area || "—"}</span>
            <span style={{ fontSize: 12, color: d.operator_name ? "hsl(210 40% 75%)" : "hsl(215 20% 38%)" }}>{d.operator_name ?? "—"}</span>
            <Badge status={d.status} />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {d.status !== "approved" && <button onClick={() => setDriverStatus(d.id, "approved")} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>قبول</button>}
              {d.status !== "rejected" && <button onClick={() => setDriverStatus(d.id, "rejected")} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>رفض</button>}
              <button onClick={() => { setNoteDriver(d); setNoteText(d.admin_note || ""); }} style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>ملاحظة</button>
              <button onClick={() => deleteDriver(d.id)} style={{ padding: "5px 9px", borderRadius: 8, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>🗑</button>
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
          {(["all", "pending", "active", "in_progress", "completed", "cancelled"] as const).map(f => {
            const cnt = f === "all" ? trips.length : trips.filter(t => t.status === f).length;
            const labels: Record<string, string> = { all: "الكل", pending: "انتظار", active: "جارية", in_progress: "في الطريق", completed: "مكتملة", cancelled: "ملغاة" };
            if (cnt === 0 && f !== "all" && f !== "pending" && f !== "completed") return null;
            return (
              <button key={f} onClick={() => setTripFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", borderColor: tripFilter === f ? (STATUS_META[f]?.color ?? orange) + "60" : "hsl(217 32% 17%)", background: tripFilter === f ? (STATUS_META[f]?.color ?? orange) + "15" : "transparent", color: tripFilter === f ? (STATUS_META[f]?.color ?? orange) : "hsl(215 20% 55%)" }}>
                {labels[f]} {cnt > 0 && <span style={{ opacity: 0.75 }}>({cnt})</span>}
              </button>
            );
          })}
        </div>
        <input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, width: 220 }} />
      </div>

      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.8fr 1fr 1.2fr 1.6fr", padding: "11px 18px", borderBottom: "1px solid hsl(217 32% 14%)", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)" }}>
          <span>العميل</span><span>المسار</span><span>النوع · الأجرة</span><span>الحالة · السائق</span><span>الإجراءات</span>
        </div>
        {filteredTrips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>لا توجد رحلات</div>
        ) : filteredTrips.map(t => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1.8fr 1fr 1.2fr 1.6fr", padding: "13px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{t.user_name}</div>
              <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginTop: 2 }}>{t.user_phone}</div>
              {t.operator_name && <div style={{ fontSize: 10, color: "#60a5fa", marginTop: 2 }}>🏢 {t.operator_name}</div>}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "hsl(210 40% 80%)" }}>{ZONES[t.from_zone] ?? `م${t.from_zone}`} <span style={{ color: orange }}>→</span> {ZONES[t.to_zone] ?? `م${t.to_zone}`}</div>
              {(t.from_detail || t.to_detail) && <div style={{ fontSize: 11, color: "hsl(215 20% 48%)", marginTop: 2 }}>{t.from_detail} {t.to_detail ? `→ ${t.to_detail}` : ""}</div>}
              <div style={{ fontSize: 10, color: "hsl(215 20% 40%)", marginTop: 2 }}>{new Date(t.created_at).toLocaleString("ar-SA")}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "hsl(210 40% 75%)" }}>
                {VEHICLE_ICON[t.vehicle_preference ?? t.trip_type] ?? ""} {VEHICLE_AR[t.vehicle_preference ?? t.trip_type] ?? t.trip_type}
              </div>
              {t.estimated_fare ? <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 2, fontWeight: 700 }}>تقدير: {t.estimated_fare} ج.س</div> : null}
              {t.actual_fare ? <div style={{ fontSize: 12, color: "#34d399", marginTop: 2, fontWeight: 700 }}>فعلي: {t.actual_fare} ج.س</div> : null}
            </div>
            <div>
              <Badge status={t.status} />
              {t.driver_name && <div style={{ fontSize: 11, color: "hsl(215 20% 52%)", marginTop: 4 }}>🚗 {t.driver_name}</div>}
              {t.actual_fare && (
                <div style={{ fontSize: 10, color: "hsl(215 20% 42%)", marginTop: 3 }}>
                  منصة: {fmt(t.platform_revenue)} · مشغّل: {fmt(t.operator_revenue)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {t.status === "pending" && (
                <button onClick={() => setAssignTrip(t)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${orange}50`, background: `${orange}12`, color: orange, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>📡 تعيين</button>
              )}
              {(t.status === "in_progress" || t.status === "active") && (
                <button onClick={() => { setCompleteTrip(t); setActualFare(String(t.estimated_fare ?? "")); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}>✓ إتمام</button>
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
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "hsl(215 20% 52%)" }}>اضغط على أي خلية لتعديل التعرفة — الأسعار بالجنيه السوداني</p>
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
                        <div style={{ fontSize: 10, color: "hsl(215 20% 48%)", marginTop: 2 }}>ر:{fare.fare_rickshaw} · ت:{fare.fare_delivery} · د:{fare.fare_motorcycle}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "hsl(215 20% 45%)" }}>
          الصف الأول: سيارة · ر: ركشة · ت: توصيل · د: دراجة نارية 🏍️
        </div>
      </div>
    );
  };

  const renderOperators = () => (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "hsl(210 40% 90%)" }}>🏢 الشركات المشغّلة</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "hsl(215 20% 50%)" }}>إدارة شركاء التشغيل وتوزيع الأرباح</p>
        </div>
        <button onClick={() => { setEditOp(null); setOpForm({ name: "", contact_name: "", phone: "", email: "", contract_start: "", contract_end: "", operator_share_pct: "70", platform_share_pct: "30", notes: "", status: "active" }); setShowOpForm(true); }}
          style={{ padding: "9px 20px", borderRadius: 12, border: `1px solid ${orange}50`, background: orange + "15", color: orange, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
          + إضافة شركة
        </button>
      </div>

      {operators.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          لا توجد شركات مشغّلة بعد — أضف الشركة الأولى لبدء الشراكة
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {operators.map(op => (
            <div key={op.id} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "#60a5fa18", border: "1px solid #60a5fa30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🏢</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 92%)" }}>{op.name}</div>
                    <Badge status={op.status} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10 }}>
                  {op.contact_name && <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>👤 {op.contact_name}</div>}
                  {op.phone && <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>📞 {op.phone}</div>}
                  {op.email && <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>✉️ {op.email}</div>}
                </div>
                {op.contract_start && <div style={{ fontSize: 11, color: "hsl(215 20% 42%)", marginTop: 6 }}>📅 {op.contract_start} — {op.contract_end ?? "مستمر"}</div>}
                {op.notes && <div style={{ fontSize: 12, color: "hsl(215 20% 48%)", marginTop: 6, fontStyle: "italic" }}>{op.notes}</div>}
              </div>
              <div style={{ display: "flex", flex: 1, gap: 10, minWidth: 220, flexWrap: "wrap" }}>
                <div style={{ background: "hsl(222 47% 13%)", borderRadius: 12, padding: "12px 16px", flex: 1, minWidth: 100 }}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 48%)" }}>نسبة المشغّل</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24" }}>{op.operator_share_pct}%</div>
                </div>
                <div style={{ background: "hsl(222 47% 13%)", borderRadius: 12, padding: "12px 16px", flex: 1, minWidth: 100 }}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 48%)" }}>نسبة المنصة</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{op.platform_share_pct}%</div>
                </div>
                <div style={{ background: "hsl(222 47% 13%)", borderRadius: 12, padding: "12px 16px", flex: 1, minWidth: 100 }}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 48%)" }}>رحلات مكتملة</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa" }}>{op.total_trips ?? 0}</div>
                </div>
                <div style={{ background: "hsl(222 47% 13%)", borderRadius: 12, padding: "12px 16px", flex: 1, minWidth: 100 }}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 48%)" }}>إيراد المشغّل</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa" }}>{fmt(op.total_operator_revenue)} ج.س</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => { setEditOp(op); setOpForm({ name: op.name, contact_name: op.contact_name, phone: op.phone, email: op.email, contract_start: op.contract_start ?? "", contract_end: op.contract_end ?? "", operator_share_pct: String(op.operator_share_pct), platform_share_pct: String(op.platform_share_pct), notes: op.notes, status: op.status }); setShowOpForm(true); }}
                  style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${orange}40`, background: `${orange}10`, color: orange, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>✏️ تعديل</button>
                <button onClick={() => deleteOperator(op.id)}
                  style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(248,113,113,.25)", background: "rgba(248,113,113,.07)", color: "#f87171", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderReports = () => {
    if (!reports) return <div style={{ textAlign: "center", padding: "60px 0", color: "hsl(215 20% 45%)" }}>جارٍ تحميل التقارير…</div>;
    const o = reports.overall;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* KPIs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KpiCard value={o.completed_trips} label="رحلة مكتملة" icon="✅" color="#34d399" />
          <KpiCard value={fmt(o.total_revenue)} label="إجمالي الإيراد (ج.س)" icon="💵" color={orange} />
          <KpiCard value={fmt(o.platform_revenue)} label="نصيب المنصة (ج.س)" icon="🏦" color="#60a5fa" />
          <KpiCard value={fmt(o.operator_revenue)} label="نصيب المشغّلين (ج.س)" icon="🏢" color="#a78bfa" />
          <KpiCard value={fmt(o.avg_fare)} label="متوسط الأجرة (ج.س)" icon="📊" color="#fbbf24" />
          <KpiCard value={o.pending_trips} label="رحلة منتظِرة" icon="⏳" color="#f87171" />
        </div>

        {/* By Vehicle */}
        <div>
          <SectionTitle>🚗 الرحلات حسب نوع المركبة</SectionTitle>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {reports.byVehicle.map(v => (
              <div key={v.vehicle_preference} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 15%)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 28 }}>{VEHICLE_ICON[v.vehicle_preference] ?? "🚗"}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "hsl(210 40% 90%)" }}>{v.trips}</div>
                  <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>{VEHICLE_AR[v.vehicle_preference] ?? v.vehicle_preference}</div>
                  <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginTop: 2 }}>{fmt(v.revenue)} ج.س</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Operator */}
        {reports.byOperator.length > 0 && (
          <div>
            <SectionTitle>🏢 الأرباح حسب الشركة المشغّلة</SectionTitle>
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)", borderBottom: "1px solid hsl(217 32% 14%)" }}>
                <span>الشركة</span><span>الرحلات</span><span>إجمالي الإيراد</span><span>نسبة المشغّل</span><span>نصيب المشغّل</span><span>نصيب المنصة</span>
              </div>
              {reports.byOperator.map(op => (
                <div key={op.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", padding: "12px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{op.name}</div>
                  <div style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700 }}>{op.trips}</div>
                  <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>{fmt(op.revenue)} ج.س</div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>{op.operator_share_pct}%</div>
                  <div style={{ fontSize: 13, color: "#a78bfa", fontWeight: 700 }}>{fmt(op.operator_share)} ج.س</div>
                  <div style={{ fontSize: 13, color: "#34d399", fontWeight: 700 }}>{fmt(op.platform_share)} ج.س</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily Trend (last 30 days) */}
        {reports.daily.length > 0 && (
          <div>
            <SectionTitle>📅 الأداء اليومي (آخر ٣٠ يوماً)</SectionTitle>
            <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 18px", fontSize: 11, fontWeight: 700, color: "hsl(215 20% 42%)", background: "hsl(222 47% 9%)", borderBottom: "1px solid hsl(217 32% 14%)" }}>
                <span>اليوم</span><span>الرحلات</span><span>الإيراد (ج.س)</span><span>نصيب المنصة</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {reports.daily.map((d, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", padding: "10px 18px", alignItems: "center", borderBottom: "1px solid hsl(217 32% 12%)" }}>
                    <span style={{ fontSize: 12, color: "hsl(210 40% 75%)" }}>{new Date(d.day).toLocaleDateString("ar-EG", { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span style={{ fontSize: 13, color: "#60a5fa", fontWeight: 700 }}>{d.trips}</span>
                    <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>{fmt(d.revenue)}</span>
                    <span style={{ fontSize: 13, color: "#34d399", fontWeight: 700 }}>{fmt(d.platform_revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent completed trips */}
        {reports.recent.length > 0 && (
          <div>
            <SectionTitle>🕐 آخر الرحلات المكتملة</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.recent.slice(0, 10).map(t => (
                <div key={t.id} style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 14, padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 90%)" }}>{t.user_name}</div>
                    <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginTop: 2 }}>
                      {ZONES[t.from_zone] ?? `م${t.from_zone}`} → {ZONES[t.to_zone] ?? `م${t.to_zone}`}
                      {t.vehicle_preference ? ` · ${VEHICLE_AR[t.vehicle_preference] ?? t.vehicle_preference}` : ""}
                    </div>
                    {t.operator_name && <div style={{ fontSize: 10, color: "#60a5fa", marginTop: 2 }}>🏢 {t.operator_name}</div>}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24" }}>{fmt(t.actual_fare)} ج.س</div>
                    <div style={{ fontSize: 10, color: "hsl(215 20% 45%)" }}>منصة: {fmt(t.platform_revenue)} · مشغّل: {fmt(t.operator_revenue)}</div>
                  </div>
                  {t.completed_at && <div style={{ fontSize: 11, color: "hsl(215 20% 45%)" }}>{new Date(t.completed_at).toLocaleString("ar-SA")}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Service Status */}
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 15%)", padding: "22px 24px", maxWidth: 560 }}>
        <SectionTitle>⚙️ حالة الخدمة</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { value: "available",    label: "متاحة ✅",      desc: "التطبيق يقبل الطلبات" },
            { value: "maintenance",  label: "صيانة 🔧",      desc: "الخدمة متوقفة مؤقتاً" },
            { value: "coming_soon",  label: "قادمة 🕐",      desc: "عرض شاشة قريباً" },
          ] as const).map(opt => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 12, border: `1px solid ${settings.transport_status === opt.value ? `${orange}60` : "hsl(217 32% 16%)"}`, background: settings.transport_status === opt.value ? `${orange}08` : "transparent", cursor: "pointer" }}>
              <input type="radio" name="status" value={opt.value} checked={settings.transport_status === opt.value} onChange={() => setSettings(s => ({ ...s, transport_status: opt.value }))} style={{ accentColor: orange }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "hsl(210 40% 88%)" }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: "hsl(215 20% 50%)", marginTop: 2 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>ملاحظة تظهر للمستخدمين</label>
          <textarea value={settings.transport_note} onChange={e => setSettings(s => ({ ...s, transport_note: e.target.value }))} rows={2}
            placeholder="اكتب ملاحظة للمستخدمين (اختياري)..."
            style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
        </div>
        <button onClick={saveSettings} disabled={saving}
          style={{ marginTop: 18, padding: "11px 28px", borderRadius: 12, border: "none", background: saving ? "hsl(215 20% 25%)" : orange, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
          {saving ? "جارٍ الحفظ…" : "💾 حفظ الإعدادات"}
        </button>
      </div>

      {/* Supervisor management */}
      <div style={{ background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 15%)", padding: "22px 24px", maxWidth: 560 }}>
        <SectionTitle>👮 مشرفو الترحيل</SectionTitle>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "hsl(215 20% 52%)" }}>
          مشرفو الترحيل لهم صلاحيات إدارة كاملة لخدمة المشاوير: قبول السائقين، متابعة الرحلات، إدارة الشركات والتعرفة — بدون دخول لباقي لوحة الإدارة.
        </p>
        {supMsg && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: supMsg.startsWith("✅") ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)", color: supMsg.startsWith("✅") ? "#34d399" : "#f87171", fontSize: 13 }}>{supMsg}</div>}
        {!showSupForm ? (
          <button onClick={() => { setShowSupForm(true); setSupMsg(""); }} style={{ padding: "9px 20px", borderRadius: 12, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ إضافة مشرف ترحيل</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label="الاسم" value={supForm.name} onChange={v => setSupForm(s => ({ ...s, name: v }))} required />
            <Input label="البريد الإلكتروني" value={supForm.email} onChange={v => setSupForm(s => ({ ...s, email: v }))} type="email" required />
            <Input label="كلمة المرور" value={supForm.password} onChange={v => setSupForm(s => ({ ...s, password: v }))} type="password" required />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={createSupervisor} style={{ padding: "9px 20px", borderRadius: 12, border: "none", background: "#34d399", color: "#000", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>✓ إنشاء الحساب</button>
              <button onClick={() => setShowSupForm(false)} style={{ padding: "9px 16px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────
  if (loading) return <div style={{ textAlign: "center", padding: "80px 0", color: "hsl(215 20% 45%)", fontSize: 14 }}>⏳ جارٍ التحميل…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "hsl(210 40% 95%)" }}>🚖 مشاويرك علينا</h2>
        <p style={{ margin: 0, fontSize: 13, color: "hsl(215 20% 50%)" }}>إدارة خدمة الترحيل · السائقون · الرحلات · الشركات المشغّلة · التقارير</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap", borderBottom: "1px solid hsl(217 32% 14%)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setSearch(""); setTab(t.id as any); }}
            style={{ padding: "10px 16px", border: "none", borderBottom: tab === t.id ? `2px solid ${orange}` : "2px solid transparent", background: "transparent", color: tab === t.id ? orange : "hsl(215 20% 52%)", fontFamily: "inherit", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", transition: "all .15s", marginBottom: -1, whiteSpace: "nowrap" }}>
            {t.icon} {t.label}
          </button>
        ))}
        <button onClick={load} style={{ marginRight: "auto", padding: "8px 14px", border: "1px solid hsl(217 32% 18%)", borderRadius: 10, background: "transparent", color: "hsl(215 20% 50%)", fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}>🔄 تحديث</button>
      </div>

      {/* Tab Content */}
      {tab === "overview"  && renderOverview()}
      {tab === "drivers"   && renderDrivers()}
      {tab === "trips"     && renderTrips()}
      {tab === "fares"     && renderFares()}
      {tab === "operators" && renderOperators()}
      {tab === "reports"   && renderReports()}
      {tab === "settings"  && renderSettings()}

      {/* ── Assign Trip Modal ── */}
      {assignTrip && (
        <div style={modalBg} onClick={() => setAssignTrip(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 90%)" }}>📡 تعيين سائق للرحلة #{assignTrip.id}</h3>
            <div style={{ marginBottom: 14, fontSize: 13, color: "hsl(215 20% 55%)" }}>
              {ZONES[assignTrip.from_zone] ?? `م${assignTrip.from_zone}`} → {ZONES[assignTrip.to_zone] ?? `م${assignTrip.to_zone}`}
              {assignTrip.estimated_fare ? ` · ${assignTrip.estimated_fare} ج.س` : ""}
            </div>
            <select value={assignDriver} onChange={e => setAssignDriver(e.target.value === "" ? "" : +e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, marginBottom: 18 }}>
              <option value="">— اختر سائقاً —</option>
              {approvedDrivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({VEHICLE_AR[d.vehicle_type] ?? d.vehicle_type}){d.is_online ? " ● متصل" : ""}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={assignDriverToTrip} disabled={!assignDriver}
                style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: assignDriver ? orange : "hsl(215 20% 20%)", color: assignDriver ? "#fff" : "hsl(215 20% 40%)", cursor: assignDriver ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                ✓ تعيين السائق
              </button>
              <button onClick={() => setAssignTrip(null)}
                style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete Trip Modal ── */}
      {completeTrip && (
        <div style={modalBg} onClick={() => setCompleteTrip(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 90%)" }}>✅ إتمام الرحلة #{completeTrip.id}</h3>
            <div style={{ marginBottom: 14, fontSize: 13, color: "hsl(215 20% 55%)" }}>
              {ZONES[completeTrip.from_zone] ?? `م${completeTrip.from_zone}`} → {ZONES[completeTrip.to_zone] ?? `م${completeTrip.to_zone}`}
              {completeTrip.driver_name ? ` · 🚗 ${completeTrip.driver_name}` : ""}
              {completeTrip.operator_name ? ` · 🏢 ${completeTrip.operator_name}` : ""}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>الأجرة الفعلية المحصّلة (ج.س) *</label>
              <input type="number" value={actualFare} onChange={e => setActualFare(e.target.value)} placeholder="أدخل الأجرة..."
                style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            {actualFare && completeTrip.operator_name && (
              <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 12, background: "hsl(222 47% 13%)", border: "1px solid hsl(217 32% 18%)" }}>
                <div style={{ fontSize: 12, color: "hsl(215 20% 52%)", marginBottom: 6 }}>توزيع الأرباح:</div>
                <div style={{ fontSize: 13, color: "#a78bfa" }}>🏢 المشغّل: {Math.round(+actualFare * (operators.find(o => o.id === completeTrip.operator_id)?.operator_share_pct ?? 70) / 100)} ج.س</div>
                <div style={{ fontSize: 13, color: "#34d399", marginTop: 4 }}>🏦 المنصة: {Math.round(+actualFare * (operators.find(o => o.id === completeTrip.operator_id)?.platform_share_pct ?? 30) / 100)} ج.س</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={completeTripAction} disabled={!actualFare}
                style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: actualFare ? "#34d399" : "hsl(215 20% 20%)", color: actualFare ? "#000" : "hsl(215 20% 40%)", cursor: actualFare ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>
                ✓ تأكيد الإتمام
              </button>
              <button onClick={() => setCompleteTrip(null)}
                style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note Modal ── */}
      {noteDriver && (
        <div style={modalBg} onClick={() => setNoteDriver(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "hsl(210 40% 90%)" }}>ملاحظة — {noteDriver.name}</h3>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="اكتب ملاحظتك هنا..."
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={() => { setDriverStatus(noteDriver.id, noteDriver.status, noteText); setNoteDriver(null); }} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", background: orange, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>حفظ</button>
              <button onClick={() => setNoteDriver(null)} style={{ padding: "10px 18px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fare Edit Modal ── */}
      {editFare && (
        <div style={modalBg} onClick={() => setEditFare(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 700, color: "hsl(210 40% 90%)" }}>✏️ تعرفة م{editFare.from_zone} → م{editFare.to_zone}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>🚗 سيارة (ج.س)</label>
                <input type="number" value={editFare.fare_car} onChange={e => setEditFare(f => f ? { ...f, fare_car: +e.target.value } : f)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>🛺 ركشة (ج.س)</label>
                <input type="number" value={editFare.fare_rickshaw} onChange={e => setEditFare(f => f ? { ...f, fare_rickshaw: +e.target.value } : f)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>📦 توصيل (ج.س)</label>
                <input type="number" value={editFare.fare_delivery} onChange={e => setEditFare(f => f ? { ...f, fare_delivery: +e.target.value } : f)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>🏍️ دراجة نارية (ج.س)</label>
                <input type="number" value={editFare.fare_motorcycle} onChange={e => setEditFare(f => f ? { ...f, fare_motorcycle: +e.target.value } : f)}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => saveFare(editFare)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: orange, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>💾 حفظ التعرفة</button>
              <button onClick={() => setEditFare(null)} style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Operator Form Modal ── */}
      {showOpForm && (
        <div style={modalBg} onClick={() => setShowOpForm(false)}>
          <div style={{ ...modalBox, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "hsl(210 40% 90%)" }}>
              {editOp ? `✏️ تعديل: ${editOp.name}` : "🏢 إضافة شركة مشغّلة جديدة"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="اسم الشركة" value={opForm.name} onChange={v => setOpForm(s => ({ ...s, name: v }))} required />
              <Input label="اسم المسؤول" value={opForm.contact_name} onChange={v => setOpForm(s => ({ ...s, contact_name: v }))} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="الهاتف" value={opForm.phone} onChange={v => setOpForm(s => ({ ...s, phone: v }))} />
                <Input label="البريد الإلكتروني" value={opForm.email} onChange={v => setOpForm(s => ({ ...s, email: v }))} type="email" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Input label="بداية العقد" value={opForm.contract_start} onChange={v => setOpForm(s => ({ ...s, contract_start: v }))} type="date" />
                <Input label="نهاية العقد" value={opForm.contract_end} onChange={v => setOpForm(s => ({ ...s, contract_end: v }))} type="date" />
              </div>
              <div style={{ background: "hsl(222 47% 13%)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)", marginBottom: 12 }}>توزيع الأرباح (المجموع = 100%)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700 }}>نسبة المشغّل %</label>
                    <input type="number" min={0} max={100} value={opForm.operator_share_pct}
                      onChange={e => { const v = e.target.value; setOpForm(s => ({ ...s, operator_share_pct: v, platform_share_pct: String(100 - +v) })); }}
                      style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#34d399", fontWeight: 700 }}>نسبة المنصة %</label>
                    <input type="number" min={0} max={100} value={opForm.platform_share_pct}
                      onChange={e => { const v = e.target.value; setOpForm(s => ({ ...s, platform_share_pct: v, operator_share_pct: String(100 - +v) })); }}
                      style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                </div>
                {Math.abs(+opForm.operator_share_pct + +opForm.platform_share_pct - 100) > 0.01 && (
                  <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>⚠️ المجموع = {+opForm.operator_share_pct + +opForm.platform_share_pct}% (يجب أن يساوي 100%)</div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>ملاحظات</label>
                <textarea value={opForm.notes} onChange={e => setOpForm(s => ({ ...s, notes: e.target.value }))} rows={2}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
              </div>
              {editOp && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 55%)" }}>حالة الشركة</label>
                  <select value={opForm.status} onChange={e => setOpForm(s => ({ ...s, status: e.target.value }))}
                    style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 9%)", color: "hsl(210 40% 90%)", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}>
                    <option value="active">نشطة</option>
                    <option value="suspended">موقوفة</option>
                    <option value="terminated">منتهية العقد</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={saveOperator}
                disabled={!opForm.name || Math.abs(+opForm.operator_share_pct + +opForm.platform_share_pct - 100) > 0.01}
                style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: orange, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, opacity: !opForm.name ? 0.5 : 1 }}>
                {editOp ? "💾 تحديث الشركة" : "✓ إضافة الشركة"}
              </button>
              <button onClick={() => setShowOpForm(false)}
                style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
