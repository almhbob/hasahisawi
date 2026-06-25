import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type SubRow = {
  lawyer_id: number;
  full_name: string;
  phone: string;
  district: string;
  plan_name?: string;
  plan_name_ar?: string;
  color?: string;
  icon?: string;
  price_label?: string;
  commission_pct?: number;
  started_at?: string;
  expires_at?: string;
  payment_ref?: string;
  admin_note?: string;
  contracts_count: number;
};

type Plan = {
  id: number;
  name: string;
  name_ar: string;
  price_label: string;
  commission_pct: number;
  color: string;
  icon: string;
  is_active: boolean;
};

type Stats = {
  plans: { name: string; name_ar: string; icon: string; color: string; subscribers: number; monthly_revenue: number; avg_commission: number }[];
  total_paid: number;
  free_lawyers: number;
};

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("ar-SD") : "—";
}

export default function LawyerSubscriptions() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [selected, setSelected] = useState<SubRow | null>(null);
  const [form, setForm] = useState({ plan_name: "free", commission_pct: "0", expires_at: "", payment_ref: "", admin_note: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [subs, ps, st] = await Promise.all([
        apiJson<SubRow[]>("/admin/subscriptions"),
        apiJson<Plan[]>("/subscription-plans"),
        apiJson<Stats>("/admin/subscription-stats"),
      ]);
      setRows(Array.isArray(subs) ? subs : []);
      setPlans(Array.isArray(ps) ? ps : []);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const matchesText = !q || r.full_name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.district?.toLowerCase().includes(q);
      const matchesPlan = !planFilter || r.plan_name === planFilter || (!r.plan_name && planFilter === "free");
      return matchesText && matchesPlan;
    });
  }, [rows, search, planFilter]);

  function open(row: SubRow) {
    setSelected(row);
    setForm({
      plan_name: row.plan_name || "free",
      commission_pct: String(row.commission_pct ?? 0),
      expires_at: row.expires_at ? row.expires_at.slice(0, 10) : "",
      payment_ref: row.payment_ref || "",
      admin_note: row.admin_note || "",
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/lawyers/${selected.lawyer_id}/subscription`, {
        method: "PUT",
        body: JSON.stringify({ ...form, commission_pct: Number(form.commission_pct) || 0 }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(text || "فشل حفظ الاشتراك");
        return;
      }
      setSelected(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const activeCount = rows.filter(r => r.plan_name && r.plan_name !== "free").length;
  const revenue = stats?.plans.reduce((sum, p) => sum + Number(p.monthly_revenue || 0), 0) || 0;

  return (
    <div>
      <PageHeader
        title="اشتراكات المحامين"
        subtitle={`إدارة خطط وعمولات المحامين · ${rows.length} محامٍ · ${activeCount} اشتراك مدفوع`}
      />

      <div style={{ padding: 24, direction: "rtl" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 18 }}>
          <div style={card("#8B5CF6")}><b>{rows.length}</b><span>إجمالي المحامين</span></div>
          <div style={card("#10B981")}><b>{activeCount}</b><span>اشتراكات مدفوعة</span></div>
          <div style={card("#64748B")}><b>{stats?.free_lawyers ?? 0}</b><span>الخطة المجانية</span></div>
          <div style={card("#F59E0B")}><b>{revenue.toLocaleString("ar-SD")}</b><span>إيراد شهري تقديري</span></div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم المحامي أو الهاتف أو المنطقة…"
            style={inputStyle}
          />
          <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} style={selectStyle}>
            <option value="">جميع الخطط</option>
            {plans.map(p => <option key={p.name} value={p.name}>{p.icon} {p.name_ar}</option>)}
          </select>
          <button onClick={load} style={buttonStyle}>تحديث</button>
        </div>

        {loading ? (
          <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>جارٍ تحميل الاشتراكات…</div>
        ) : (
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#F8FAFC", color: "#334155", fontSize: 12 }}>
                  <th style={th}>المحامي</th><th style={th}>الهاتف</th><th style={th}>المنطقة</th><th style={th}>الخطة</th><th style={th}>العمولة</th><th style={th}>تنتهي في</th><th style={th}>العقود</th><th style={th}>إدارة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.lawyer_id} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={td}><b>{row.full_name}</b></td>
                    <td style={td}>{row.phone || "—"}</td>
                    <td style={td}>{row.district || "—"}</td>
                    <td style={td}><span style={{ color: row.color || "#64748B", fontWeight: 800 }}>{row.icon || "⚖️"} {row.plan_name_ar || "مجاني"}</span><div style={{ color: "#94a3b8", fontSize: 11 }}>{row.price_label || "—"}</div></td>
                    <td style={td}>{Number(row.commission_pct || 0)}%</td>
                    <td style={td}>{fmt(row.expires_at)}</td>
                    <td style={td}>{row.contracts_count || 0}</td>
                    <td style={td}><button onClick={() => open(row)} style={smallBtn}>تعديل الاشتراك</button></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: 28 }}>لا توجد نتائج</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, color: "#111827", fontSize: 18 }}>تعديل اشتراك {selected.full_name}</h2>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: 0, fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <label style={label}>الخطة</label>
            <select value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} style={{ ...selectStyle, width: "100%" }}>
              {plans.map(p => <option key={p.name} value={p.name}>{p.icon} {p.name_ar} — {p.price_label}</option>)}
            </select>
            <label style={label}>نسبة العمولة %</label>
            <input value={form.commission_pct} onChange={e => setForm(f => ({ ...f, commission_pct: e.target.value }))} style={inputStyle} />
            <label style={label}>تاريخ الانتهاء</label>
            <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} style={inputStyle} />
            <label style={label}>مرجع الدفع</label>
            <input value={form.payment_ref} onChange={e => setForm(f => ({ ...f, payment_ref: e.target.value }))} style={inputStyle} />
            <label style={label}>ملاحظة الإدارة</label>
            <textarea value={form.admin_note} onChange={e => setForm(f => ({ ...f, admin_note: e.target.value }))} style={{ ...inputStyle, height: 90 }} />
            <button onClick={save} disabled={saving} style={{ ...buttonStyle, width: "100%", marginTop: 16 }}>{saving ? "جارٍ الحفظ…" : "حفظ الاشتراك"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function card(color: string): React.CSSProperties {
  return { background: "#fff", border: `1px solid ${color}33`, borderRight: `5px solid ${color}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 4, color };
}

const inputStyle: React.CSSProperties = { flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, fontFamily: "inherit", fontSize: 13 };
const selectStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", fontFamily: "inherit", fontSize: 13 };
const buttonStyle: React.CSSProperties = { padding: "10px 16px", border: 0, borderRadius: 10, background: "#8B5CF6", color: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const smallBtn: React.CSSProperties = { padding: "7px 11px", border: 0, borderRadius: 8, background: "#EEF2FF", color: "#4F46E5", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const th: React.CSSProperties = { textAlign: "right", padding: "12px 14px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "12px 14px", color: "#111827", fontSize: 13, verticalAlign: "top" };
const label: React.CSSProperties = { display: "block", margin: "12px 0 5px", color: "#374151", fontWeight: 700, fontSize: 13 };
const modalBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalBox: React.CSSProperties = { background: "#fff", width: "min(94vw,520px)", borderRadius: 18, padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,.25)", direction: "rtl" };
