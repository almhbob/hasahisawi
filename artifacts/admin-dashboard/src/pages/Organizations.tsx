import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Org = {
  id: number;
  name: string;
  type: string;
  description: string;
  full_description?: string;
  contact_phone: string;
  email?: string;
  members_count: number;
  founded_year?: string;
  goals: string[];
  needs: string[];
  rating: number;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  charity: "جمعية خيرية", initiative: "مبادرة شبابية",
  cooperative: "تعاونية", volunteer: "فريق تطوعي",
};
const EMPTY = {
  name: "", type: "initiative", description: "", full_description: "",
  contact_phone: "", email: "", members_count: 0, founded_year: "",
  goals: "", needs: "", rating: 5.0, is_verified: false,
};

export default function Organizations() {
  const [list,     setList]     = useState<Org[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<number | null>(null);
  const [form,     setForm]     = useState<typeof EMPTY>({ ...EMPTY });
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ organizations: Org[] }>("/admin/organizations");
      setList((data as any).organizations ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };

  const openEdit = (org: Org) => {
    setEditing(org.id);
    setForm({
      name: org.name, type: org.type, description: org.description,
      full_description: org.full_description || "", contact_phone: org.contact_phone,
      email: org.email || "", members_count: org.members_count,
      founded_year: org.founded_year || "", goals: (org.goals || []).join("، "),
      needs: (org.needs || []).join("، "), rating: org.rating, is_verified: org.is_verified,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.contact_phone.trim()) return alert("الاسم والهاتف مطلوبان");
    setSaving(true);
    try {
      const body = {
        ...form,
        goals: form.goals.split(/[،,]/).map(s => s.trim()).filter(Boolean),
        needs: form.needs.split(/[،,]/).map(s => s.trim()).filter(Boolean),
        members_count: Number(form.members_count),
      };
      if (editing !== null) {
        const updated = await apiJson<Org>(`/admin/organizations/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
        setList(prev => prev.map(o => o.id === editing ? updated : o));
      } else {
        const created = await apiJson<Org>("/admin/organizations", { method: "POST", body: JSON.stringify(body) });
        setList(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { alert("حدث خطأ أثناء الحفظ"); }
    setSaving(false);
  };

  const deleteOrg = async (id: number) => {
    if (!confirm("حذف هذه المنظمة؟")) return;
    try {
      await apiFetch(`/admin/organizations/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(o => o.id !== id));
    } catch {}
  };

  const toggleActive = async (org: Org) => {
    try {
      const updated = await apiJson<Org>(`/admin/organizations/${org.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !org.is_active }),
      });
      setList(prev => prev.map(o => o.id === org.id ? updated : o));
    } catch {}
  };

  const activeCount = list.filter(o => o.is_active).length;

  return (
    <div>
      <PageHeader title="المنظمات المجتمعية" subtitle="إدارة الجمعيات والمبادرات والتعاونيات" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "إجمالي المنظمات", value: list.length, color: "hsl(215 50% 60%)" },
          { label: "نشطة", value: activeCount, color: "hsl(147 60% 42%)" },
          { label: "موقوفة", value: list.length - activeCount, color: "hsl(0 70% 55%)" },
        ].map(s => (
          <div key={s.label} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={openNew} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "hsl(147 60% 42%)", color: "#000", fontWeight: 700, cursor: "pointer" }}>
          + إضافة منظمة
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(org => (
            <div key={org.id} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px", opacity: org.is_active ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{org.name}</span>
                    {org.is_verified && <span style={{ fontSize: 11, background: "hsl(215 50% 50% / 0.2)", color: "hsl(215 70% 65%)", padding: "2px 8px", borderRadius: 6 }}>✓ موثّقة</span>}
                    <span style={{ fontSize: 11, background: "hsl(217 32% 14%)", color: "hsl(215 20% 65%)", padding: "2px 8px", borderRadius: 6 }}>{TYPE_LABELS[org.type] || org.type}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>{org.description}</div>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 4 }}>
                    📞 {org.contact_phone} &nbsp;|&nbsp; 👥 {org.members_count} عضو &nbsp;|&nbsp; ⭐ {org.rating}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleActive(org)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 12%)", color: "hsl(215 20% 65%)", cursor: "pointer", fontSize: 12 }}>
                    {org.is_active ? "⏸ توقيف" : "▶ تفعيل"}
                  </button>
                  <button onClick={() => openEdit(org)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(38 90% 55% / 0.4)", background: "hsl(38 90% 55% / 0.12)", color: "hsl(38 90% 55%)", cursor: "pointer", fontSize: 12 }}>
                    ✏️
                  </button>
                  <button onClick={() => deleteOrg(org.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(0 70% 55% / 0.4)", background: "hsl(0 70% 55% / 0.12)", color: "hsl(0 70% 55%)", cursor: "pointer", fontSize: 12 }}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 18 }}>{editing !== null ? "تعديل منظمة" : "إضافة منظمة جديدة"}</h2>
            {[
              { label: "الاسم *", key: "name", type: "text" },
              { label: "هاتف التواصل *", key: "contact_phone", type: "text" },
              { label: "البريد الإلكتروني", key: "email", type: "email" },
              { label: "عدد الأعضاء", key: "members_count", type: "number" },
              { label: "سنة التأسيس", key: "founded_year", type: "text" },
              { label: "تقييم (1-5)", key: "rating", type: "number" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 6 }}>{f.label}</label>
                <input
                  type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 6 }}>النوع</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14 }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {[
              { label: "الوصف المختصر", key: "description" },
              { label: "الوصف الكامل", key: "full_description" },
              { label: "الأهداف (مفصولة بفاصلة)", key: "goals" },
              { label: "الاحتياجات (مفصولة بفاصلة)", key: "needs" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 6 }}>{f.label}</label>
                <textarea value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </div>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 20 }}>
              <input type="checkbox" checked={form.is_verified} onChange={e => setForm(p => ({ ...p, is_verified: e.target.checked }))} />
              <span style={{ color: "hsl(215 20% 65%)", fontSize: 14 }}>منظمة موثّقة</span>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer" }}>إلغاء</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "hsl(147 60% 42%)", color: "#000", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
