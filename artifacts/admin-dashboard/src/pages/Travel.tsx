import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/ConfirmDialog";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
type Company = {
  id: number; name: string; owner_name: string; phone: string; wa_number: string;
  commission_pct: number; subscription_type: string; subscription_price: number;
  license_no: string; active: boolean; notes: string; contract_signed_at: string;
  payment_account_type: string; payment_account_number: string;
  payment_account_name: string; payment_booking_timeout_hrs: number;
};
type Route = {
  id: number; company_id: number; company_name: string;
  from_city: string; to_city: string; departure_time: string;
  price: number; seats_total: number; active: boolean;
  peak_price_multiplier: number; peak_hours_start: string; peak_hours_end: string; notes: string;
};
type Booking = {
  id: number; company_name: string; from_city: string; to_city: string;
  travel_date: string; departure_time: string; passenger_name: string;
  passenger_phone: string; seat_number: string; price: number;
  status: string; payment_status: string; ticket_number: string;
  booking_ref: string; payment_proof_url: string; payment_ref: string;
  payment_verified_by: string; payment_verified_at: string;
  payment_rejection_reason: string; user_display: string; created_at: string;
};
type Stats = {
  total: number; confirmed: number; pending: number; cancelled: number;
  revenue: number; active_companies: number; active_routes: number;
  daily: { day: string; bookings: number; revenue: number }[];
  topRoutes: { from_city: string; to_city: string; bookings: number; revenue: number }[];
};
type Settings = {
  travel_enabled: string; travel_payment_timeout_hrs: string; travel_admin_whatsapp: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────
const BG     = "hsl(222 47% 8%)";
const CARD   = "hsl(222 47% 11%)";
const BORDER = "hsl(217 32% 18%)";
const TEXT   = "hsl(210 40% 92%)";
const MUTED  = "hsl(215 20% 50%)";
const BLUE   = "#0ea5e9";
const GREEN  = "#22c55e";
const ORANGE = "#f97316";
const RED    = "#ef4444";
const GOLD   = "#f59e0b";

const PAYMENT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment:  { label: "في انتظار الدفع",   color: GOLD,   bg: GOLD   + "18" },
  proof_submitted:  { label: "إيصال مُرفق",         color: BLUE,   bg: BLUE   + "18" },
  verified:         { label: "مدفوع ✓",             color: GREEN,  bg: GREEN  + "18" },
  rejected:         { label: "مرفوض ✗",             color: RED,    bg: RED    + "18" },
  free:             { label: "بلا دفع",              color: MUTED,  bg: MUTED  + "18" },
};
const BOOKING_STATUS: Record<string, { label: string; color: string }> = {
  confirmed:   { label: "مؤكدة",    color: GREEN  },
  cancelled:   { label: "ملغاة",    color: RED    },
  completed:   { label: "مكتملة",   color: BLUE   },
  rescheduled: { label: "مُأجَّلة", color: ORANGE },
};
const ACCOUNT_TYPES = ["بنك السودان","فلوس موبايل","زين كاش","MTN موبايل موني","صالح موبايل","حوالة أخرى"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | string | undefined | null) {
  const v = Number(n || 0);
  return v.toLocaleString("ar-EG");
}
function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-EG", { year:"numeric", month:"short", day:"numeric" });
}

function Badge({ status, map }: { status: string; map: Record<string, { label: string; color: string; bg?: string }> }) {
  const m = map[status] ?? { label: status, color: MUTED, bg: MUTED + "18" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: m.color, background: m.bg ?? m.color + "18", border: `1px solid ${m.color}30`, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}
function KpiCard({ value, label, icon, color = BLUE, sub }: { value: string | number; label: string; icon: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "20px 22px",
      display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 150 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color + "18", border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: TEXT, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}
function Inp({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "hsl(222 47% 9%)", color: TEXT, fontFamily: "inherit", fontSize: 13, width: "100%", boxSizing: "border-box" as const }} />
    </div>
  );
}
function Sel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`,
          background: "hsl(222 47% 9%)", color: TEXT, fontFamily: "inherit", fontSize: 13 }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#00000088", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding: 20 }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 28,
        width: "100%", maxWidth: wide ? 720 : 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 20 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:TEXT }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:MUTED, fontSize:22, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Grid({ cols = 2, gap = 14, children }: { cols?: number; gap?: number; children: React.ReactNode }) {
  return <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap }}>{children}</div>;
}
function SaveBtn({ onClick, loading, label = "حفظ" }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ padding:"10px 28px", borderRadius:10, background:BLUE, color:"#fff", border:"none",
        fontWeight:700, fontSize:13, cursor:"pointer", opacity: loading ? 0.6 : 1 }}>
      {loading ? "جاري الحفظ..." : label}
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TravelAdmin() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<"overview"|"companies"|"routes"|"bookings"|"settings">("overview");
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [routes,    setRoutes]    = useState<Route[]>([]);
  const [bookings,  setBookings]  = useState<Booking[]>([]);
  const [settings,  setSettings]  = useState<Settings>({ travel_enabled:"true", travel_payment_timeout_hrs:"3", travel_admin_whatsapp:"" });
  const [loading,   setLoading]   = useState(false);
  const [bFilter,   setBFilter]   = useState("all");
  const [bSearch,   setBSearch]   = useState("");

  // Modals
  const [editCompany,      setEditCompany]      = useState<Company | null>(null);
  const [editRoute,        setEditRoute]        = useState<Route | null>(null);
  const [viewBooking,      setViewBooking]      = useState<Booking | null>(null);
  const [addCompanyOpen,   setAddCompanyOpen]   = useState(false);
  const [addRouteOpen,     setAddRouteOpen]     = useState(false);
  const [paymentAccModal,  setPaymentAccModal]  = useState<Company | null>(null);
  const [rejectReason,     setRejectReason]     = useState("");

  // New Company form
  const [nc, setNc] = useState({ name:"", owner_name:"", phone:"", wa_number:"",
    commission_pct:"10", subscription_type:"commission", subscription_price:"0", license_no:"", notes:"" });
  // New Route form
  const [nr, setNr] = useState({ company_id:"", from_city:"", to_city:"", departure_time:"08:00",
    price:"", seats_total:"30", peak_price_multiplier:"1.0", peak_hours_start:"", peak_hours_end:"", notes:"" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, r, b, st] = await Promise.all([
        apiJson<Stats>("/admin/travel/stats"),
        apiJson<Company[]>("/admin/travel/companies"),
        apiJson<Route[]>("/admin/travel/routes"),
        apiJson<Booking[]>("/admin/travel/bookings"),
        apiJson<Settings>("/admin/travel/settings"),
      ]);
      setStats(s); setCompanies(c); setRoutes(r); setBookings(b);
      if (st) setSettings(s => ({ ...s, ...st }));
    } catch { toast.error("تعذّر تحميل البيانات"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Company actions ──────────────────────────────────────────
  async function saveCompany() {
    if (!nc.name.trim()) { toast.error("اسم الشركة مطلوب"); return; }
    try {
      await apiFetch("/admin/travel/companies", {
        method:"POST", body: JSON.stringify({ ...nc, commission_pct: Number(nc.commission_pct), subscription_price: Number(nc.subscription_price) }),
      });
      toast.success("تمت إضافة الشركة"); setAddCompanyOpen(false);
      setNc({ name:"", owner_name:"", phone:"", wa_number:"", commission_pct:"10", subscription_type:"commission", subscription_price:"0", license_no:"", notes:"" });
      loadAll();
    } catch { toast.error("تعذّر الإضافة"); }
  }
  async function updateCompany() {
    if (!editCompany) return;
    try {
      await apiFetch(`/admin/travel/companies/${editCompany.id}`, {
        method:"PATCH", body: JSON.stringify(editCompany),
      });
      toast.success("تم التحديث"); setEditCompany(null); loadAll();
    } catch { toast.error("تعذّر التحديث"); }
  }
  async function toggleCompany(c: Company) {
    const ok = await confirm(`${c.active ? "إلغاء تفعيل" : "تفعيل"} شركة "${c.name}"؟`);
    if (!ok) return;
    await apiFetch(`/admin/travel/companies/${c.id}`, { method:"PATCH", body: JSON.stringify({ active: !c.active }) });
    loadAll();
  }
  async function savePaymentAccount() {
    if (!paymentAccModal) return;
    try {
      await apiFetch(`/admin/travel/companies/${paymentAccModal.id}/payment-account`, {
        method:"PATCH", body: JSON.stringify({
          payment_account_type: paymentAccModal.payment_account_type,
          payment_account_number: paymentAccModal.payment_account_number,
          payment_account_name: paymentAccModal.payment_account_name,
          payment_booking_timeout_hrs: Number(paymentAccModal.payment_booking_timeout_hrs),
        }),
      });
      toast.success("تم حفظ حساب الدفع"); setPaymentAccModal(null); loadAll();
    } catch { toast.error("تعذّر الحفظ"); }
  }

  // ── Route actions ────────────────────────────────────────────
  async function saveRoute() {
    if (!nr.company_id || !nr.from_city || !nr.to_city || !nr.price) {
      toast.error("بيانات ناقصة"); return;
    }
    try {
      await apiFetch("/admin/travel/routes", {
        method:"POST", body: JSON.stringify({ ...nr, price: Number(nr.price), seats_total: Number(nr.seats_total), company_id: Number(nr.company_id), peak_price_multiplier: Number(nr.peak_price_multiplier) }),
      });
      toast.success("تمت إضافة الخط"); setAddRouteOpen(false);
      setNr({ company_id:"", from_city:"", to_city:"", departure_time:"08:00", price:"", seats_total:"30", peak_price_multiplier:"1.0", peak_hours_start:"", peak_hours_end:"", notes:"" });
      loadAll();
    } catch { toast.error("تعذّر الإضافة"); }
  }
  async function updateRoute() {
    if (!editRoute) return;
    try {
      await apiFetch(`/admin/travel/routes/${editRoute.id}`, {
        method:"PATCH", body: JSON.stringify({ ...editRoute, price: Number(editRoute.price), seats_total: Number(editRoute.seats_total), peak_price_multiplier: Number(editRoute.peak_price_multiplier) }),
      });
      toast.success("تم التحديث"); setEditRoute(null); loadAll();
    } catch { toast.error("تعذّر التحديث"); }
  }
  async function deleteRoute(r: Route) {
    const ok = await confirm(`حذف خط "${r.from_city} → ${r.to_city}"؟`);
    if (!ok) return;
    await apiFetch(`/admin/travel/routes/${r.id}`, { method:"DELETE" });
    toast.success("تم حذف الخط"); loadAll();
  }

  // ── Booking actions ──────────────────────────────────────────
  async function verifyPayment(b: Booking) {
    const ok = await confirm(`تأكيد استلام دفعة تذكرة "${b.ticket_number}"؟`);
    if (!ok) return;
    await apiFetch(`/admin/travel/bookings/${b.id}/verify-payment`, { method:"PATCH" });
    toast.success("✓ تم تأكيد الدفع"); setViewBooking(null); loadAll();
  }
  async function rejectPayment(b: Booking) {
    if (!rejectReason.trim()) { toast.error("أدخل سبب الرفض"); return; }
    await apiFetch(`/admin/travel/bookings/${b.id}/reject-payment`, {
      method:"PATCH", body: JSON.stringify({ reason: rejectReason }),
    });
    toast.warning("✗ تم رفض الدفع"); setViewBooking(null); setRejectReason(""); loadAll();
  }

  // ── Settings ─────────────────────────────────────────────────
  async function saveSettings() {
    try {
      await apiFetch("/admin/travel/settings", { method:"PATCH", body: JSON.stringify(settings) });
      toast.success("تم حفظ الإعدادات");
    } catch { toast.error("تعذّر الحفظ"); }
  }

  const filteredBookings = bookings.filter(b => {
    if (bFilter !== "all" && b.payment_status !== bFilter) return false;
    if (bSearch && !b.passenger_name.includes(bSearch) && !b.ticket_number.includes(bSearch) && !b.booking_ref.includes(bSearch)) return false;
    return true;
  });

  const TABS = [
    { key:"overview",   label:"نظرة عامة",   icon:"📊" },
    { key:"companies",  label:"الشركات",      icon:"🏢" },
    { key:"routes",     label:"الخطوط والأسعار", icon:"🗺️" },
    { key:"bookings",   label:"الحجوزات والمدفوعات", icon:"🎫" },
    { key:"settings",   label:"الإعدادات",    icon:"⚙️" },
  ] as const;

  return (
    <div style={{ minHeight:"100vh", background:BG, color:TEXT, fontFamily:"inherit", padding: "24px 28px", direction:"rtl" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:TEXT }}>✈️ إدارة تذاكر السفر بين المدن</h1>
        <p style={{ margin:"6px 0 0", fontSize:13, color:MUTED }}>نظام متكامل لإدارة شركات النقل والحجوزات والمدفوعات</p>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:24, borderBottom:`1px solid ${BORDER}`, paddingBottom:0, flexWrap:"wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:"10px 18px", border:"none", background:"none", color: tab===t.key ? BLUE : MUTED,
              fontWeight: tab===t.key ? 700 : 500, fontSize:13, cursor:"pointer", borderBottom: tab===t.key ? `2px solid ${BLUE}` : "2px solid transparent", fontFamily:"inherit" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:MUTED }}>جاري التحميل...</div>}

      {/* ══ Overview ══ */}
      {!loading && tab === "overview" && stats && (
        <div>
          <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:24 }}>
            <KpiCard value={stats.total}            label="إجمالي الحجوزات"  icon="🎫" color={BLUE}   />
            <KpiCard value={stats.confirmed}         label="مدفوع ومؤكد"     icon="✅" color={GREEN}  sub="حجوزات مكتملة الدفع" />
            <KpiCard value={stats.pending}           label="في انتظار الدفع"  icon="⏳" color={GOLD}   />
            <KpiCard value={stats.cancelled}         label="ملغاة"            icon="❌" color={RED}    />
            <KpiCard value={`${fmt(stats.revenue)} ج`} label="إجمالي الإيرادات" icon="💰" color={ORANGE} />
            <KpiCard value={stats.active_companies}  label="شركات نشطة"       icon="🏢" color={BLUE}   />
            <KpiCard value={stats.active_routes}     label="خطوط نشطة"        icon="🗺️" color={BLUE}   />
          </div>

          {/* Top routes */}
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:20, marginBottom:20 }}>
            <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700, color:TEXT }}>🏆 أكثر الخطوط حجزاً</h3>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                  {["الخط","الحجوزات","الإيرادات"].map(h=>(
                    <th key={h} style={{ padding:"8px 10px", textAlign:"right", color:MUTED, fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.topRoutes.map((r,i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${BORDER}33` }}>
                    <td style={{ padding:"10px", color:TEXT }}>{r.from_city} ← {r.to_city}</td>
                    <td style={{ padding:"10px", color:BLUE, fontWeight:700 }}>{r.bookings}</td>
                    <td style={{ padding:"10px", color:GOLD, fontWeight:700 }}>{fmt(r.revenue)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending payments alert */}
          {stats.pending > 0 && (
            <div style={{ background:GOLD+"15", border:`1px solid ${GOLD}44`, borderRadius:12, padding:"14px 18px",
              display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:GOLD, fontWeight:700 }}>⚠️ {stats.pending} حجز في انتظار مراجعة الدفع</span>
              <button onClick={()=>{ setTab("bookings"); setBFilter("proof_submitted"); }}
                style={{ background:GOLD, color:"#000", border:"none", borderRadius:8, padding:"6px 14px", fontWeight:700, cursor:"pointer", fontSize:12 }}>
                مراجعة الآن
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ Companies ══ */}
      {!loading && tab === "companies" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:TEXT }}>شركات النقل المسجّلة</h2>
            <button onClick={()=>setAddCompanyOpen(true)}
              style={{ background:BLUE, color:"#fff", border:"none", borderRadius:10, padding:"9px 18px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
              + إضافة شركة
            </button>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {companies.map(c => (
              <div key={c.id} style={{ background:CARD, border:`1px solid ${c.active ? BORDER : RED+"44"}`, borderRadius:16, padding:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700, color:TEXT }}>{c.name}</div>
                    <div style={{ fontSize:12, color:MUTED, marginTop:3 }}>{c.owner_name} · {c.phone}</div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                      color: c.active ? GREEN : RED, background: (c.active ? GREEN : RED)+"18", border:`1px solid ${c.active ? GREEN : RED}30` }}>
                      {c.active ? "نشطة" : "موقوفة"}
                    </span>
                    <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:BLUE, background:BLUE+"18", border:`1px solid ${BLUE}30` }}>
                      {c.subscription_type === "commission" ? `عمولة ${c.commission_pct}%` : c.subscription_type === "annual" ? "سنوي" : "شهري"}
                    </span>
                  </div>
                </div>

                {/* Payment Account */}
                <div style={{ background:BG, borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:12, color:MUTED }}>💳 حساب الدفع:</span>
                  {c.payment_account_number ? (
                    <span style={{ fontSize:13, color:TEXT, fontWeight:600 }}>
                      {c.payment_account_type} — {c.payment_account_name} — {c.payment_account_number}
                    </span>
                  ) : (
                    <span style={{ fontSize:12, color:GOLD }}>⚠️ لم يُضَف حساب دفع بعد</span>
                  )}
                  <button onClick={()=>setPaymentAccModal(c)}
                    style={{ background:BLUE+"22", color:BLUE, border:`1px solid ${BLUE}44`, borderRadius:7, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {c.payment_account_number ? "تعديل" : "إضافة حساب"}
                  </button>
                  {c.payment_account_number && (
                    <span style={{ fontSize:12, color:MUTED }}>مهلة الدفع: {c.payment_booking_timeout_hrs} ساعة</span>
                  )}
                </div>

                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button onClick={()=>setEditCompany({...c})}
                    style={{ background:BLUE+"20", color:BLUE, border:`1px solid ${BLUE}40`, borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    تعديل
                  </button>
                  <button onClick={()=>toggleCompany(c)}
                    style={{ background:(c.active?RED:GREEN)+"20", color:c.active?RED:GREEN, border:`1px solid ${(c.active?RED:GREEN)}40`, borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {c.active ? "إيقاف" : "تفعيل"}
                  </button>
                  {c.notes && <span style={{ fontSize:12, color:MUTED, paddingTop:8 }}>📝 {c.notes}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Add Company Modal */}
          {addCompanyOpen && (
            <Modal title="إضافة شركة نقل جديدة" onClose={()=>setAddCompanyOpen(false)}>
              <Grid cols={2}><Inp label="اسم الشركة *" value={nc.name} onChange={v=>setNc(p=>({...p,name:v}))} />
              <Inp label="اسم المالك" value={nc.owner_name} onChange={v=>setNc(p=>({...p,owner_name:v}))} />
              <Inp label="رقم الهاتف" value={nc.phone} onChange={v=>setNc(p=>({...p,phone:v}))} />
              <Inp label="واتساب (مع كود الدولة)" value={nc.wa_number} onChange={v=>setNc(p=>({...p,wa_number:v}))} />
              <Sel label="نموذج العائد" value={nc.subscription_type} onChange={v=>setNc(p=>({...p,subscription_type:v}))}
                options={[{v:"commission",l:"عمولة %"},{v:"annual",l:"اشتراك سنوي"},{v:"monthly",l:"اشتراك شهري"}]} />
              {nc.subscription_type==="commission" && <Inp label="نسبة العمولة %" type="number" value={nc.commission_pct} onChange={v=>setNc(p=>({...p,commission_pct:v}))} />}
              {nc.subscription_type!=="commission" && <Inp label="سعر الاشتراك (ج)" type="number" value={nc.subscription_price} onChange={v=>setNc(p=>({...p,subscription_price:v}))} />}
              <Inp label="رقم الترخيص" value={nc.license_no} onChange={v=>setNc(p=>({...p,license_no:v}))} />
              </Grid>
              <div style={{marginTop:12}}><Inp label="ملاحظات" value={nc.notes} onChange={v=>setNc(p=>({...p,notes:v}))} /></div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20 }}>
                <button onClick={()=>setAddCompanyOpen(false)} style={{ background:"none", border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, padding:"8px 16px", cursor:"pointer" }}>إلغاء</button>
                <SaveBtn onClick={saveCompany} label="إضافة الشركة" />
              </div>
            </Modal>
          )}

          {/* Edit Company Modal */}
          {editCompany && (
            <Modal title={`تعديل: ${editCompany.name}`} onClose={()=>setEditCompany(null)}>
              <Grid cols={2}>
                <Inp label="اسم الشركة" value={editCompany.name} onChange={v=>setEditCompany(p=>p?{...p,name:v}:p)} />
                <Inp label="اسم المالك" value={editCompany.owner_name} onChange={v=>setEditCompany(p=>p?{...p,owner_name:v}:p)} />
                <Inp label="الهاتف" value={editCompany.phone} onChange={v=>setEditCompany(p=>p?{...p,phone:v}:p)} />
                <Inp label="واتساب" value={editCompany.wa_number} onChange={v=>setEditCompany(p=>p?{...p,wa_number:v}:p)} />
                <Inp label="نسبة العمولة %" type="number" value={String(editCompany.commission_pct)} onChange={v=>setEditCompany(p=>p?{...p,commission_pct:Number(v)}:p)} />
                <Inp label="رقم الترخيص" value={editCompany.license_no} onChange={v=>setEditCompany(p=>p?{...p,license_no:v}:p)} />
              </Grid>
              <div style={{marginTop:12}}><Inp label="ملاحظات" value={editCompany.notes} onChange={v=>setEditCompany(p=>p?{...p,notes:v}:p)} /></div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20 }}>
                <button onClick={()=>setEditCompany(null)} style={{ background:"none", border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, padding:"8px 16px", cursor:"pointer" }}>إلغاء</button>
                <SaveBtn onClick={updateCompany} label="حفظ التعديلات" />
              </div>
            </Modal>
          )}

          {/* Payment Account Modal */}
          {paymentAccModal && (
            <Modal title={`حساب الدفع — ${paymentAccModal.name}`} onClose={()=>setPaymentAccModal(null)}>
              <div style={{ background:BLUE+"10", border:`1px solid ${BLUE}30`, borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:13, color:TEXT, lineHeight:1.7 }}>
                💡 يُعرض هذا الحساب للعملاء بعد إتمام الحجز لإرسال الدفعة. تأكد من صحة البيانات.
              </div>
              <Grid cols={1} gap={12}>
                <Sel label="وسيلة الدفع" value={paymentAccModal.payment_account_type}
                  onChange={v=>setPaymentAccModal(p=>p?{...p,payment_account_type:v}:p)}
                  options={ACCOUNT_TYPES.map(t=>({v:t,l:t}))} />
                <Inp label="اسم صاحب الحساب" value={paymentAccModal.payment_account_name}
                  onChange={v=>setPaymentAccModal(p=>p?{...p,payment_account_name:v}:p)} />
                <Inp label="رقم الحساب / رقم الهاتف" value={paymentAccModal.payment_account_number}
                  onChange={v=>setPaymentAccModal(p=>p?{...p,payment_account_number:v}:p)} placeholder="09XXXXXXXX" />
                <Inp label="مهلة الدفع (بالساعات)" type="number" value={String(paymentAccModal.payment_booking_timeout_hrs)}
                  onChange={v=>setPaymentAccModal(p=>p?{...p,payment_booking_timeout_hrs:Number(v)}:p)} placeholder="3" />
              </Grid>
              <div style={{ background:GOLD+"10", border:`1px solid ${GOLD}30`, borderRadius:10, padding:"10px 14px", marginTop:14, fontSize:12, color:GOLD }}>
                ⚠️ المهلة: إذا لم يُرسل العميل إيصال الدفع خلال المدة المحددة يتعرض الحجز للإلغاء التلقائي
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20 }}>
                <button onClick={()=>setPaymentAccModal(null)} style={{ background:"none", border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, padding:"8px 16px", cursor:"pointer" }}>إلغاء</button>
                <SaveBtn onClick={savePaymentAccount} label="حفظ حساب الدفع" />
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ══ Routes ══ */}
      {!loading && tab === "routes" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:TEXT }}>خطوط السفر والأسعار</h2>
            <button onClick={()=>setAddRouteOpen(true)}
              style={{ background:BLUE, color:"#fff", border:"none", borderRadius:10, padding:"9px 18px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
              + إضافة خط
            </button>
          </div>

          {/* Routes table */}
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORDER}`, background:"hsl(222 47% 9%)" }}>
                  {["الشركة","الخط","وقت المغادرة","السعر العادي","سعر الذروة","ساعات الذروة","المقاعد","الحالة","إجراءات"].map(h=>(
                    <th key={h} style={{ padding:"12px 10px", textAlign:"right", color:MUTED, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id} style={{ borderBottom:`1px solid ${BORDER}33`, opacity: r.active ? 1 : 0.5 }}>
                    <td style={{ padding:"11px 10px", color:MUTED, fontSize:12 }}>{r.company_name}</td>
                    <td style={{ padding:"11px 10px", color:TEXT, fontWeight:600 }}>{r.from_city} ← {r.to_city}</td>
                    <td style={{ padding:"11px 10px", color:TEXT }}>{r.departure_time}</td>
                    <td style={{ padding:"11px 10px", color:GOLD, fontWeight:700 }}>{fmt(r.price)} ج</td>
                    <td style={{ padding:"11px 10px", color:ORANGE, fontWeight:700 }}>
                      {r.peak_price_multiplier > 1 ? `${fmt(Number(r.price)*Number(r.peak_price_multiplier))} ج (×${r.peak_price_multiplier})` : "—"}
                    </td>
                    <td style={{ padding:"11px 10px", color:MUTED, fontSize:12 }}>
                      {r.peak_hours_start && r.peak_hours_end ? `${r.peak_hours_start} – ${r.peak_hours_end}` : "—"}
                    </td>
                    <td style={{ padding:"11px 10px", color:TEXT }}>{r.seats_total}</td>
                    <td style={{ padding:"11px 10px" }}>
                      <span style={{ padding:"3px 8px", borderRadius:20, fontSize:11, fontWeight:700,
                        color:r.active?GREEN:RED, background:(r.active?GREEN:RED)+"18" }}>
                        {r.active?"نشط":"موقوف"}
                      </span>
                    </td>
                    <td style={{ padding:"11px 10px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>setEditRoute({...r})} style={{ background:BLUE+"20", color:BLUE, border:"none", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>تعديل</button>
                        <button onClick={()=>deleteRoute(r)} style={{ background:RED+"20", color:RED, border:"none", borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Route Modal */}
          {addRouteOpen && (
            <Modal title="إضافة خط سفر جديد" onClose={()=>setAddRouteOpen(false)} wide>
              <Grid cols={2} gap={14}>
                <Sel label="الشركة *" value={nr.company_id} onChange={v=>setNr(p=>({...p,company_id:v}))}
                  options={[{v:"",l:"اختر شركة"},...companies.filter(c=>c.active).map(c=>({v:String(c.id),l:c.name}))]} />
                <Inp label="وقت المغادرة" type="time" value={nr.departure_time} onChange={v=>setNr(p=>({...p,departure_time:v}))} />
                <Inp label="من مدينة *" value={nr.from_city} onChange={v=>setNr(p=>({...p,from_city:v}))} placeholder="الحصاحيصا" />
                <Inp label="إلى مدينة *" value={nr.to_city} onChange={v=>setNr(p=>({...p,to_city:v}))} placeholder="الخرطوم" />
                <Inp label="السعر العادي (ج) *" type="number" value={nr.price} onChange={v=>setNr(p=>({...p,price:v}))} />
                <Inp label="عدد المقاعد" type="number" value={nr.seats_total} onChange={v=>setNr(p=>({...p,seats_total:v}))} />
                <Inp label="مضاعف سعر الذروة (مثل 1.5)" type="number" value={nr.peak_price_multiplier} onChange={v=>setNr(p=>({...p,peak_price_multiplier:v}))} placeholder="1.0" />
                <div></div>
                <Inp label="بداية ساعات الذروة" type="time" value={nr.peak_hours_start} onChange={v=>setNr(p=>({...p,peak_hours_start:v}))} />
                <Inp label="نهاية ساعات الذروة" type="time" value={nr.peak_hours_end} onChange={v=>setNr(p=>({...p,peak_hours_end:v}))} />
              </Grid>
              <div style={{marginTop:12}}><Inp label="ملاحظة" value={nr.notes} onChange={v=>setNr(p=>({...p,notes:v}))} placeholder="معلومات إضافية عن الخط" /></div>
              <div style={{ background:BLUE+"10", borderRadius:10, padding:"10px 14px", marginTop:12, fontSize:12, color:MUTED }}>
                💡 إذا كان وقت الحجز ضمن ساعات الذروة يُطبَّق السعر المضاعف تلقائياً
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20 }}>
                <button onClick={()=>setAddRouteOpen(false)} style={{ background:"none", border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, padding:"8px 16px", cursor:"pointer" }}>إلغاء</button>
                <SaveBtn onClick={saveRoute} label="إضافة الخط" />
              </div>
            </Modal>
          )}

          {/* Edit Route Modal */}
          {editRoute && (
            <Modal title={`تعديل: ${editRoute.from_city} ← ${editRoute.to_city}`} onClose={()=>setEditRoute(null)} wide>
              <Grid cols={2} gap={14}>
                <Inp label="السعر العادي (ج)" type="number" value={String(editRoute.price)} onChange={v=>setEditRoute(p=>p?{...p,price:Number(v)}:p)} />
                <Inp label="وقت المغادرة" type="time" value={editRoute.departure_time} onChange={v=>setEditRoute(p=>p?{...p,departure_time:v}:p)} />
                <Inp label="عدد المقاعد" type="number" value={String(editRoute.seats_total)} onChange={v=>setEditRoute(p=>p?{...p,seats_total:Number(v)}:p)} />
                <Inp label="مضاعف الذروة" type="number" value={String(editRoute.peak_price_multiplier)} onChange={v=>setEditRoute(p=>p?{...p,peak_price_multiplier:Number(v)}:p)} />
                <Inp label="بداية الذروة" type="time" value={editRoute.peak_hours_start} onChange={v=>setEditRoute(p=>p?{...p,peak_hours_start:v}:p)} />
                <Inp label="نهاية الذروة" type="time" value={editRoute.peak_hours_end} onChange={v=>setEditRoute(p=>p?{...p,peak_hours_end:v}:p)} />
              </Grid>
              <div style={{marginTop:12}}><Inp label="ملاحظة" value={editRoute.notes} onChange={v=>setEditRoute(p=>p?{...p,notes:v}:p)} /></div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14 }}>
                <input type="checkbox" id="activeRoute" checked={editRoute.active} onChange={e=>setEditRoute(p=>p?{...p,active:e.target.checked}:p)} />
                <label htmlFor="activeRoute" style={{ color:TEXT, fontSize:13 }}>الخط نشط</label>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:20 }}>
                <button onClick={()=>setEditRoute(null)} style={{ background:"none", border:`1px solid ${BORDER}`, color:MUTED, borderRadius:8, padding:"8px 16px", cursor:"pointer" }}>إلغاء</button>
                <SaveBtn onClick={updateRoute} label="حفظ" />
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ══ Bookings & Payments ══ */}
      {!loading && tab === "bookings" && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:12, flexWrap:"wrap" }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:TEXT }}>الحجوزات والمدفوعات</h2>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input value={bSearch} onChange={e=>setBSearch(e.target.value)} placeholder="بحث باسم أو تذكرة..."
                style={{ padding:"8px 14px", borderRadius:10, border:`1px solid ${BORDER}`, background:"hsl(222 47% 9%)", color:TEXT, fontSize:13, fontFamily:"inherit", width:200 }} />
              <select value={bFilter} onChange={e=>setBFilter(e.target.value)}
                style={{ padding:"8px 12px", borderRadius:10, border:`1px solid ${BORDER}`, background:"hsl(222 47% 9%)", color:TEXT, fontFamily:"inherit", fontSize:13 }}>
                <option value="all">الكل</option>
                <option value="pending_payment">انتظار الدفع</option>
                <option value="proof_submitted">إيصال مُرفق</option>
                <option value="verified">مدفوع</option>
                <option value="rejected">مرفوض</option>
              </select>
              <button onClick={loadAll} style={{ background:BLUE+"20", color:BLUE, border:`1px solid ${BLUE}40`, borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                🔄 تحديث
              </button>
            </div>
          </div>

          {/* Proof-submitted alerts */}
          {bookings.filter(b=>b.payment_status==="proof_submitted").length > 0 && (
            <div style={{ background:BLUE+"12", border:`1px solid ${BLUE}44`, borderRadius:10, padding:"10px 16px", marginBottom:14, fontSize:13, color:BLUE }}>
              🔔 {bookings.filter(b=>b.payment_status==="proof_submitted").length} حجز مرفق بإيصال دفع — يستلزم مراجعتك
            </div>
          )}

          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, overflow:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:900 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${BORDER}`, background:"hsl(222 47% 9%)" }}>
                  {["رقم التذكرة","المسافر","الخط","تاريخ السفر","الشركة","السعر","الحالة","حالة الدفع","إجراء"].map(h=>(
                    <th key={h} style={{ padding:"10px 10px", textAlign:"right", color:MUTED, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map(b => (
                  <tr key={b.id} style={{ borderBottom:`1px solid ${BORDER}22`, cursor:"pointer" }}
                    onClick={()=>setViewBooking(b)}>
                    <td style={{ padding:"10px", color:BLUE, fontWeight:700 }}>{b.ticket_number}</td>
                    <td style={{ padding:"10px", color:TEXT }}>
                      <div>{b.passenger_name}</div>
                      <div style={{color:MUTED,fontSize:11}}>{b.passenger_phone}</div>
                    </td>
                    <td style={{ padding:"10px", color:TEXT }}>{b.from_city} ← {b.to_city}</td>
                    <td style={{ padding:"10px", color:MUTED }}>{fmtDate(b.travel_date)} {b.departure_time}</td>
                    <td style={{ padding:"10px", color:MUTED, fontSize:11 }}>{b.company_name}</td>
                    <td style={{ padding:"10px", color:GOLD, fontWeight:700 }}>{fmt(b.price)} ج</td>
                    <td style={{ padding:"10px" }}><Badge status={b.status} map={BOOKING_STATUS} /></td>
                    <td style={{ padding:"10px" }}><Badge status={b.payment_status} map={PAYMENT_STATUS} /></td>
                    <td style={{ padding:"10px" }}>
                      {b.payment_status === "proof_submitted" && (
                        <span style={{ color:BLUE, fontWeight:700, fontSize:11 }}>👁️ مراجعة</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredBookings.length === 0 && (
                  <tr><td colSpan={9} style={{ padding:32, textAlign:"center", color:MUTED }}>لا توجد حجوزات</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Booking Detail Modal */}
          {viewBooking && (
            <Modal title={`تفاصيل الحجز — ${viewBooking.ticket_number}`} onClose={()=>{ setViewBooking(null); setRejectReason(""); }} wide>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  ["المسافر", viewBooking.passenger_name],
                  ["الهاتف",  viewBooking.passenger_phone],
                  ["من",      viewBooking.from_city],
                  ["إلى",     viewBooking.to_city],
                  ["التاريخ", fmtDate(viewBooking.travel_date)],
                  ["المغادرة",viewBooking.departure_time],
                  ["المقعد",  viewBooking.seat_number],
                  ["السعر",   fmt(viewBooking.price) + " ج"],
                  ["الشركة",  viewBooking.company_name],
                  ["المرجع",  viewBooking.booking_ref],
                ].map(([l,v]) => (
                  <div key={l} style={{ background:BG, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{fontSize:11,color:MUTED}}>{l}</div>
                    <div style={{fontSize:14,color:TEXT,fontWeight:600,marginTop:3}}>{v || "—"}</div>
                  </div>
                ))}
              </div>

              {/* Payment Info */}
              <div style={{ marginTop:20, background:BG, borderRadius:12, padding:16 }}>
                <h4 style={{ margin:"0 0 12px", color:TEXT, fontSize:13 }}>معلومات الدفع</h4>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
                  <Badge status={viewBooking.payment_status} map={PAYMENT_STATUS} />
                  {viewBooking.payment_ref && <span style={{ fontSize:12, color:MUTED }}>رقم المرجع: {viewBooking.payment_ref}</span>}
                </div>
                {viewBooking.payment_proof_url && (
                  <div>
                    <div style={{ fontSize:12, color:MUTED, marginBottom:6 }}>إيصال الدفع:</div>
                    <a href={viewBooking.payment_proof_url} target="_blank" rel="noopener noreferrer"
                      style={{ color:BLUE, fontSize:13, textDecoration:"underline" }}>
                      📎 عرض الإيصال
                    </a>
                  </div>
                )}
                {viewBooking.payment_verified_by && (
                  <div style={{ fontSize:12, color:GREEN, marginTop:8 }}>
                    ✓ تم التحقق بواسطة: {viewBooking.payment_verified_by} — {fmtDate(viewBooking.payment_verified_at)}
                  </div>
                )}
                {viewBooking.payment_rejection_reason && (
                  <div style={{ fontSize:12, color:RED, marginTop:8 }}>✗ سبب الرفض: {viewBooking.payment_rejection_reason}</div>
                )}
              </div>

              {/* Verification Actions */}
              {viewBooking.payment_status === "proof_submitted" && (
                <div style={{ marginTop:16 }}>
                  <div style={{ background:GREEN+"10", border:`1px solid ${GREEN}30`, borderRadius:10, padding:14, marginBottom:12 }}>
                    <p style={{ margin:"0 0 12px", fontSize:13, color:TEXT }}>هل تأكدت من استلام الدفعة؟</p>
                    <button onClick={()=>verifyPayment(viewBooking)}
                      style={{ background:GREEN, color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                      ✓ تأكيد استلام الدفعة
                    </button>
                  </div>
                  <div style={{ background:RED+"10", border:`1px solid ${RED}30`, borderRadius:10, padding:14 }}>
                    <p style={{ margin:"0 0 8px", fontSize:13, color:TEXT }}>رفض الإيصال (اكتب السبب):</p>
                    <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                      placeholder="سبب الرفض..."
                      style={{ width:"100%", padding:"8px 12px", borderRadius:8, border:`1px solid ${RED}44`, background:"hsl(222 47% 9%)", color:TEXT, fontFamily:"inherit", fontSize:13, boxSizing:"border-box" as const, marginBottom:8 }} />
                    <button onClick={()=>rejectPayment(viewBooking)}
                      style={{ background:RED, color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                      ✗ رفض الإيصال
                    </button>
                  </div>
                </div>
              )}
              {viewBooking.payment_status === "pending_payment" && (
                <div style={{ marginTop:14, background:GOLD+"10", border:`1px solid ${GOLD}30`, borderRadius:10, padding:12, fontSize:13, color:GOLD }}>
                  ⏳ هذا الحجز في انتظار إرسال العميل إيصال الدفع
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <button onClick={()=>{ setViewBooking(null); setRejectReason(""); }}
                  style={{ background:BLUE+"20", color:BLUE, border:`1px solid ${BLUE}44`, borderRadius:8, padding:"8px 16px", cursor:"pointer", fontWeight:700 }}>
                  إغلاق
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ══ Settings ══ */}
      {!loading && tab === "settings" && (
        <div style={{ maxWidth:600 }}>
          <h2 style={{ margin:"0 0 20px", fontSize:16, fontWeight:700, color:TEXT }}>إعدادات خدمة السفريات</h2>

          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* General */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:20 }}>
              <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700, color:TEXT }}>⚙️ الإعدادات العامة</h3>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:BG, borderRadius:10 }}>
                  <div>
                    <div style={{ fontSize:14, color:TEXT, fontWeight:600 }}>تفعيل خدمة السفريات</div>
                    <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>إظهار/إخفاء الخدمة في التطبيق</div>
                  </div>
                  <input type="checkbox" checked={settings.travel_enabled === "true"}
                    onChange={e=>setSettings(p=>({...p, travel_enabled: String(e.target.checked)}))}
                    style={{ width:20, height:20, cursor:"pointer" }} />
                </div>
                <Inp label="مهلة الدفع الافتراضية (ساعات)" type="number"
                  value={settings.travel_payment_timeout_hrs}
                  onChange={v=>setSettings(p=>({...p, travel_payment_timeout_hrs:v}))} />
                <Inp label="واتساب الإشعارات للإدارة" type="tel"
                  value={settings.travel_admin_whatsapp}
                  onChange={v=>setSettings(p=>({...p, travel_admin_whatsapp:v}))}
                  placeholder="2491234567890" />
              </div>
            </div>

            {/* Anti-fraud policy */}
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:16, padding:20 }}>
              <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700, color:TEXT }}>🛡️ سياسة منع الاحتيال</h3>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {[
                  ["التحقق المزدوج","يجب أن يرفع العميل إيصال الدفع ثم تؤكده الإدارة يدوياً قبل اعتبار الحجز مؤكداً"],
                  ["مهلة الدفع","إذا تجاوز العميل المهلة المحددة دون إرسال إيصال يتم إلغاء الحجز تلقائياً"],
                  ["رقم المرجع","يطلب من العميل رقم العملية بالإضافة للإيصال لضمان صحة الدفع"],
                  ["الإيصال بالصورة","يُطلب صورة الإيصال من التطبيق المصرفي — يصعب تزويرها مقارنةً بالنص"],
                  ["سجل كامل","كل عملية دفع مسجّلة مع وقتها ومن أجراها — لا يمكن حذفها"],
                  ["تنبيه الإدارة","تنبيه فوري للإدارة عند رفع إيصال جديد للمراجعة السريعة"],
                ].map(([title, desc]) => (
                  <div key={title} style={{ display:"flex", gap:10, padding:"10px 12px", background:BG, borderRadius:10 }}>
                    <span style={{ color:GREEN, fontSize:16, flexShrink:0 }}>✓</span>
                    <div>
                      <div style={{ fontSize:13, color:TEXT, fontWeight:600 }}>{title}</div>
                      <div style={{ fontSize:12, color:MUTED, marginTop:2, lineHeight:1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <SaveBtn onClick={saveSettings} label="حفظ الإعدادات" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
