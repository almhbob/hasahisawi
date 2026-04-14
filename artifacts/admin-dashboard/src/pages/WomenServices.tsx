import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type WomenService = {
  id: number;
  name: string;
  type: string;
  address: string;
  phone: string;
  hours: string;
  description: string;
  rating: number;
  tags: string[];
  is_active: boolean;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  salon: "كوفيرة", sewing: "خياطة", health: "صحة المرأة",
  cooking: "مطبخ", childcare: "رعاية أطفال", handmade: "أعمال يدوية", other: "أخرى",
};
const EMPTY = {
  name: "", type: "salon", address: "", phone: "", hours: "",
  description: "", rating: 5.0, tags: "",
};

export default function WomenServices() {
  const [list,    setList]    = useState<WomenService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form,    setForm]    = useState<typeof EMPTY>({ ...EMPTY });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ services: WomenService[] }>("/admin/women-services");
      setList((data as any).services ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); };

  const openEdit = (svc: WomenService) => {
    setEditing(svc.id);
    setForm({
      name: svc.name, type: svc.type, address: svc.address, phone: svc.phone,
      hours: svc.hours, description: svc.description, rating: svc.rating,
      tags: (svc.tags || []).join("، "),
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) return alert("الاسم والهاتف مطلوبان");
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: form.tags.split(/[،,]/).map(s => s.trim()).filter(Boolean),
        rating: Number(form.rating),
      };
      if (editing !== null) {
        const updated = await apiJson<WomenService>(`/admin/women-services/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
        setList(prev => prev.map(s => s.id === editing ? updated : s));
      } else {
        const created = await apiJson<WomenService>("/admin/women-services", { method: "POST", body: JSON.stringify(body) });
        setList(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { alert("حدث خطأ"); }
    setSaving(false);
  };

  const deleteSvc = async (id: number) => {
    if (!confirm("حذف هذه الخدمة؟")) return;
    try {
      await apiFetch(`/admin/women-services/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(s => s.id !== id));
    } catch {}
  };

  const toggleActive = async (svc: WomenService) => {
    try {
      const updated = await apiJson<WomenService>(`/admin/women-services/${svc.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !svc.is_active }),
      });
      setList(prev => prev.map(s => s.id === svc.id ? updated : s));
    } catch {}
  };

  return (
    <div>
      <PageHeader title="خدمات المرأة" subtitle="إدارة الصالونات والخياطة والصحة وغيرها" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {Object.entries(TYPE_LABELS).slice(0, 4).map(([type, label]) => (
          <div key={type} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "hsl(340 70% 60%)" }}>{list.filter(s => s.type === type).length}</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={openNew} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "hsl(340 70% 55%)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          + إضافة خدمة
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(svc => (
            <div key={svc.id} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px", opacity: svc.is_active ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{svc.name}</span>
                    <span style={{ fontSize: 11, background: "hsl(340 50% 40% / 0.2)", color: "hsl(340 70% 65%)", padding: "2px 8px", borderRadius: 6 }}>{TYPE_LABELS[svc.type] || svc.type}</span>
                    <span style={{ fontSize: 12, color: "hsl(38 90% 60%)" }}>⭐ {svc.rating}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>📍 {svc.address} &nbsp;|&nbsp; 📞 {svc.phone}</div>
                  {svc.hours && <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>🕐 {svc.hours}</div>}
                  {svc.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {svc.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, background: "hsl(340 50% 40% / 0.12)", color: "hsl(340 70% 65%)", padding: "2px 8px", borderRadius: 6 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleActive(svc)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 12%)", color: "hsl(215 20% 65%)", cursor: "pointer", fontSize: 12 }}>
                    {svc.is_active ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => openEdit(svc)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(38 90% 55% / 0.4)", background: "hsl(38 90% 55% / 0.12)", color: "hsl(38 90% 55%)", cursor: "pointer", fontSize: 12 }}>✏️</button>
                  <button onClick={() => deleteSvc(svc.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(0 70% 55% / 0.4)", background: "hsl(0 70% 55% / 0.12)", color: "hsl(0 70% 55%)", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 18 }}>{editing !== null ? "تعديل خدمة" : "إضافة خدمة جديدة"}</h2>
            {[
              { label: "الاسم *", key: "name" }, { label: "الهاتف *", key: "phone" },
              { label: "العنوان", key: "address" }, { label: "أوقات العمل", key: "hours" },
              { label: "الوصف", key: "description" }, { label: "التقييم (1-5)", key: "rating" },
              { label: "الوسوم (مفصولة بفاصلة)", key: "tags" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 5 }}>{f.label}</label>
                <input value={String((form as any)[f.key])} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  type={f.key === "rating" ? "number" : "text"}
                  step={f.key === "rating" ? "0.1" : undefined}
                  min={f.key === "rating" ? "1" : undefined} max={f.key === "rating" ? "5" : undefined}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 5 }}>النوع</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)" }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer" }}>إلغاء</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "hsl(340 70% 55%)", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
