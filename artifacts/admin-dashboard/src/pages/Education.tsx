import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Institution = {
  id: number;
  name: string;
  type: string;
  address: string;
  phone: string;
  principal?: string;
  email?: string;
  website?: string;
  description?: string;
  grades?: string;
  shifts?: string;
  services: string[];
  status: string;
  is_active: boolean;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  primary: "أساسي", secondary: "ثانوي", kindergarten: "رياض أطفال",
  university: "جامعي", institute: "معهد", training: "تدريب",
  quran: "قرآن كريم", private: "خاص", other: "أخرى",
};
const SVC_LABELS: Record<string, string> = {
  results: "نتائج", enrollment: "تسجيل", transfer: "نقل", library: "مكتبة",
  tutoring: "دروس خاصة", scholarship: "منح", activity: "أنشطة", textbooks: "كتب",
  guidance: "إرشاد", exam: "امتحانات", transport: "مواصلات", office: "مكتبة",
  quran: "حفظ قرآن", training: "تدريب",
};
const EMPTY = {
  name: "", type: "primary", address: "", phone: "", principal: "",
  email: "", website: "", description: "", grades: "", shifts: "",
  services: [] as string[], status: "active",
};

export default function Education() {
  const [list,    setList]    = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form,    setForm]    = useState<typeof EMPTY>({ ...EMPTY });
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ institutions: Institution[] }>("/admin/educational-institutions");
      setList((data as any).institutions ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY }); setShowForm(true); };

  const openEdit = (inst: Institution) => {
    setEditing(inst.id);
    setForm({
      name: inst.name, type: inst.type, address: inst.address, phone: inst.phone,
      principal: inst.principal || "", email: inst.email || "", website: inst.website || "",
      description: inst.description || "", grades: inst.grades || "", shifts: inst.shifts || "",
      services: inst.services || [], status: inst.status || "active",
    });
    setShowForm(true);
  };

  const toggleSvc = (s: string) => {
    setForm(p => ({
      ...p,
      services: p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s],
    }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) return alert("الاسم والهاتف مطلوبان");
    setSaving(true);
    try {
      if (editing !== null) {
        const updated = await apiJson<Institution>(`/admin/educational-institutions/${editing}`, { method: "PATCH", body: JSON.stringify(form) });
        setList(prev => prev.map(i => i.id === editing ? updated : i));
      } else {
        const created = await apiJson<Institution>("/admin/educational-institutions", { method: "POST", body: JSON.stringify(form) });
        setList(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { alert("حدث خطأ أثناء الحفظ"); }
    setSaving(false);
  };

  const deleteInst = async (id: number) => {
    if (!confirm("حذف هذه المؤسسة؟")) return;
    try {
      await apiFetch(`/admin/educational-institutions/${id}`, { method: "DELETE" });
      setList(prev => prev.filter(i => i.id !== id));
    } catch {}
  };

  const toggleActive = async (inst: Institution) => {
    try {
      const updated = await apiJson<Institution>(`/admin/educational-institutions/${inst.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !inst.is_active }),
      });
      setList(prev => prev.map(i => i.id === inst.id ? updated : i));
    } catch {}
  };

  return (
    <div>
      <PageHeader title="المؤسسات التعليمية" subtitle="إدارة المدارس والمعاهد والروضات" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "إجمالي المؤسسات", value: list.length, color: "hsl(215 50% 60%)" },
          { label: "نشطة", value: list.filter(i => i.is_active).length, color: "hsl(147 60% 42%)" },
          { label: "موقوفة", value: list.filter(i => !i.is_active).length, color: "hsl(0 70% 55%)" },
        ].map(s => (
          <div key={s.label} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <button onClick={openNew} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "hsl(147 60% 42%)", color: "#000", fontWeight: 700, cursor: "pointer" }}>
          + إضافة مؤسسة
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(inst => (
            <div key={inst.id} style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 12, padding: "16px 20px", opacity: inst.is_active ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(210 40% 95%)" }}>{inst.name}</span>
                    <span style={{ fontSize: 11, background: "hsl(217 32% 14%)", color: "hsl(215 20% 65%)", padding: "2px 8px", borderRadius: 6 }}>{TYPE_LABELS[inst.type] || inst.type}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>📍 {inst.address} &nbsp;|&nbsp; 📞 {inst.phone}</div>
                  {inst.principal && <div style={{ fontSize: 12, color: "hsl(215 20% 45%)", marginTop: 2 }}>👤 {inst.principal}</div>}
                  {inst.services?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {inst.services.slice(0, 5).map(s => (
                        <span key={s} style={{ fontSize: 11, background: "hsl(215 50% 50% / 0.12)", color: "hsl(215 60% 65%)", padding: "2px 8px", borderRadius: 6 }}>{SVC_LABELS[s] || s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleActive(inst)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "hsl(222 47% 12%)", color: "hsl(215 20% 65%)", cursor: "pointer", fontSize: 12 }}>
                    {inst.is_active ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => openEdit(inst)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(38 90% 55% / 0.4)", background: "hsl(38 90% 55% / 0.12)", color: "hsl(38 90% 55%)", cursor: "pointer", fontSize: 12 }}>✏️</button>
                  <button onClick={() => deleteInst(inst.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid hsl(0 70% 55% / 0.4)", background: "hsl(0 70% 55% / 0.12)", color: "hsl(0 70% 55%)", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "hsl(222 47% 9%)", border: "1px solid hsl(217 32% 16%)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 18 }}>{editing !== null ? "تعديل مؤسسة" : "إضافة مؤسسة"}</h2>
            {[
              { label: "الاسم *", key: "name" }, { label: "الهاتف *", key: "phone" },
              { label: "العنوان *", key: "address" }, { label: "المدير / الناظر", key: "principal" },
              { label: "البريد الإلكتروني", key: "email" }, { label: "الموقع الإلكتروني", key: "website" },
              { label: "الصفوف (مثل: 1-8)", key: "grades" }, { label: "الفترات (صباحي/مسائي)", key: "shifts" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 5 }}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 5 }}>النوع</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 16%)", background: "hsl(222 47% 6%)", color: "hsl(210 40% 95%)" }}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, color: "hsl(215 20% 55%)", marginBottom: 6 }}>الخدمات</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(SVC_LABELS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => toggleSvc(k)}
                    style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${form.services.includes(k) ? "hsl(147 60% 42%)" : "hsl(217 32% 14%)"}`, background: form.services.includes(k) ? "hsl(147 60% 42% / 0.2)" : "transparent", color: form.services.includes(k) ? "hsl(147 60% 42%)" : "hsl(215 20% 55%)", cursor: "pointer", fontSize: 12 }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
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
