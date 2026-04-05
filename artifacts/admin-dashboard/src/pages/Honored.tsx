import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type HonoredPerson = {
  id: number; name: string; title?: string; city_role?: string;
  photo_url?: string; tribute?: string;
  start_date?: string; end_date?: string; is_visible: boolean;
  created_at: string;
};

const EMPTY = { name: "", title: "", city_role: "", photo_url: "", tribute: "", start_date: "", end_date: "", is_visible: true };

export default function Honored() {
  const [list,     setList]     = useState<HonoredPerson[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState<typeof EMPTY>({ ...EMPTY });
  const [editing,  setEditing]  = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<any>("/admin/honored-figures");
      setList(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };

  const openEdit = (p: HonoredPerson) => {
    setEditing(p.id);
    setForm({
      name: p.name || "", title: p.title || "", city_role: p.city_role || "",
      photo_url: p.photo_url || "", tribute: p.tribute || "",
      start_date: p.start_date?.slice(0, 10) || "", end_date: p.end_date?.slice(0, 10) || "",
      is_visible: p.is_visible,
    });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = editing !== null
        ? await apiFetch(`/admin/honored-figures/${editing}`, { method: "PATCH", body: JSON.stringify(form) })
        : await apiFetch("/admin/honored-figures", { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); alert(d.error || "فشل الحفظ"); }
      else { setShowForm(false); load(); }
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذه الشخصية؟")) return;
    await apiFetch(`/admin/honored-figures/${id}`, { method: "DELETE" });
    setList(prev => prev.filter(p => p.id !== id));
  };

  const toggleVisible = async (p: HonoredPerson) => {
    await apiFetch(`/admin/honored-figures/${p.id}/visibility`, { method: "PATCH", body: JSON.stringify({ is_visible: !p.is_visible }) });
    setList(prev => prev.map(x => x.id === p.id ? { ...x, is_visible: !p.is_visible } : x));
  };

  return (
    <div>
      <PageHeader
        title="قاعة التكريم"
        subtitle={`${list.length} شخصية مكرّمة`}
        action={<button className="btn-primary" onClick={openNew}>+ إضافة شخصية</button>}
      />

      {showForm && (
        <div style={{ padding: "0 28px 20px" }}>
          <div style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(217 32% 14%)", borderRadius: 16, padding: 24, maxWidth: 700 }}>
            <h3 style={{ color: "hsl(210 40% 90%)", fontWeight: 700, marginBottom: 18, fontSize: 15 }}>
              {editing ? "تعديل الشخصية" : "إضافة شخصية جديدة"}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              {[
                { key: "name",      label: "الاسم الكامل *" },
                { key: "title",     label: "اللقب / المسمى" },
                { key: "city_role", label: "دوره في المدينة" },
                { key: "photo_url", label: "رابط الصورة" },
                { key: "start_date",label: "تاريخ البداية", type: "date" },
                { key: "end_date",  label: "تاريخ النهاية", type: "date" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: "hsl(215 20% 60%)", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input
                    className="input-field" type={f.type || "text"}
                    value={(form as any)[f.key] || ""}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "hsl(215 20% 60%)", display: "block", marginBottom: 4 }}>نبذة / تكريم</label>
              <textarea className="input-field" rows={3} value={form.tribute}
                onChange={e => setForm(p => ({ ...p, tribute: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <input type="checkbox" id="is_visible" checked={form.is_visible}
                onChange={e => setForm(p => ({ ...p, is_visible: e.target.checked }))} />
              <label htmlFor="is_visible" style={{ color: "hsl(210 40% 80%)", fontSize: 13, cursor: "pointer" }}>مرئي للمستخدمين</label>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid hsl(217 32% 17%)", background: "transparent", color: "hsl(215 20% 60%)", cursor: "pointer", fontFamily: "inherit" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 28px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>جارٍ التحميل...</p>
        ) : list.length === 0 ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0" }}>لا توجد شخصيات مكرّمة بعد</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
            {list.map(p => (
              <div key={p.id} className="card" style={{ padding: 18, opacity: p.is_visible ? 1 : 0.55 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: p.photo_url ? `url(${p.photo_url}) center/cover` : "hsl(147 60% 42% / 0.12)",
                    border: "1px solid hsl(147 60% 42% / 0.2)",
                    display: p.photo_url ? "block" : "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  }}>{!p.photo_url ? "🌟" : ""}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "hsl(210 40% 93%)", marginBottom: 2 }}>{p.name}</div>
                    {p.title && <div style={{ fontSize: 12, color: "hsl(147 60% 52%)" }}>{p.title}</div>}
                    {p.city_role && <div style={{ fontSize: 11, color: "hsl(215 20% 55%)" }}>{p.city_role}</div>}
                    {!p.is_visible && <span className="badge-red" style={{ fontSize: 10, marginTop: 4 }}>مخفي</span>}
                  </div>
                </div>
                {p.tribute && <p style={{ fontSize: 12, color: "hsl(215 20% 60%)", lineHeight: 1.5, margin: "10px 0 0" }}>{p.tribute.slice(0,120)}{p.tribute.length>120?"...":""}</p>}
                <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                  <button onClick={() => openEdit(p)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid hsl(217 32% 20%)", background: "hsl(217 32% 15%)", color: "hsl(210 40% 80%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                    تعديل
                  </button>
                  <button onClick={() => toggleVisible(p)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid hsl(38 90% 50% / 0.3)", background: "hsl(38 90% 50% / 0.1)", color: "hsl(38 90% 60%)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                    {p.is_visible ? "إخفاء" : "إظهار"}
                  </button>
                  <button className="btn-danger" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => remove(p.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
