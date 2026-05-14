import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson, getApiBase } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Application = {
  id: number; full_name: string; title: string; phone: string; whatsapp: string;
  email: string; bar_number: string; experience_y: number; specialties: string;
  bio: string; office_addr: string; district: string; languages: string;
  consult_fee: string; bar_card_url: string; photo_url: string;
  status: "pending" | "approved" | "rejected"; admin_note: string;
  reviewed_at?: string; lawyer_id?: number; created_at: string;
};
type Lawyer = {
  id: number; full_name: string; title: string; phone: string; specialties: string;
  district: string; consult_fee: string; experience_y: number;
  is_featured: boolean; is_verified: boolean; is_active: boolean;
  contracts_count: number; created_at: string;
  plan_name?: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  sub_commission?: number; sub_expires?: string; sub_started?: string;
};
type SubRow = {
  lawyer_id: number; full_name: string; phone: string; district: string;
  plan_name?: string; plan_name_ar?: string; color?: string; icon?: string; price_label?: string;
  commission_pct?: number; started_at?: string; expires_at?: string;
  payment_ref?: string; admin_note?: string; contracts_count: number;
};
type SubStats = {
  plans: { name: string; name_ar: string; icon: string; price_sdg: number; color: string; subscribers: number; monthly_revenue: number; avg_commission: number }[];
  total_paid: number; free_lawyers: number;
};
type Plan = {
  id: number; name: string; name_ar: string; price_sdg: number; price_label: string;
  monthly_contacts: number; has_unlimited_contacts: boolean; has_ads: boolean;
  has_featured: boolean; has_verified_badge: boolean; has_priority: boolean;
  commission_pct: number; color: string; icon: string; is_active: boolean;
};
type ExpiringRow = {
  lawyer_id: number; full_name: string; phone: string; district: string;
  plan_name: string; plan_name_ar: string; color: string; icon: string;
  expires_at: string; commission_pct: number; days_left: number;
};
type HistoryRow = {
  id: number; lawyer_id: number; full_name: string; plan_name: string; plan_name_ar: string;
  commission_pct: number; started_at: string; expires_at?: string; payment_ref: string;
  admin_note: string; changed_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };
const STATUS_COLOR: Record<string, string> = { pending: "#F59E0B", approved: "#10B981", rejected: "#EF4444" };
const PLAN_FEATURES: Record<string, string[]> = {
  free:         ["ظهور أساسي في الدليل", "5 طلبات تواصل / شهر", "ملف شخصي مبسّط"],
  basic:        ["تواصل غير محدود", "أولوية الظهور", "شارة الاعتماد ✓", "إشعارات الطلبات"],
  professional: ["كل مميزات الأساسي", "إعلان ترويجي داخل التطبيق", "ظهور مميّز في القائمة", "عمولة 5%"],
  premium:      ["كل مميزات المحترف", "صدارة الصفحة الرئيسية", "شارة 👑 البريميوم", "عمولة 8% مع تقارير"],
};
const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("ar-SD") : "—";

// ─── Sub-components ───────────────────────────────────────────────────────────
function Toggle({ label, on, onChange, color }: { label: string; on: boolean; onChange: () => void; color: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: on ? color : "#9ca3af" }}>
      <div onClick={onChange} style={{ width: 28, height: 16, borderRadius: 8, background: on ? color : "#e5e7eb", position: "relative", transition: "background 0.2s", cursor: "pointer", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: on ? "auto" : 2, right: on ? 2 : "auto", width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "all 0.2s" }} />
      </div>
      {label}
    </label>
  );
}
function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${color}33`, borderRadius: 12, padding: "14px 16px", borderRight: `4px solid ${color}` }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Tick({ v }: { v: boolean }) {
  return <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 15 }}>{v ? "✅" : "—"}</td>;
}
function Info({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div style={{ gridColumn: block ? "1 / -1" : undefined, marginTop: block ? 10 : 0 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 15 }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "بحث…"}
        style={{ width: "100%", paddingRight: 34, paddingLeft: 12, paddingTop: 8, paddingBottom: 8, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
    </div>
  );
}
function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#374151" }}>
      <option value="">{placeholder || "الكل"}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Modal({ onClose, title, width, children }: { onClose: () => void; title: string; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: `min(95vw, ${width || 520}px)`, maxHeight: "90vh", overflowY: "auto", padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type Tab = "applications" | "active" | "subscriptions" | "expiring" | "plans";

export default function Lawyers() {
  const [tab, setTab] = useState<Tab>("applications");

  // Data
  const [apps, setApps]       = useState<Application[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [subs, setSubs]       = useState<SubRow[]>([]);
  const [stats, setStats]     = useState<SubStats | null>(null);
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [expiring, setExpiring] = useState<ExpiringRow[]>([]);
  const [adminPlans, setAdminPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "pending" | "approved" | "rejected">("pending");
  const [filterPlan, setFilterPlan]   = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [expiringDays, setExpiringDays] = useState(30);

  // Application modal
  const [selected, setSelected] = useState<Application | null>(null);
  const [note, setNote]         = useState("");
  const [feature, setFeature]   = useState(false);
  const [busy, setBusy]         = useState(false);

  // Subscription modal
  const [subModal, setSubModal] = useState<SubRow | null>(null);
  const [subForm, setSubForm]   = useState({ plan_name: "free", commission_pct: "0", expires_at: "", payment_ref: "", admin_note: "" });
  const [subBusy, setSubBusy]   = useState(false);

  // History modal
  const [histModal, setHistModal] = useState<{ lawyer_id: number; full_name: string } | null>(null);
  const [history, setHistory]     = useState<HistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Plan edit modal
  const [planEdit, setPlanEdit] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<Partial<Plan>>({});
  const [planBusy, setPlanBusy] = useState(false);

  // Lawyer edit modal
  const [lawyerEdit, setLawyerEdit] = useState<Lawyer | null>(null);
  const [lawyerForm, setLawyerForm] = useState({ full_name: "", title: "", specialties: "", phone: "", whatsapp: "", email: "", office_addr: "", district: "", consult_fee: "", experience_y: 0 });
  const [lawyerBusy, setLawyerBusy] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────────
  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Application[]>(`/admin/lawyer-applications${filterStatus ? `?status=${filterStatus}` : ""}`);
      setApps(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [filterStatus]);

  const loadLawyers = useCallback(async () => {
    setLoading(true);
    try { setLawyers(Array.isArray(await apiJson<Lawyer[]>("/admin/lawyers")) ? await apiJson<Lawyer[]>("/admin/lawyers") : []); }
    catch {} finally { setLoading(false); }
  }, []);

  const loadSubs = useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, statsData, plansData] = await Promise.all([
        apiJson<SubRow[]>("/admin/subscriptions"),
        apiJson<SubStats>("/admin/subscription-stats"),
        apiJson<Plan[]>("/subscription-plans"),
      ]);
      setSubs(Array.isArray(subsData) ? subsData : []);
      setStats(statsData as SubStats);
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadExpiring = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<ExpiringRow[]>(`/admin/subscriptions/expiring?days=${expiringDays}`);
      setExpiring(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, [expiringDays]);

  const loadAdminPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Plan[]>("/admin/subscription-plans");
      setAdminPlans(Array.isArray(data) ? data : []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setSearch(""); setFilterPlan(""); setFilterDistrict("");
    if (tab === "applications") loadApps();
    else if (tab === "active")  loadLawyers();
    else if (tab === "subscriptions") loadSubs();
    else if (tab === "expiring") loadExpiring();
    else if (tab === "plans")   loadAdminPlans();
  }, [tab]);

  useEffect(() => { if (tab === "applications") loadApps(); }, [filterStatus]);
  useEffect(() => { if (tab === "expiring") loadExpiring(); }, [expiringDays]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filteredApps = useMemo(() =>
    apps.filter(a => !search || a.full_name.includes(search) || a.phone.includes(search) || a.specialties?.includes(search)),
    [apps, search]);

  const filteredLawyers = useMemo(() =>
    lawyers.filter(l => {
      const s = search.toLowerCase();
      return (!search || l.full_name.includes(s) || l.phone?.includes(s) || l.specialties?.includes(s))
        && (!filterPlan || l.plan_name === filterPlan || (!l.plan_name && filterPlan === "free"))
        && (!filterDistrict || l.district === filterDistrict);
    }), [lawyers, search, filterPlan, filterDistrict]);

  const filteredSubs = useMemo(() =>
    subs.filter(r => {
      const s = search.toLowerCase();
      return (!search || r.full_name.includes(s) || r.phone?.includes(s))
        && (!filterPlan || r.plan_name === filterPlan || (!r.plan_name && filterPlan === "free"))
        && (!filterDistrict || r.district === filterDistrict);
    }), [subs, search, filterPlan, filterDistrict]);

  const filteredExpiring = useMemo(() =>
    expiring.filter(r => !search || r.full_name.includes(search) || r.phone?.includes(search)),
    [expiring, search]);

  const uniqueDistricts = useMemo(() => {
    const all = [...lawyers, ...subs].map(x => x.district).filter(Boolean);
    return [...new Set(all)].sort();
  }, [lawyers, subs]);

  const planOptions = useMemo(() =>
    plans.map(p => ({ value: p.name, label: `${p.icon} ${p.name_ar}` })),
    [plans]);

  const districtOptions = useMemo(() =>
    uniqueDistricts.map(d => ({ value: d, label: d })),
    [uniqueDistricts]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const approve = async () => {
    if (!selected) return;
    if (!confirm(`قبول طلب ${selected.full_name}؟ سيتم إنشاء ملف المحامي تلقائياً.`)) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/approve`,
        { method: "POST", body: JSON.stringify({ admin_note: note, is_featured: feature }) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل القبول"); }
      else { setSelected(null); setNote(""); setFeature(false); loadApps(); }
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!selected) return;
    if (!note.trim()) { alert("اكتب سبب الرفض"); return; }
    if (!confirm("رفض هذا الطلب؟")) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyer-applications/${selected.id}/reject`,
        { method: "POST", body: JSON.stringify({ admin_note: note }) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الرفض"); }
      else { setSelected(null); setNote(""); loadApps(); }
    } finally { setBusy(false); }
  };

  const toggleField = async (l: Lawyer, field: "is_featured" | "is_verified" | "is_active") => {
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "PATCH", body: JSON.stringify({ [field]: !l[field] }) });
    setLawyers(prev => prev.map(x => x.id === l.id ? { ...x, [field]: !l[field] } : x));
  };

  const removeLawyer = async (l: Lawyer) => {
    if (!confirm(`حذف المحامي "${l.full_name}" نهائياً؟`)) return;
    await apiFetch(`/admin/lawyers/${l.id}`, { method: "DELETE" });
    setLawyers(prev => prev.filter(x => x.id !== l.id));
  };

  const openLawyerEdit = (l: Lawyer) => {
    setLawyerEdit(l);
    setLawyerForm({
      full_name: l.full_name || "", title: l.title || "", specialties: l.specialties || "",
      phone: l.phone || "", whatsapp: "", email: "", office_addr: "", district: l.district || "",
      consult_fee: l.consult_fee || "", experience_y: l.experience_y || 0,
    });
  };

  const saveLawyerEdit = async () => {
    if (!lawyerEdit) return;
    if (!lawyerForm.full_name.trim()) { alert("الاسم مطلوب"); return; }
    setLawyerBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyers/${lawyerEdit.id}`, { method: "PATCH", body: JSON.stringify(lawyerForm) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الحفظ"); }
      else {
        setLawyers(prev => prev.map(x => x.id === lawyerEdit.id ? { ...x, ...lawyerForm } : x));
        setLawyerEdit(null);
      }
    } finally { setLawyerBusy(false); }
  };

  const openSubModal = (row: SubRow) => {
    setSubModal(row);
    setSubForm({ plan_name: row.plan_name || "free", commission_pct: String(row.commission_pct ?? 0), expires_at: row.expires_at ? row.expires_at.slice(0, 10) : "", payment_ref: row.payment_ref || "", admin_note: row.admin_note || "" });
  };

  const openSubFromExpiring = (row: ExpiringRow) => {
    const sub: SubRow = { lawyer_id: row.lawyer_id, full_name: row.full_name, phone: row.phone, district: row.district, plan_name: row.plan_name, plan_name_ar: row.plan_name_ar, color: row.color, icon: row.icon, commission_pct: row.commission_pct, expires_at: row.expires_at, contracts_count: 0 };
    openSubModal(sub);
  };

  const saveSub = async () => {
    if (!subModal) return;
    setSubBusy(true);
    try {
      const r = await apiFetch(`/admin/lawyers/${subModal.lawyer_id}/subscription`,
        { method: "PUT", body: JSON.stringify({ ...subForm, commission_pct: Number(subForm.commission_pct) }) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الحفظ"); }
      else {
        setSubModal(null);
        if (tab === "subscriptions") loadSubs();
        else if (tab === "expiring") loadExpiring();
      }
    } finally { setSubBusy(false); }
  };

  const openHistory = async (row: { lawyer_id: number; full_name: string }) => {
    setHistModal(row); setHistLoading(true); setHistory([]);
    try { setHistory(await apiJson<HistoryRow[]>(`/admin/subscription-history/${row.lawyer_id}`)); }
    catch {} finally { setHistLoading(false); }
  };

  const exportCSV = () => {
    const token = localStorage.getItem("admin_token");
    const base = getApiBase();
    window.open(`${base}/api/admin/lawyers/export.csv?token=${encodeURIComponent(token || "")}`, "_blank");
  };

  const openPlanEdit = (p: Plan) => { setPlanEdit(p); setPlanForm({ ...p }); };

  const savePlan = async () => {
    if (!planEdit) return;
    setPlanBusy(true);
    try {
      const r = await apiFetch(`/admin/subscription-plans/${planEdit.id}`, { method: "PUT", body: JSON.stringify(planForm) });
      if (!r.ok) { const d = await r.json(); alert(d.error || "فشل الحفظ"); }
      else { setPlanEdit(null); loadAdminPlans(); }
    } finally { setPlanBusy(false); }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const pendingCount  = apps.filter(a => a.status === "pending").length;
  const totalRevenue  = stats?.plans.reduce((s, p) => s + (p.monthly_revenue || 0), 0) ?? 0;
  const expiringSoon  = expiring.filter(r => r.days_left <= 7).length;

  // ── TAB config ─────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; badge?: number; color?: string }[] = [
    { key: "applications",  label: "📥 طلبات الانضمام", badge: pendingCount || undefined },
    { key: "active",        label: "⚖️ المحامون" },
    { key: "subscriptions", label: "💳 الاشتراكات" },
    { key: "expiring",      label: "⏰ تنتهي قريباً", badge: expiringSoon || undefined, color: "#EF4444" },
    { key: "plans",         label: "🏷️ إدارة الخطط" },
  ];

  return (
    <div>
      <PageHeader
        title="المحامون والخدمات القانونية"
        subtitle={
          tab === "applications" ? `${apps.length} طلب${pendingCount ? ` · ${pendingCount} قيد المراجعة` : ""}` :
          tab === "active"       ? `${lawyers.length} محامٍ مسجّل` :
          tab === "subscriptions"? "إدارة الاشتراكات والعمولات" :
          tab === "expiring"     ? `${expiring.length} اشتراك ينتهي خلال ${expiringDays} يوم` :
          "تعديل أسعار وخطط الاشتراك"
        }
      />

      {/* ─── Tabs ─── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e5e7eb", flexWrap: "wrap" }}>
        {TABS.map(({ key, label, badge, color }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "11px 18px", border: "none", background: "none", cursor: "pointer",
            borderBottom: tab === key ? `2px solid ${color || "#8B5CF6"}` : "2px solid transparent",
            color: tab === key ? (color || "#8B5CF6") : "#6B7280",
            fontWeight: 700, fontSize: 13, marginBottom: -2, display: "flex", alignItems: "center", gap: 6,
          }}>
            {label}
            {badge ? <span style={{ background: color || "#F59E0B", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── Toolbar ─── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {tab !== "plans" && (
          <SearchBar value={search} onChange={setSearch}
            placeholder={tab === "applications" ? "بحث في الطلبات…" : tab === "active" ? "بحث في المحامين…" : "بحث…"} />
        )}

        {tab === "applications" && (
          <Select value={filterStatus} onChange={v => setFilterStatus(v as any)}
            options={[{ value: "pending", label: "قيد المراجعة" }, { value: "approved", label: "مقبول" }, { value: "rejected", label: "مرفوض" }]}
            placeholder="جميع الحالات" />
        )}

        {(tab === "active" || tab === "subscriptions") && (
          <>
            <Select value={filterPlan} onChange={setFilterPlan} options={planOptions} placeholder="جميع الخطط" />
            {uniqueDistricts.length > 0 && (
              <Select value={filterDistrict} onChange={setFilterDistrict} options={districtOptions} placeholder="جميع المناطق" />
            )}
          </>
        )}

        {tab === "expiring" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#374151" }}>تنتهي خلال</span>
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => setExpiringDays(d)} style={{
                padding: "6px 12px", borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: `1px solid ${expiringDays === d ? "#EF4444" : "#e5e7eb"}`,
                background: expiringDays === d ? "#EF4444" : "#fff",
                color: expiringDays === d ? "#fff" : "#374151",
              }}>{d} يوم</button>
            ))}
          </div>
        )}

        {tab === "subscriptions" && (
          <button onClick={exportCSV} style={{
            marginRight: "auto", padding: "8px 16px", border: "1px solid #10B981", background: "#fff",
            color: "#10B981", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            ⬇️ تصدير CSV
          </button>
        )}
      </div>

      {/* ══════════════════ APPLICATIONS TAB ══════════════════ */}
      {tab === "applications" && (
        loading ? <Spinner /> : filteredApps.length === 0 ? <Empty text="لا توجد طلبات" /> : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredApps.map(a => (
              <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 15 }}>{a.full_name}</strong>
                      <Pill text={STATUS_LABEL[a.status]} bg={STATUS_COLOR[a.status] + "22"} color={STATUS_COLOR[a.status]} />
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>{a.title} · {a.specialties}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>📞 {a.phone} · 🆔 {a.bar_number} · ⏱ {a.experience_y} سنة · 📅 {fmt(a.created_at)}</div>
                    {a.admin_note && a.status !== "pending" && (
                      <div style={{ marginTop: 8, padding: 8, background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#4b5563" }}>💬 {a.admin_note}</div>
                    )}
                  </div>
                  <button onClick={() => { setSelected(a); setNote(a.admin_note || ""); setFeature(false); }} style={{
                    padding: "7px 14px", borderRadius: 8, border: "1px solid #8B5CF6", background: "#fff",
                    color: "#8B5CF6", cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                  }}>مراجعة التفاصيل</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ══════════════════ ACTIVE LAWYERS TAB ══════════════════ */}
      {tab === "active" && (
        loading ? <Spinner /> : filteredLawyers.length === 0 ? <Empty text="لا يوجد محامون بهذه المعايير" /> : (
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                  {["الاسم", "الخطة", "التخصص", "المنطقة", "العقود", "انتهاء الاشتراك", "الحالة", "إجراءات"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLawyers.map(l => {
                  const expiringSoon = l.sub_expires && new Date(l.sub_expires) < new Date(Date.now() + 30 * 86400000);
                  return (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6", background: l.is_active ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{l.full_name}</div>
                        <div style={{ color: "#6b7280", fontSize: 11 }}>{l.title} · 📞 {l.phone}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {l.plan_name ? (
                          <span style={{ background: (l.plan_color || "#6B7280") + "22", color: l.plan_color || "#6B7280", borderRadius: 12, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                            {l.plan_icon} {l.plan_name_ar}
                          </span>
                        ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>🔓 مجاني</span>}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", maxWidth: 160 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.specialties}</div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{l.district}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#4b5563" }}>{l.contracts_count}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {l.sub_expires ? (
                          <span style={{ color: expiringSoon ? "#EF4444" : "#10B981", fontWeight: 600, fontSize: 12 }}>
                            {expiringSoon ? "⚠️ " : ""}{fmt(l.sub_expires)}
                          </span>
                        ) : <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <Toggle label="فعّال" on={l.is_active}   onChange={() => toggleField(l, "is_active")}   color="#10B981" />
                          <Toggle label="مميّز" on={l.is_featured} onChange={() => toggleField(l, "is_featured")} color="#F59E0B" />
                          <Toggle label="موثّق" on={l.is_verified} onChange={() => toggleField(l, "is_verified")} color="#8B5CF6" />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                          <button onClick={() => openLawyerEdit(l)} style={{ padding: "5px 10px", border: "1px solid #F59E0B", background: "#fff", color: "#F59E0B", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>✏️ تعديل</button>
                          <button onClick={() => openHistory({ lawyer_id: l.id, full_name: l.full_name })} style={{ padding: "5px 10px", border: "1px solid #8B5CF6", background: "#fff", color: "#8B5CF6", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>📋 التاريخ</button>
                          <button onClick={() => removeLawyer(l)} style={{ padding: "5px 10px", border: "1px solid #EF4444", background: "#fff", color: "#EF4444", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>🗑 حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ══════════════════ SUBSCRIPTIONS TAB ══════════════════ */}
      {tab === "subscriptions" && (
        <>
          {/* بطاقات الإحصاء */}
          {stats && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
                <StatCard label="إجمالي الإيرادات الشهرية" value={`${totalRevenue.toLocaleString()} ج.س`} color="#10B981" icon="💰" />
                <StatCard label="مشتركون بخطط مدفوعة"     value={String(stats.total_paid)}                color="#8B5CF6" icon="💳" />
                <StatCard label="على الخطة المجانية"        value={String(stats.free_lawyers)}             color="#6B7280" icon="🔓" />
                <StatCard label="إجمالي المحامين"           value={String(filteredSubs.length)}            color="#3B82F6" icon="⚖️" />
              </div>

              {/* جدول الخطط */}
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827", fontSize: 15 }}>📋 ملخص خطط الاشتراك</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["الخطة", "السعر / شهر", "التواصل", "إعلانات", "مميّز", "موثّق", "أولوية", "عمولة", "المشتركون", "الإيراد"].map(h => (
                          <th key={h} style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.plans.map(p => (
                        <tr key={p.name} style={{ borderTop: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: p.color + "22", color: p.color, borderRadius: 10, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>{p.icon} {p.name_ar}</span>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700 }}>
                            {p.price_sdg === 0 ? <span style={{ color: "#6B7280" }}>مجاناً</span> : <span style={{ color: "#047857" }}>{p.price_sdg.toLocaleString()} ج.س</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center" }}>{p.name === "free" ? "5/شهر" : "∞"}</td>
                          <Tick v={p.name !== "free"} />
                          <Tick v={p.name !== "free"} />
                          <Tick v={["professional","premium"].includes(p.name)} />
                          <Tick v={["professional","premium"].includes(p.name)} />
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#8B5CF6" }}>
                            {p.avg_commission > 0 ? `${Number(p.avg_commission).toFixed(1)}%` : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700 }}>{p.subscribers}</td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#047857" }}>
                            {p.monthly_revenue > 0 ? `${Number(p.monthly_revenue).toLocaleString()} ج.س` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 0, borderTop: "1px solid #f3f4f6" }}>
                  {Object.entries(PLAN_FEATURES).map(([pname, feats]) => {
                    const p = stats.plans.find(x => x.name === pname);
                    return (
                      <div key={pname} style={{ padding: "12px 16px", borderLeft: "1px solid #f3f4f6" }}>
                        <div style={{ fontWeight: 700, color: p?.color || "#6B7280", marginBottom: 6, fontSize: 12 }}>{p?.icon} {p?.name_ar || pname}</div>
                        {feats.map(f => <div key={f} style={{ fontSize: 11, color: "#4b5563", marginBottom: 3 }}>✓ {f}</div>)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* جدول المحامين */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827", fontSize: 15 }}>
              👤 المحامون واشتراكاتهم <span style={{ fontWeight: 400, fontSize: 12, color: "#9ca3af" }}>({filteredSubs.length} نتيجة)</span>
            </div>
            {loading ? <Spinner /> : filteredSubs.length === 0 ? <Empty text="لا يوجد نتائج" /> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["المحامي", "الخطة", "العمولة", "بداية الاشتراك", "تاريخ الانتهاء", "العقود", "مرجع الدفع", "الإجراءات"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubs.map(row => {
                      const isExpiringSoon = row.expires_at && new Date(row.expires_at) < new Date(Date.now() + 7 * 86400000);
                      const isExpired = row.expires_at && new Date(row.expires_at) < new Date();
                      return (
                        <tr key={row.lawyer_id} style={{ borderTop: "1px solid #f3f4f6", background: isExpired ? "#fff5f5" : "#fff" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ fontWeight: 600 }}>{row.full_name}</div>
                            <div style={{ color: "#9ca3af", fontSize: 11 }}>📞 {row.phone} · {row.district}</div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {row.plan_name ? (
                              <span style={{ background: (row.color || "#6B7280") + "22", color: row.color || "#6B7280", borderRadius: 12, padding: "3px 10px", fontWeight: 700, fontSize: 12 }}>
                                {row.icon} {row.plan_name_ar}
                              </span>
                            ) : <span style={{ color: "#9ca3af", fontSize: 12 }}>🔓 مجاني</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: "#8B5CF6" }}>
                            {row.commission_pct ? `${row.commission_pct}%` : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 12 }}>{fmt(row.started_at)}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            {row.expires_at ? (
                              <span style={{ color: isExpired ? "#EF4444" : isExpiringSoon ? "#F59E0B" : "#6b7280", fontWeight: isExpiringSoon || isExpired ? 700 : 400, fontSize: 12 }}>
                                {isExpired ? "❌ منتهي" : isExpiringSoon ? "⚠️ " : ""}{fmt(row.expires_at)}
                              </span>
                            ) : <span style={{ color: "#d1d5db" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700 }}>{row.contracts_count}</td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11 }}>{row.payment_ref || "—"}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button onClick={() => openSubModal(row)} style={{ padding: "5px 10px", border: "1px solid #8B5CF6", background: "#fff", color: "#8B5CF6", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>✏️ خطة</button>
                              <button onClick={() => openHistory({ lawyer_id: row.lawyer_id, full_name: row.full_name })} style={{ padding: "5px 10px", border: "1px solid #6B7280", background: "#fff", color: "#6B7280", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>📋 تاريخ</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════ EXPIRING TAB ══════════════════ */}
      {tab === "expiring" && (
        <>
          {expiring.length > 0 && (
            <div style={{ background: "#FFF5F5", border: "1px solid #FCA5A5", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <span style={{ fontWeight: 700, color: "#B91C1C" }}>{expiring.filter(r => r.days_left <= 7).length} اشتراك ينتهي خلال 7 أيام</span>
                <span style={{ color: "#6b7280", fontSize: 12, marginRight: 12 }}>يُنصح بالتواصل مع المحامين قبل انتهاء الاشتراك</span>
              </div>
            </div>
          )}
          {loading ? <Spinner /> : filteredExpiring.length === 0 ? <Empty text={`لا توجد اشتراكات تنتهي خلال ${expiringDays} يوم`} /> : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredExpiring.map(row => (
                <div key={row.lawyer_id} style={{ border: `1px solid ${row.days_left <= 7 ? "#FCA5A5" : "#e5e7eb"}`, borderRadius: 12, padding: 16, background: row.days_left <= 7 ? "#FFF5F5" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 15 }}>{row.full_name}</strong>
                        <span style={{ background: (row.color || "#6B7280") + "22", color: row.color || "#6B7280", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{row.icon} {row.plan_name_ar}</span>
                        <span style={{ background: row.days_left <= 7 ? "#FEE2E2" : "#FEF9C3", color: row.days_left <= 7 ? "#B91C1C" : "#854D0E", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                          {row.days_left <= 0 ? "منتهي" : `${row.days_left} يوم متبقي`}
                        </span>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>📞 {row.phone} · 📍 {row.district} · ينتهي: {fmt(row.expires_at)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <a href={`tel:${row.phone}`} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #10B981", background: "#fff", color: "#10B981", cursor: "pointer", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>📞 اتصال</a>
                      <button onClick={() => openSubFromExpiring(row)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #8B5CF6", background: "#8B5CF6", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>🔄 تجديد</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════ PLANS TAB ══════════════════ */}
      {tab === "plans" && (
        loading ? <Spinner /> : (
          <div style={{ display: "grid", gap: 14 }}>
            {adminPlans.map(p => (
              <div key={p.id} style={{ background: "#fff", border: `1px solid ${p.color}44`, borderRadius: 14, padding: 20, borderRight: `5px solid ${p.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 24 }}>{p.icon}</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 17, color: p.color }}>{p.name_ar}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}><code>{p.name}</code></div>
                      </div>
                      {!p.is_active && <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>معطّل</span>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
                      <PlanField label="السعر الشهري" value={p.price_sdg === 0 ? "مجاناً" : `${p.price_sdg.toLocaleString()} ج.س`} />
                      <PlanField label="وصف السعر" value={p.price_label} />
                      <PlanField label="الاتصالات / شهر" value={p.has_unlimited_contacts ? "غير محدود" : String(p.monthly_contacts)} />
                      <PlanField label="العمولة الافتراضية" value={p.commission_pct > 0 ? `${p.commission_pct}%` : "—"} />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {[["إعلانات", p.has_ads],["مميّز", p.has_featured],["موثّق", p.has_verified_badge],["أولوية", p.has_priority]].map(([label, v]) => (
                        <span key={String(label)} style={{ background: v ? "#dcfce7" : "#f9fafb", color: v ? "#166534" : "#9ca3af", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600 }}>
                          {v ? "✓" : "✗"} {String(label)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => openPlanEdit(p)} style={{
                    padding: "9px 18px", border: `1px solid ${p.color}`, background: p.color + "15",
                    color: p.color, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                  }}>✏️ تعديل الخطة</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ══════════════════ MODALS ══════════════════ */}

      {/* نافذة مراجعة الطلب */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title={`🔎 مراجعة طلب: ${selected.full_name}`} width={680}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <Pill text={STATUS_LABEL[selected.status]} bg={STATUS_COLOR[selected.status] + "22"} color={STATUS_COLOR[selected.status]} />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>📅 {fmt(selected.created_at)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Info label="اللقب المهني"  value={selected.title} />
            <Info label="رقم النقابة"   value={selected.bar_number} />
            <Info label="الهاتف"        value={selected.phone} />
            <Info label="واتساب"        value={selected.whatsapp || "—"} />
            <Info label="الخبرة"        value={`${selected.experience_y} سنة`} />
            <Info label="الحي / المنطقة" value={selected.district} />
            <Info label="أتعاب الاستشارة" value={selected.consult_fee} />
            <Info label="اللغات"        value={selected.languages} />
            <Info label="البريد الإلكتروني" value={selected.email || "—"} />
            <Info label="التخصصات"  value={selected.specialties} block />
            {selected.office_addr && <Info label="العنوان" value={selected.office_addr} block />}
            {selected.bio         && <Info label="نبذة مهنية" value={selected.bio} block />}
          </div>
          {selected.bar_card_url && (
            <a href={selected.bar_card_url} target="_blank" rel="noopener noreferrer" style={{ color: "#8B5CF6", fontSize: 13, fontWeight: 600 }}>🔗 عرض بطاقة النقابة</a>
          )}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>ملاحظة الإدارة (تظهر للمتقدّم):</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="اكتب ملاحظة قبول أو سبب الرفض…"
              style={{ width: "100%", padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          {selected.status === "pending" ? (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={feature} onChange={e => setFeature(e.target.checked)} />
                ★ تمييز المحامي بعد القبول
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button onClick={reject} disabled={busy} style={{ flex: 1, padding: 12, border: "1px solid #DC2626", background: "#fff", color: "#DC2626", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>رفض الطلب</button>
                <button onClick={approve} disabled={busy} style={{ flex: 2, padding: 12, border: "none", background: "#10B981", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                  {busy ? "جارٍ…" : "✓ قبول وإنشاء ملف المحامي"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 16, padding: 12, background: STATUS_COLOR[selected.status] + "11", borderRadius: 8, color: STATUS_COLOR[selected.status], fontWeight: 600, textAlign: "center" }}>
              هذا الطلب {STATUS_LABEL[selected.status]} — بتاريخ {fmt(selected.reviewed_at)}
            </div>
          )}
        </Modal>
      )}

      {/* نافذة تعيين الاشتراك */}
      {subModal && (
        <Modal onClose={() => setSubModal(null)} title="💳 تعيين خطة اشتراك">
          <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
            <div style={{ fontWeight: 700 }}>{subModal.full_name}</div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>{subModal.phone} · {subModal.district}</div>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 8 }}>الخطة</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {plans.map(p => (
                  <button key={p.name} onClick={() => setSubForm(f => ({ ...f, plan_name: p.name, commission_pct: String(p.commission_pct) }))}
                    style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "right", border: `2px solid ${subForm.plan_name === p.name ? p.color : "#e5e7eb"}`, background: subForm.plan_name === p.name ? p.color + "15" : "#fff" }}>
                    <div style={{ fontWeight: 700, color: p.color }}>{p.icon} {p.name_ar}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{p.price_label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>نسبة العمولة المتفق عليها (%)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min="0" max="30" step="0.5" value={subForm.commission_pct}
                  onChange={e => setSubForm(f => ({ ...f, commission_pct: e.target.value }))}
                  style={{ flex: 1, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit" }} />
                <span style={{ color: "#8B5CF6", fontWeight: 800, fontSize: 18 }}>%</span>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>تاريخ انتهاء الاشتراك</label>
              <input type="date" value={subForm.expires_at} onChange={e => setSubForm(f => ({ ...f, expires_at: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>مرجع الدفع / رقم الإيصال</label>
              <input type="text" value={subForm.payment_ref} onChange={e => setSubForm(f => ({ ...f, payment_ref: e.target.value }))}
                placeholder="مثال: TRX-2026-00123"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>ملاحظة الإدارة</label>
              <textarea value={subForm.admin_note} onChange={e => setSubForm(f => ({ ...f, admin_note: e.target.value }))} rows={2}
                placeholder="ملاحظة اختيارية…"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => setSubModal(null)} style={{ flex: 1, padding: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>إلغاء</button>
            <button onClick={saveSub} disabled={subBusy} style={{ flex: 2, padding: 12, border: "none", background: "#8B5CF6", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              {subBusy ? "جارِ الحفظ…" : "✓ حفظ الاشتراك"}
            </button>
          </div>
        </Modal>
      )}

      {/* نافذة سجل التاريخ */}
      {histModal && (
        <Modal onClose={() => { setHistModal(null); setHistory([]); }} title={`📋 سجل اشتراكات: ${histModal.full_name}`} width={640}>
          {histLoading ? <Spinner /> : history.length === 0 ? <Empty text="لا يوجد سجل تاريخي بعد" /> : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map(h => (
                <div key={h.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontWeight: 700, color: "#8B5CF6" }}>{h.plan_name_ar}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>🕒 {fmt(h.changed_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {h.commission_pct > 0 && <span>عمولة: <b>{h.commission_pct}%</b></span>}
                    {h.expires_at && <span>ينتهي: <b>{fmt(h.expires_at)}</b></span>}
                    {h.payment_ref && <span>إيصال: <b>{h.payment_ref}</b></span>}
                  </div>
                  {h.admin_note && <div style={{ marginTop: 8, fontSize: 12, color: "#4b5563", background: "#f9fafb", borderRadius: 6, padding: "6px 10px" }}>💬 {h.admin_note}</div>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── نافذة تعديل بيانات المحامي ── */}
      {lawyerEdit && (
        <Modal onClose={() => setLawyerEdit(null)} title={`✏️ تعديل بيانات: ${lawyerEdit.full_name}`} width={580}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>الاسم الكامل *</label>
                <input value={lawyerForm.full_name} onChange={e => setLawyerForm(f => ({ ...f, full_name: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>اللقب / الدرجة</label>
                <input value={lawyerForm.title} onChange={e => setLawyerForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: محامٍ أمام المحاكم العليا"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>التخصصات</label>
              <input value={lawyerForm.specialties} onChange={e => setLawyerForm(f => ({ ...f, specialties: e.target.value }))}
                placeholder="مثال: أحوال شخصية، عقارات، تجاري"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>رقم الهاتف</label>
                <input value={lawyerForm.phone} onChange={e => setLawyerForm(f => ({ ...f, phone: e.target.value }))} dir="ltr"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>واتساب</label>
                <input value={lawyerForm.whatsapp} onChange={e => setLawyerForm(f => ({ ...f, whatsapp: e.target.value }))} dir="ltr"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>البريد الإلكتروني</label>
                <input type="email" value={lawyerForm.email} onChange={e => setLawyerForm(f => ({ ...f, email: e.target.value }))} dir="ltr"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>المنطقة / الدائرة</label>
                <input value={lawyerForm.district} onChange={e => setLawyerForm(f => ({ ...f, district: e.target.value }))}
                  placeholder="مثال: الحصاحيصا، ود مدني"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>رسوم الاستشارة (ج.س)</label>
                <input value={lawyerForm.consult_fee} onChange={e => setLawyerForm(f => ({ ...f, consult_fee: e.target.value }))}
                  placeholder="مثال: 500"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>سنوات الخبرة</label>
                <input type="number" min="0" value={lawyerForm.experience_y} onChange={e => setLawyerForm(f => ({ ...f, experience_y: Number(e.target.value) }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>عنوان المكتب</label>
              <input value={lawyerForm.office_addr} onChange={e => setLawyerForm(f => ({ ...f, office_addr: e.target.value }))}
                placeholder="مثال: شارع الجمهورية، الحصاحيصا"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={() => setLawyerEdit(null)} style={{ flex: 1, padding: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>إلغاء</button>
            <button onClick={saveLawyerEdit} disabled={lawyerBusy} style={{ flex: 2, padding: 12, border: "none", background: "#F59E0B", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              {lawyerBusy ? "جارِ الحفظ…" : "✓ حفظ التعديلات"}
            </button>
          </div>
        </Modal>
      )}

      {/* نافذة تعديل الخطة */}
      {planEdit && (
        <Modal onClose={() => setPlanEdit(null)} title={`✏️ تعديل خطة: ${planEdit.name_ar}`} width={560}>
          <div style={{ display: "grid", gap: 14 }}>
            {[
              { key: "name_ar",    label: "الاسم العربي",       type: "text" },
              { key: "price_sdg",  label: "السعر (ج.س / شهر)",  type: "number" },
              { key: "price_label",label: "وصف السعر",           type: "text" },
              { key: "commission_pct", label: "العمولة الافتراضية (%)", type: "number" },
              { key: "monthly_contacts", label: "عدد الاتصالات / شهر", type: "number" },
              { key: "color",      label: "اللون (HEX)",          type: "text" },
              { key: "icon",       label: "الأيقونة (emoji)",     type: "text" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label style={{ fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</label>
                <input type={type} value={String((planForm as any)[key] ?? "")}
                  onChange={e => setPlanForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(["has_unlimited_contacts","has_ads","has_featured","has_verified_badge","has_priority","is_active"] as (keyof Plan)[]).map(k => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={Boolean((planForm as any)[k])} onChange={e => setPlanForm(f => ({ ...f, [k]: e.target.checked }))} />
                  {(({ has_unlimited_contacts: "اتصالات غير محدودة", has_ads: "إعلانات", has_featured: "مميّز", has_verified_badge: "موثّق", has_priority: "أولوية الظهور", is_active: "الخطة مفعّلة" } as Record<string, string>)[k as string])}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => setPlanEdit(null)} style={{ flex: 1, padding: 12, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>إلغاء</button>
            <button onClick={savePlan} disabled={planBusy} style={{ flex: 2, padding: 12, border: "none", background: planEdit.color, color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              {planBusy ? "جارِ الحفظ…" : "✓ حفظ التعديلات"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function Spinner() { return <div style={{ textAlign: "center", padding: 40, color: "#8B5CF6" }}>جارِ التحميل…</div>; }
function Empty({ text }: { text: string }) { return <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>{text}</div>; }
function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{text}</span>;
}
function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}
