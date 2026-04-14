import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type EmergencyNumber = {
  id: number;
  name: string;
  number: string;
  category: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

const CATEGORIES = [
  { value: "emergency",   label: "طوارئ",          icon: "🚨" },
  { value: "police",      label: "شرطة",            icon: "🚔" },
  { value: "fire",        label: "إطفاء",           icon: "🚒" },
  { value: "ambulance",   label: "إسعاف",           icon: "🚑" },
  { value: "hospital",    label: "مستشفى",          icon: "🏥" },
  { value: "electricity", label: "كهرباء",          icon: "⚡" },
  { value: "water",       label: "مياه",            icon: "💧" },
  { value: "municipal",   label: "بلدية",           icon: "🏛️" },
  { value: "social",      label: "اجتماعي",         icon: "🤝" },
  { value: "other",       label: "أخرى",            icon: "📞" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const EMPTY = {
  name: "",
  number: "",
  category: "other",
  description: "",
  is_active: true,
  sort_order: 0,
};

export default function Numbers() {
  const [list,     setList]     = useState<EmergencyNumber[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState<typeof EMPTY>({ ...EMPTY });
  const [editing,  setEditing]  = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [filterCat,setFilterCat]= useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ numbers: EmergencyNumber[] } | EmergencyNumber[]>("/emergency-numbers");
      const arr = Array.isArray(data) ? data : (data as any).numbers ?? [];
      setList(arr.sort((a: EmergencyNumber, b: EmergencyNumber) => a.sort_order - b.sort_order));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uniqueCategories = [...new Set(list.map(n => n.category))];
  const filtered = filterCat === "all" ? list : list.filter(n => n.category === filterCat);
  const activeCount = list.filter(n => n.is_active).length;

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: list.length });
    setShowForm(true);
  };

  const openEdit = (n: EmergencyNumber) => {
    setEditing(n.id);
    setForm({
      name: n.name || "",
      number: n.number || "",
      category: n.category || "other",
      description: n.description || "",
      is_active: n.is_active,
      sort_order: n.sort_order ?? 0,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.number.trim()) {
      alert("الاسم والرقم مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        description: form.description || undefined,
      };
      const res = editing !== null
        ? await apiFetch(`/admin/emergency-numbers/${editing}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiFetch("/admin/emergency-numbers", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert((d as any).error || "فشل الحفظ");
      } else {
        setShowForm(false);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا الرقم نهائياً؟")) return;
    const res = await apiFetch(`/admin/emergency-numbers/${id}`, { method: "DELETE" });
    if (res.ok) setList(prev => prev.filter(n => n.id !== id));
    else alert("فشل الحذف");
  };

  const toggleActive = async (n: EmergencyNumber) => {
    const res = await apiFetch(`/admin/emergency-numbers/${n.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !n.is_active }),
    });
    if (res.ok) setList(prev => prev.map(x => x.id === n.id ? { ...x, is_active: !n.is_active } : x));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "hsl(217 32% 12%)", border: "1px solid hsl(217 32% 18%)",
    color: "hsl(210 40% 95%)", fontSize: 14,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 5, fontWeight: 600,
  };

  return (
    <div>
      <PageHeader
        title="الأرقام المهمة"
        subtitle={`${list.length} رقم · ${activeCount} نشط`}
        action={<button className="btn-primary" onClick={openNew}>+ إضافة رقم</button>}
      />

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterCat("all")}
          style={{
            padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: "1px solid",
            borderColor: filterCat === "all" ? "#F97316" : "hsl(217 32% 18%)",
            background: filterCat === "all" ? "hsl(24 95% 53% / 0.12)" : "transparent",
            color: filterCat === "all" ? "#F97316" : "hsl(215 20% 55%)",
          }}
        >الكل ({list.length})</button>
        {uniqueCategories.map(cat => {
          const info = CATEGORY_MAP[cat];
          const count = list.filter(n => n.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: "1px solid",
                borderColor: filterCat === cat ? "#F97316" : "hsl(217 32% 18%)",
                background: filterCat === cat ? "hsl(24 95% 53% / 0.12)" : "transparent",
                color: filterCat === cat ? "#F97316" : "hsl(215 20% 55%)",
              }}
            >{info?.icon ?? "📞"} {info?.label ?? cat} ({count})</button>
          );
        })}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 50, padding: 20,
        }}>
          <div style={{
            background: "hsl(222 47% 9%)", borderRadius: 16, padding: 28,
            width: "100%", maxWidth: 500, border: "1px solid hsl(217 32% 14%)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <h3 style={{ margin: "0 0 20px", color: "hsl(210 40% 95%)", fontSize: 17, fontWeight: 700 }}>
              {editing !== null ? "تعديل الرقم" : "إضافة رقم مهم"}
            </h3>
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>اسم الجهة *</label>
                  <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: شرطة الحصاحيصا" />
                </div>
                <div>
                  <label style={labelStyle}>الرقم *</label>
                  <input style={inputStyle} value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} placeholder="09xxxxxxxx" dir="ltr" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>التصنيف</label>
                <select style={inputStyle} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>الوصف (اختياري)</label>
                <input style={inputStyle} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="ملاحظة إضافية..." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>الترتيب</label>
                  <input type="number" style={inputStyle} value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                  <label htmlFor="is_active" style={{ color: "hsl(210 40% 95%)", fontSize: 14, cursor: "pointer" }}>نشط</label>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{
                padding: "8px 20px", borderRadius: 8, border: "1px solid hsl(217 32% 18%)",
                background: "transparent", color: "hsl(215 20% 55%)", cursor: "pointer",
              }}>إلغاء</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "hsl(215 20% 55%)" }}>جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
          <div>لا توجد أرقام</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map(n => {
            const catInfo = CATEGORY_MAP[n.category];
            return (
              <div key={n.id} style={{
                background: "hsl(217 32% 10%)", borderRadius: 12, padding: "16px 18px",
                border: `1px solid ${n.is_active ? "hsl(217 32% 14%)" : "hsl(217 32% 10%)"}`,
                opacity: n.is_active ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 24 }}>{catInfo?.icon ?? "📞"}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: "hsl(210 40% 95%)", fontSize: 15 }}>{n.name}</div>
                      <div style={{ fontSize: 12, color: "hsl(215 20% 50%)" }}>{catInfo?.label ?? n.category}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={() => toggleActive(n)} title={n.is_active ? "إيقاف" : "تفعيل"} style={{
                      padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                      border: "1px solid",
                      borderColor: n.is_active ? "hsl(147 60% 42% / 0.4)" : "hsl(217 32% 22%)",
                      background: n.is_active ? "hsl(147 60% 42% / 0.1)" : "hsl(217 32% 14%)",
                      color: n.is_active ? "#3EFF9C" : "hsl(215 20% 55%)",
                    }}>{n.is_active ? "نشط" : "موقوف"}</button>
                    <button onClick={() => openEdit(n)} style={{
                      padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                      border: "1px solid hsl(217 32% 22%)", background: "hsl(217 32% 14%)", color: "hsl(215 20% 65%)",
                    }}>✏️</button>
                    <button onClick={() => remove(n.id)} style={{
                      padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                      border: "1px solid hsl(0 72% 55% / 0.3)", background: "hsl(0 72% 55% / 0.08)", color: "#f87171",
                    }}>🗑</button>
                  </div>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: "#F97316",
                  letterSpacing: 1, marginBottom: 4, direction: "ltr", textAlign: "right",
                }}>{n.number}</div>
                {n.description && (
                  <div style={{ fontSize: 12, color: "hsl(215 20% 45%)" }}>{n.description}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
