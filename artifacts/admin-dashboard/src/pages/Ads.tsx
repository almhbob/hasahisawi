import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Ad = {
  id: number; institution_name: string; contact_name?: string;
  contact_phone?: string; title: string; description?: string;
  type: string; target_screen: string; duration_days: number;
  budget?: string; status: string; priority: number;
  start_date?: string; end_date?: string; created_at: string;
  approved_by_name?: string;
};

const AD_TYPES = ["promotion","announcement","event","surprise","banner"];
const SCREENS  = ["all","home","market","community","map","jobs","health"];

const EMPTY: Partial<Ad> = {
  institution_name: "", contact_name: "", contact_phone: "",
  title: "", description: "", type: "promotion", target_screen: "all",
  duration_days: 7, budget: "", priority: 0,
};

export default function Ads() {
  const [ads,     setAds]     = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Partial<Ad>>(EMPTY);
  const [showForm,setShowForm]= useState(false);
  const [saving,  setSaving]  = useState(false);
  const [filter,  setFilter]  = useState<"all" | "active" | "pending" | "expired">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Ad[]>("/admin/ads");
      setAds(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.institution_name?.trim() || !form.title?.trim()) return alert("اسم المؤسسة والعنوان مطلوبان");
    setSaving(true);
    try {
      const res = await apiFetch("/admin/ads", { method: "POST", body: JSON.stringify(form) });
      const d = await res.json();
      setAds(prev => [d, ...prev]);
      setShowForm(false); setForm(EMPTY);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا الإعلان؟")) return;
    await apiFetch(`/admin/ads/${id}`, { method: "DELETE" });
    setAds(prev => prev.filter(a => a.id !== id));
  };

  const approve = async (id: number) => {
    await apiFetch(`/admin/ads/${id}/status`, { method: "PUT", body: JSON.stringify({ status: "active" }) });
    setAds(prev => prev.map(a => a.id === id ? { ...a, status: "active" } : a));
  };

  const reject = async (id: number) => {
    await apiFetch(`/admin/ads/${id}/status`, { method: "PUT", body: JSON.stringify({ status: "rejected" }) });
    setAds(prev => prev.map(a => a.id === id ? { ...a, status: "rejected" } : a));
  };

  const filtered = ads.filter(a => filter === "all" || a.status === filter);

  const STATUS_STYLE: Record<string, string> = {
    active: "badge-green", pending: "badge-yellow",
    rejected: "badge-red", expired: "badge-red",
  };
  const STATUS_LABELS: Record<string, string> = {
    active: "نشط", pending: "بانتظار", rejected: "مرفوض", expired: "منتهي",
  };
  const TYPE_LABELS: Record<string, string> = {
    promotion: "إعلان ترويجي", announcement: "إعلان إخباري", event: "حدث",
    surprise: "مفاجأة", banner: "لافتة",
  };

  return (
    <div>
      <PageHeader
        title="إدارة الإعلانات"
        subtitle={`${ads.length} إعلان · ${ads.filter(a => a.status === "pending").length} بانتظار`}
        action={
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setShowForm(true); }}>
            + إعلان جديد
          </button>
        }
      />

      {/* Filter tabs */}
      <div style={{ padding: "14px 28px 0", display: "flex", gap: 8 }}>
        {(["all","pending","active","expired"] as const).map(f => {
          const labels = { all: "الكل", pending: "بانتظار", active: "نشطة", expired: "منتهية" };
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                borderColor: filter === f ? "hsl(38 90% 50% / 0.5)" : "hsl(217 32% 17%)",
                background: filter === f ? "hsl(38 90% 50% / 0.12)" : "transparent",
                color: filter === f ? "hsl(38 90% 60%)" : "hsl(215 20% 60%)",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              }}
            >{labels[f]}</button>
          );
        })}
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ margin: "20px 28px", background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(38 90% 50% / 0.3)", padding: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 90%)", marginBottom: 20, marginTop: 0 }}>
            إضافة إعلان جديد
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "اسم المؤسسة *", key: "institution_name" },
              { label: "اسم التواصل", key: "contact_name" },
              { label: "هاتف التواصل", key: "contact_phone" },
              { label: "الميزانية", key: "budget" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>{f.label}</label>
                <input type="text" value={(form as any)[f.key] ?? ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} className="input-field" />
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>العنوان *</label>
              <input type="text" value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="input-field" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الوصف</label>
              <textarea value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-field" rows={2} style={{ resize: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>النوع</label>
              <select value={form.type ?? "promotion"} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ width: "100%", background: "hsl(217 32% 12%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "hsl(210 40% 85%)", fontFamily: "inherit" }}>
                {AD_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الشاشة المستهدفة</label>
              <select value={form.target_screen ?? "all"} onChange={e => setForm(p => ({ ...p, target_screen: e.target.value }))}
                style={{ width: "100%", background: "hsl(217 32% 12%)", border: "1px solid hsl(217 32% 18%)", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "hsl(210 40% 85%)", fontFamily: "inherit" }}>
                {SCREENS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>مدة الإعلان (أيام)</label>
              <input type="number" min="1" max="365" value={form.duration_days ?? 7} onChange={e => setForm(p => ({ ...p, duration_days: +e.target.value }))} className="input-field" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "hsl(215 20% 60%)", display: "block", marginBottom: 6 }}>الأولوية</label>
              <input type="number" min="0" max="10" value={form.priority ?? 0} onChange={e => setForm(p => ({ ...p, priority: +e.target.value }))} className="input-field" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "نشر الإعلان"}</button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); }}
              style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid hsl(217 32% 20%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "16px 28px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>لا يوجد إعلانات</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)", overflow: "hidden" }}>
            {filtered.map(a => (
              <div key={a.id} className="table-row" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "hsl(38 90% 50% / 0.12)", border: "1px solid hsl(38 90% 50% / 0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  📢
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(210 40% 93%)" }}>{a.title}</span>
                    <span className={STATUS_STYLE[a.status] || "badge-blue"} style={{ fontSize: 10 }}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                    <span className="badge-blue" style={{ fontSize: 10 }}>{TYPE_LABELS[a.type] || a.type}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 55%)" }}>
                    {a.institution_name}{a.contact_phone ? ` · ${a.contact_phone}` : ""}
                    {` · ${a.duration_days} يوم`}
                    {a.target_screen ? ` · ${a.target_screen}` : ""}
                  </div>
                  {a.description && <p style={{ fontSize: 12, color: "hsl(215 20% 60%)", margin: "6px 0 0", lineHeight: 1.4 }}>{a.description}</p>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  {a.status === "pending" && (
                    <button onClick={() => approve(a.id)}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(147 60% 42% / 0.4)", background: "hsl(147 60% 42% / 0.15)", color: "hsl(147 60% 52%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      ✓ موافقة
                    </button>
                  )}
                  {a.status === "active" && (
                    <button onClick={() => reject(a.id)}
                      style={{ padding: "6px 12px", borderRadius: 9, border: "1px solid hsl(0 72% 55% / 0.3)", background: "hsl(0 72% 55% / 0.12)", color: "hsl(0 72% 65%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                      رفض
                    </button>
                  )}
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(a.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
